using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CalendarAPI.Services;
using CalendarAPI.Hubs;
using Microsoft.AspNetCore.SignalR;
using System.Net;
using System.Net.Mail;

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
    private readonly IEmailSender _emailSender;
    private readonly IConfiguration _config;

    public CalendarsController(AppDbContext db, IClaimsService claimsService, IHubContext<CalendarHub> hub,
        IEmailSender emailSender, IConfiguration config)
    {
        _db = db;
        _claimsService = claimsService;
        _hub = hub;
        _emailSender = emailSender;
        _config = config;
    }

    // GET /api/calendars   -> every calendar I'm in, with my role, most recently used first
    // ("used" = last opened, or when I joined if I haven't opened it yet)
    [HttpGet]
    public async Task<IActionResult> GetMyCalendars()
    {
        var calendars = await _db.CalendarMembers
            .Where(m => m.UserId == UserId)
            .Join(_db.Calendars, m => m.CalendarId, c => c.CalendarId, (m, c) =>
                new { Id = c.CalendarId, c.Name, c.OwnerUserId, m.Role, LastUsedAt = m.LastOpenedAt ?? m.JoinedAt })
            .ToListAsync();

        return Ok(calendars
            .OrderByDescending(c => c.LastUsedAt)
            .Select(c => new { c.Id, c.Name, c.OwnerUserId, Role = c.Role.ToString(), c.LastUsedAt }));
    }

    // POST /api/calendars/{id}/opened   -> remember that I just opened this calendar
    [HttpPost("{id:guid}/opened")]
    public async Task<IActionResult> MarkOpened(Guid id)
    {
        var member = await _db.CalendarMembers
            .FirstOrDefaultAsync(m => m.CalendarId == id && m.UserId == UserId);
        if (member == null) return Forbid();

        member.LastOpenedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
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

        // Previous members query, before including display names.
        /*
        var members = await _db.CalendarMembers
            .Where(m => m.CalendarId == id)
            .OrderBy(m => m.JoinedAt)
            .Select(m => new { m.UserId, m.Email, m.Role, m.JoinedAt })
            .ToListAsync();
        return Ok(members.Select(m => new { m.UserId, m.Email, Role = m.Role.ToString(), m.JoinedAt }));
        */

        var members = await (
            from member in _db.CalendarMembers
            where member.CalendarId == id
            join profile in _db.UserProfiles on member.UserId equals profile.UserId into profiles
            from profile in profiles.DefaultIfEmpty()
            orderby member.JoinedAt
            select new
            {
                member.UserId,
                member.Email,
                member.Role,
                member.JoinedAt,
                Username = profile == null ? null : profile.Username
            }
        ).ToListAsync();
        return Ok(members.Select(m => new { m.UserId, m.Email, Role = m.Role.ToString(), m.JoinedAt, m.Username }));
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
        var email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim().ToLowerInvariant();
        if (email != null && !MailAddress.TryCreate(email, out _))
            return BadRequest(new { error = "That doesn't look like an email address" });

        var calendar = await _db.Calendars.FindAsync(id);
        if (calendar == null) return NotFound();

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

        // If an email address was given, send the code there too.
        // null = no email address given; false = it couldn't be sent (the code still works).
        bool? emailSent = null;
        if (email != null)
        {
            var inviterName = await _db.UserProfiles
                .Where(p => p.UserId == UserId)
                .Select(p => p.Username)
                .FirstOrDefaultAsync() ?? UserEmail ?? "Someone";
            emailSent = await SendInviteEmailAsync(email, inviterName, calendar.Name, invite);
        }

        return Ok(new
        {
            Id = invite.CalendarInviteId,
            invite.Code,
            invite.InviteeEmail,
            Role = invite.Role.ToString(),
            invite.ExpiresAt,
            EmailSent = emailSent
        });
    }

    // POST /api/calendars/join   body: { "code": "..." }
    [HttpPost("join")]
    public async Task<IActionResult> JoinCalendar([FromBody] JoinCalendarDto dto)
    {
        var invite = await _db.CalendarInvites.FirstOrDefaultAsync(i => i.Code == dto.Code.Trim());
        if (invite == null) return NotFound(new { error = "Invite not found" });
        if (invite.ExpiresAt is { } exp && exp < DateTime.UtcNow)
            return BadRequest(new { error = "Invite expired" });
        // An invite sent to an email address only works for the account with that email
        if (invite.InviteeEmail != null &&
            !string.Equals(invite.InviteeEmail, UserEmail, StringComparison.OrdinalIgnoreCase))
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = $"This invite was sent to {invite.InviteeEmail}. Log in with that email address to use it."
            });

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

    // DELETE /api/calendars/{id}/members/{userId}   -> remove someone from the calendar (Owner only)
    [HttpDelete("{id:guid}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(Guid id, string userId)
    {
        if (await MyRoleAsync(id) != CalendarRole.Owner) return Forbid();

        var member = await _db.CalendarMembers
            .FirstOrDefaultAsync(m => m.CalendarId == id && m.UserId == userId);
        if (member == null) return NotFound();
        if (member.Role == CalendarRole.Owner)
            return BadRequest(new { error = "The owner can't be removed from their own calendar." });

        await using var tx = await _db.Database.BeginTransactionAsync();

        // Their "I'm going" marks on this calendar's events
        await _db.EventAttendees
            .Where(a => a.UserId == userId &&
                        _db.Events.Any(e => e.EventId == a.EventId && e.CalendarId == id))
            .ExecuteDeleteAsync();

        // Their membership
        _db.CalendarMembers.Remove(member);
        await _db.SaveChangesAsync();

        await tx.CommitAsync();

        // Tell the removed person's open pages, so they stop showing this calendar right away.
        // Clients.User finds their connections by their Auth0 id (the same NameIdentifier claim).
        await _hub.Clients.User(userId).SendAsync("removedFromCalendar", id);
        return Ok(new { success = true });
    }

    [HttpDelete("{id:guid}/members/me")]
    public async Task<IActionResult> LeaveCalendar(Guid id)
    {
        var userId = UserId;
        var member = await _db.CalendarMembers
            .FirstOrDefaultAsync(m => m.CalendarId == id && m.UserId == userId);
        if (member == null) return NotFound();
        if (member.Role == CalendarRole.Owner)
            return BadRequest(new { error = "The owner can't leave their own calendar. Delete it instead." });

        await using var tx = await _db.Database.BeginTransactionAsync();

        // My "I'm going" marks on this calendar's events
        await _db.EventAttendees
            .Where(a => a.UserId == userId &&
                        _db.Events.Any(e => e.EventId == a.EventId && e.CalendarId == id))
            .ExecuteDeleteAsync();

        // My membership
        _db.CalendarMembers.Remove(member);
        await _db.SaveChangesAsync();

        await tx.CommitAsync();
        return Ok(new { success = true });
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

    private Task<bool> SendInviteEmailAsync(string to, string inviterName, string calendarName, CalendarInvite invite)
    {
        var siteUrl = _config["App:SiteUrl"]?.TrimEnd('/');
        var roleText = invite.Role == CalendarRole.Editor
            ? "an editor: you can see events, join them, chat, add events and change the ones you create"
            : "a viewer: you can see events, join them and chat";
        var expires = invite.ExpiresAt is { } e ? $"This invite expires on {e:MMMM d, yyyy}." : "";

        var subject = $"{inviterName} invited you to \"{calendarName}\" on Community Calendar";

        var text =
            $"{inviterName} invited you to join the calendar \"{calendarName}\" as {roleText}.\n\n" +
            $"Your invite code: {invite.Code}\n\n" +
            "To join:\n" +
            $"1. Go to {siteUrl ?? "Community Calendar"} and log in with this email address ({to}).\n" +
            "2. Click \"Join with code\" and enter the code above.\n\n" +
            expires;

        // Everything people typed (names) is HTML-encoded so it can't inject markup into the email
        string H(string value) => WebUtility.HtmlEncode(value);
        var link = siteUrl == null
            ? "Community Calendar"
            : $"<a href=\"{H(siteUrl)}\" style=\"color:#203e32\">{H(siteUrl)}</a>";
        var html = $"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#203e32">
          <h2 style="margin:0 0 12px">You're invited to "{H(calendarName)}"</h2>
          <p>{H(inviterName)} invited you to join this calendar as {H(roleText)}.</p>
          <p style="margin:20px 0 6px">Your invite code:</p>
          <p style="font-family:monospace;font-size:24px;letter-spacing:2px;background:#f7f8f1;border:1px solid #dce1d6;border-radius:8px;padding:12px 16px;display:inline-block;margin:0">{H(invite.Code)}</p>
          <ol style="padding-left:20px;line-height:1.6">
            <li>Go to {link} and log in with this email address ({H(to)}).</li>
            <li>Click <strong>Join with code</strong> and enter the code above.</li>
          </ol>
          <p style="color:#758071;font-size:13px">{H(expires)}</p>
        </div>
        """;

        return _emailSender.SendAsync(to, subject, html, text);
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