using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CalendarAPI.Services;
using CalendarAPI.Hubs;
using Microsoft.AspNetCore.SignalR;

[ApiController]
[Route("api/calendars")]
[Authorize]
public class CalendarsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<CalendarHub> _hub;
    private readonly IClaimsService _claimsService;
    private string UserId => _claimsService.GetUserId() ?? throw new UnauthorizedAccessException();
    private string? UserEmail => _claimsService.GetUserEmail();

    public CalendarsController(AppDbContext db, IClaimsService claimsService, IHubContext<CalendarHub> hub)
    {
        _db = db;
        _claimsService = claimsService;
        _hub = hub;
    }

    // GET /api/calendars   -> every calendar I'm in, with my role
    [HttpGet]
    public async Task<IActionResult> GetMyCalendars()
    {
        var calendars = await _db.CalendarMembers
            .Where(m => m.UserId == UserId)
            .Join(_db.Calendars, m => m.CalendarId, c => c.CalendarId, (m, c) =>
                new { Id = c.CalendarId, c.Name, c.OwnerUserId, m.Role })
            .ToListAsync();

        if (calendars.Count == 0)
        {
            var cal = await CreateCalendarForMe("My Calendar");
            return Ok(new[] { ToDto(cal, CalendarRole.Owner) });
        }

        return Ok(calendars.Select(c => new { c.Id, c.Name, c.OwnerUserId, Role = c.Role.ToString() }));
    }

    // POST /api/calendars   -> create a calendar; I become its Owner
    [HttpPost]
    public async Task<IActionResult> CreateCalendar([FromBody] CreateCalendarDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { error = "name is required" });
        var cal = await CreateCalendarForMe(dto.Name.Trim());
        return Ok(ToDto(cal, CalendarRole.Owner));
    }

    // GET /api/calendars/{id}/members
    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        if (await MyRoleAsync(id) == null) return Forbid();

        var members = await _db.CalendarMembers
            .Where(m => m.CalendarId == id)
            .OrderBy(m => m.JoinedAt)
            .Select(m => new { m.UserId, m.Email, m.Role, m.JoinedAt })
            .ToListAsync();
        return Ok(members.Select(m => new { m.UserId, m.Email, Role = m.Role.ToString(), m.JoinedAt }));
    }

    // PATCH /api/calendars/{id}/members/{userId}   body: { "role": "Editor" }   (Owner only)
    [HttpPatch("{id:guid}/members/{userId}")]
    public async Task<IActionResult> SetMemberRole(Guid id, string userId, [FromBody] SetRoleDto dto)
    {
        if (await MyRoleAsync(id) != CalendarRole.Owner) return Forbid();
        if (ParseAssignableRole(dto.Role) is not { } role)
            return BadRequest(new { error = "role must be Editor or Viewer" });

        var member = await _db.CalendarMembers
            .FirstOrDefaultAsync(m => m.CalendarId == id && m.UserId == userId);
        if (member == null) return NotFound();
        if (member.Role == CalendarRole.Owner) return BadRequest(new { error = "The owner's role can't be changed" });

        member.Role = role;
        await _db.SaveChangesAsync();
        return Ok(new { member.UserId, member.Email, Role = member.Role.ToString() });
    }

    // POST /api/calendars/{id}/invites   (Owners and Editors)
    [HttpPost("{id:guid}/invites")]
    public async Task<IActionResult> CreateInvite(Guid id, [FromBody] CreateInviteDto dto)
    {
        var myRole = await MyRoleAsync(id);
        if (myRole is null or CalendarRole.Viewer) return Forbid();
        if (ParseAssignableRole(dto.Role) is not { } role)
            return BadRequest(new { error = "role must be Editor or Viewer" });

        var invite = new CalendarInvite
        {
            CalendarId = id,
            InviteeEmail = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim().ToLowerInvariant(),
            Role = role,
            CreatedByUserId = UserId,
            ExpiresAt = dto.ExpiresInDays is > 0 ? DateTime.UtcNow.AddDays(dto.ExpiresInDays.Value) : null
        };
        _db.CalendarInvites.Add(invite);
        await _db.SaveChangesAsync();

        return Ok(new { Id = invite.CalendarInviteId, invite.Code, invite.InviteeEmail, Role = invite.Role.ToString(), invite.ExpiresAt });
    }

    // POST /api/calendars/join   body: { "code": "..." }
    [HttpPost("join")]
    public async Task<IActionResult> JoinCalendar([FromBody] JoinCalendarDto dto)
    {
        var invite = await _db.CalendarInvites.FirstOrDefaultAsync(i => i.Code == dto.Code.Trim());
        if (invite == null) return NotFound(new { error = "Invite not found" });
        if (invite.ExpiresAt is { } exp && exp < DateTime.UtcNow)
            return BadRequest(new { error = "Invite expired" });
        if (invite.InviteeEmail != null &&
            !string.Equals(invite.InviteeEmail, UserEmail, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var member = await _db.CalendarMembers
            .FirstOrDefaultAsync(m => m.CalendarId == invite.CalendarId && m.UserId == UserId);
        if (member == null)
        {
            member = new CalendarMember { CalendarId = invite.CalendarId, UserId = UserId, Email = UserEmail, Role = invite.Role };
            _db.CalendarMembers.Add(member);
        }

        invite.RedeemedAt ??= DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var calendar = await _db.Calendars.FindAsync(invite.CalendarId);
        if (calendar == null) return NotFound(new { error = "Calendar no longer exists" });
        return Ok(ToDto(calendar, member.Role));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> RenameCalendar(Guid id, [FromBody] RenameCalendarDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { error = "name is required" });
        if (await MyRoleAsync(id) != CalendarRole.Owner) return Forbid();

        var cal = await _db.Calendars.FindAsync(id);
        if (cal == null) return NotFound();

        cal.Name = dto.Name.Trim();
        await _db.SaveChangesAsync();

        await _hub.Clients.Group(CalendarHub.GroupName(id))
            .SendAsync("calendarRenamed", new { Id = id, cal.Name });
        return Ok(ToDto(cal, CalendarRole.Owner));
    }

    // DELETE /api/calendars/{id}   (Owner only)
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteCalendar(Guid id)
    {
        if (await MyRoleAsync(id) != CalendarRole.Owner) return Forbid();

        // DB cascade removes members, invites, events, and attendees
        var deleted = await _db.Calendars.Where(c => c.CalendarId == id).ExecuteDeleteAsync();
        if (deleted == 0) return NotFound();

        await _hub.Clients.Group(CalendarHub.GroupName(id)).SendAsync("calendarDeleted", id);
        return Ok(new { success = true });
    }

    private async Task<Calendar> CreateCalendarForMe(string name)
    {
        var cal = new Calendar { Name = name, OwnerUserId = UserId };
        _db.Calendars.Add(cal);
        _db.CalendarMembers.Add(new CalendarMember { CalendarId = cal.CalendarId, UserId = UserId, Email = UserEmail, Role = CalendarRole.Owner });
        await _db.SaveChangesAsync();
        return cal;
    }

    private static object ToDto(Calendar c, CalendarRole myRole) =>
        new { Id = c.CalendarId, c.Name, c.OwnerUserId, Role = myRole.ToString() };

    private async Task<CalendarRole?> MyRoleAsync(Guid calendarId) =>
        await _db.CalendarMembers
            .Where(m => m.CalendarId == calendarId && m.UserId == UserId)
            .Select(m => (CalendarRole?)m.Role)
            .FirstOrDefaultAsync();

    private static CalendarRole? ParseAssignableRole(string? value) =>
        value?.Trim().ToLowerInvariant() switch
        {
            "editor" => CalendarRole.Editor,
            "viewer" => CalendarRole.Viewer,
            _ => null
        };
}