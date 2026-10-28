using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CalendarAPI.Services;

[ApiController]
[Route("api/calendars")]
[Authorize]
public class CalendarsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IClaimsService _claimsService;
    private string UserId => _claimsService.GetUserId() ?? throw new UnauthorizedAccessException();
    private string? UserEmail => _claimsService.GetUserEmail();

    public CalendarsController(AppDbContext db, IClaimsService claimsService)
    {
        _db = db;
        _claimsService = claimsService;
    }

    // GET /api/calendars
    [HttpGet]
    public async Task<IActionResult> GetMyCalendars()
    {
        var calendars = await _db.CalendarMembers
            .Where(m => m.UserId == UserId)
            .Join(_db.Calendars, m => m.CalendarId, c => c.Id, (m, c) =>
                new { c.Id, c.Name, c.OwnerUserId, Role = m.Role.ToString() })
            .ToListAsync();

        // First-time users get a default personal calendar automatically
        if (calendars.Count == 0)
        {
            var cal = new Calendar { Name = "My Calendar", OwnerUserId = UserId };
            _db.Calendars.Add(cal);
            _db.CalendarMembers.Add(new CalendarMember
            {
                CalendarId = cal.Id,
                UserId = UserId,
                Email = UserEmail,
                Role = CalendarRole.Owner
            });
            await _db.SaveChangesAsync();
            return Ok(new[] { new { cal.Id, cal.Name, cal.OwnerUserId, Role = "Owner" } });
        }

        return Ok(calendars);
    }

    // POST /api/calendars
    [HttpPost]
    public async Task<IActionResult> CreateCalendar([FromBody] CreateCalendarDto dto)
    {
        var calendar = new Calendar { Name = dto.Name, OwnerUserId = UserId };
        _db.Calendars.Add(calendar);
        _db.CalendarMembers.Add(new CalendarMember
        {
            CalendarId = calendar.Id,
            UserId = UserId,
            Email = UserEmail,
            Role = CalendarRole.Owner
        });
        await _db.SaveChangesAsync();
        return Ok(calendar);
    }

    // GET /api/calendars/{id}/members
    [HttpGet("{id}/members")]
    public async Task<IActionResult> GetMembers(string id)
    {
        if (!await IsMemberAsync(id)) return Forbid();
        var members = await _db.CalendarMembers
            .Where(m => m.CalendarId == id)
            .Select(m => new { m.UserId, m.Email, Role = m.Role.ToString() })
            .ToListAsync();
        return Ok(members);
    }

    // POST /api/calendars/{id}/invites
    [HttpPost("{id}/invites")]
    public async Task<IActionResult> CreateInvite(string id, [FromBody] CreateInviteDto dto)
    {
        if (!await IsMemberAsync(id, requireEditorOrOwner: true)) return Forbid();

        var invite = new CalendarInvite
        {
            CalendarId = id,
            InviteeEmail = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim().ToLowerInvariant(),
            Role = Enum.TryParse<CalendarRole>(dto.Role, true, out var r) ? r : CalendarRole.Editor,
            CreatedByUserId = UserId,
            ExpiresAt = dto.ExpiresInDays.HasValue ? DateTime.UtcNow.AddDays(dto.ExpiresInDays.Value) : null
        };
        _db.CalendarInvites.Add(invite);
        await _db.SaveChangesAsync();

        return Ok(new { invite.Id, invite.Code, InviteeEmail = invite.InviteeEmail, Role = invite.Role.ToString(), invite.ExpiresAt });
    }

    // POST /api/calendars/join
    [HttpPost("join")]
    public async Task<IActionResult> JoinCalendar([FromBody] JoinCalendarDto dto)
    {
        var invite = await _db.CalendarInvites.FirstOrDefaultAsync(i => i.Code == dto.Code);
        if (invite == null) return NotFound(new { error = "Invite not found" });
        if (invite.ExpiresAt is { } exp && exp < DateTime.UtcNow)
            return BadRequest(new { error = "Invite expired" });
        if (invite.InviteeEmail != null &&
            !string.Equals(invite.InviteeEmail, UserEmail, StringComparison.OrdinalIgnoreCase))
            return Forbid(); // invite was targeted at a different email

        var existing = await _db.CalendarMembers
            .FirstOrDefaultAsync(m => m.CalendarId == invite.CalendarId && m.UserId == UserId);
        if (existing == null)
        {
            _db.CalendarMembers.Add(new CalendarMember
            {
                CalendarId = invite.CalendarId,
                UserId = UserId,
                Email = UserEmail,
                Role = invite.Role
            });
        }

        invite.Redeemed = true;
        await _db.SaveChangesAsync();

        var calendar = await _db.Calendars.FindAsync(invite.CalendarId);
        return Ok(calendar);
    }

    private async Task<bool> IsMemberAsync(string calendarId, bool requireEditorOrOwner = false)
    {
        var m = await _db.CalendarMembers
            .FirstOrDefaultAsync(x => x.CalendarId == calendarId && x.UserId == UserId);
        if (m == null) return false;
        if (requireEditorOrOwner && m.Role == CalendarRole.Viewer) return false;
        return true;
    }
}