using CalendarAPI.Hubs;
using CalendarAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

[ApiController]
[Route("api/calendar")]
[Authorize]
public class CalendarController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IClaimsService _claimsService;
    private readonly IHubContext<CalendarHub> _hub;
    private string UserId => _claimsService.GetUserId() ?? throw new UnauthorizedAccessException();
    private string? UserEmail => _claimsService.GetUserEmail();

    public CalendarController(AppDbContext db, IClaimsService claimsService, IHubContext<CalendarHub> hub)
    {
        _db = db;
        _claimsService = claimsService;
        _hub = hub;
    }

    // GET /api/calendar/events?calendarId=...
    [HttpGet("events")]
    public async Task<IActionResult> GetEvents([FromQuery] Guid calendarId)
    {
        if (calendarId == Guid.Empty) return BadRequest(new { error = "calendarId is required" });
        if (!await IsMemberAsync(calendarId)) return Forbid();

        var rows = await _db.Events
            .Where(e => e.CalendarId == calendarId)
            .OrderBy(e => e.StartTime)
            .Select(e => new
            {
                Event = e,
                AttendeeIds = _db.EventAttendees
                    .Where(a => a.EventId == e.EventId)
                    .Select(a => a.UserId)
                    .ToList()
            })
            .ToListAsync();

        return Ok(rows.Select(r => EventResponseDto.From(r.Event, r.AttendeeIds)));
    }

    // POST /api/calendar/event   (Owners and Editors only)
    [HttpPost("event")]
    public async Task<IActionResult> CreateEvent([FromBody] CreateEventDto dto)
    {
        if (dto.CalendarId == Guid.Empty) return BadRequest(new { error = "calendarId is required" });
        if (Validate(dto.Title, dto.Start, dto.End) is { } error) return BadRequest(new { error });
        if (!await IsMemberAsync(dto.CalendarId, requireEditorOrOwner: true)) return Forbid();
        if (!TryNormalizeColor(dto.Color, out var color))
            return BadRequest(new { error = "color must look like #2563eb" });
        var ev = new Event
        {
            CalendarId = dto.CalendarId,
            CreatedByUserId = UserId,
            Title = dto.Title.Trim(),
            Description = dto.Description,
            StartTime = ToUtc(dto.Start),
            EndTime = ToUtc(dto.End),
            AllDay = dto.AllDay,
            Color = color
        };
        if (ApplyRecurrence(ev, dto.Recurrence) is { } recurrenceError) return BadRequest(new { error = recurrenceError });
        _db.Events.Add(ev);
        _db.EventAttendees.Add(new EventAttendee { EventId = ev.EventId, UserId = UserId, Email = UserEmail });
        await _db.SaveChangesAsync();

        var result = await ToDto(ev);
        await _hub.Clients.Group(CalendarHub.GroupName(ev.CalendarId)).SendAsync("eventCreated", result);
        return Ok(result);
    }

    // PUT or PATCH /api/calendar/event/{id}   (Owners and Editors only)
    [HttpPut("event/{id:guid}")]
    [HttpPatch("event/{id:guid}")]
    public async Task<IActionResult> UpdateEvent(Guid id, [FromBody] UpdateEventDto dto)
    {
        if (Validate(dto.Title, dto.Start, dto.End) is { } error) return BadRequest(new { error });

        var ev = await _db.Events.FindAsync(id);
        if (ev == null) return NotFound();
        if (!await IsMemberAsync(ev.CalendarId, requireEditorOrOwner: true)) return Forbid();
        if (!TryNormalizeColor(dto.Color, out var color))
            return BadRequest(new { error = "color must look like #2563eb" });

        ev.Title = dto.Title.Trim();
        ev.Description = dto.Description;
        ev.StartTime = ToUtc(dto.Start);
        ev.EndTime = ToUtc(dto.End);
        ev.AllDay = dto.AllDay;
        ev.Color = color;
        if (ApplyRecurrence(ev, dto.Recurrence) is { } recurrenceError) return BadRequest(new { error = recurrenceError });
        ev.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var result = await ToDto(ev);
        await _hub.Clients.Group(CalendarHub.GroupName(ev.CalendarId)).SendAsync("eventUpdated", result);
        return Ok(result);
    }

    // DELETE /api/calendar/event/{id}   (Owners and Editors only)
    [HttpDelete("event/{id:guid}")]
    public async Task<IActionResult> DeleteEvent(Guid id)
    {
        var ev = await _db.Events.FindAsync(id);
        if (ev == null) return NotFound();
        if (!await IsMemberAsync(ev.CalendarId, requireEditorOrOwner: true)) return Forbid();

        _db.Events.Remove(ev);
        await _db.SaveChangesAsync();

        await _hub.Clients.Group(CalendarHub.GroupName(ev.CalendarId)).SendAsync("eventDeleted", ev.EventId);
        return Ok(new { success = true });
    }

    // POST /api/calendar/event/{id}/attend   -> "I'm going"   (any member)
    [HttpPost("event/{id:guid}/attend")]
    public async Task<IActionResult> Attend(Guid id)
    {
        var ev = await _db.Events.FindAsync(id);
        if (ev == null) return NotFound();
        if (!await IsMemberAsync(ev.CalendarId)) return Forbid();

        if (!await _db.EventAttendees.AnyAsync(a => a.EventId == id && a.UserId == UserId))
        {
            _db.EventAttendees.Add(new EventAttendee { EventId = id, UserId = UserId, Email = UserEmail });
            await _db.SaveChangesAsync();
        }

        var result = await ToDto(ev);
        await _hub.Clients.Group(CalendarHub.GroupName(ev.CalendarId)).SendAsync("eventUpdated", result);
        return Ok(result);
    }

    // DELETE /api/calendar/event/{id}/attend   -> "I'm not going anymore"
    [HttpDelete("event/{id:guid}/attend")]
    public async Task<IActionResult> Leave(Guid id)
    {
        var ev = await _db.Events.FindAsync(id);
        if (ev == null) return NotFound();
        if (!await IsMemberAsync(ev.CalendarId)) return Forbid();

        var row = await _db.EventAttendees.FindAsync(id, UserId);
        if (row != null)
        {
            _db.EventAttendees.Remove(row);
            await _db.SaveChangesAsync();
        }

        var result = await ToDto(ev);
        await _hub.Clients.Group(CalendarHub.GroupName(ev.CalendarId)).SendAsync("eventUpdated", result);
        return Ok(result);
    }

    // GET /api/calendar/event/{id}/attendees   -> who's going, with emails
    [HttpGet("event/{id:guid}/attendees")]
    public async Task<IActionResult> GetAttendees(Guid id)
    {
        var ev = await _db.Events.FindAsync(id);
        if (ev == null) return NotFound();
        if (!await IsMemberAsync(ev.CalendarId)) return Forbid();

        var attendees = await _db.EventAttendees
            .Where(a => a.EventId == id)
            .OrderBy(a => a.JoinedAt)
            .Select(a => new { a.UserId, a.Email, a.JoinedAt })
            .ToListAsync();
        return Ok(attendees);
    }

    private async Task<EventResponseDto> ToDto(Event ev)
    {
        var attendeeIds = await _db.EventAttendees
            .Where(a => a.EventId == ev.EventId)
            .Select(a => a.UserId)
            .ToListAsync();
        return EventResponseDto.From(ev, attendeeIds);
    }

    private async Task<bool> IsMemberAsync(Guid calendarId, bool requireEditorOrOwner = false)
    {
        var m = await _db.CalendarMembers
            .FirstOrDefaultAsync(x => x.CalendarId == calendarId && x.UserId == UserId);
        if (m == null) return false;
        if (requireEditorOrOwner && m.Role == CalendarRole.Viewer) return false;
        return true;
    }

    private static string? Validate(string title, DateTime start, DateTime end)
    {
        if (string.IsNullOrWhiteSpace(title)) return "title is required";
        if (ToUtc(end) < ToUtc(start)) return "end must be after start";
        return null;
    }

    private static bool TryNormalizeColor(string? color, out string? normalized)
    {
        normalized = string.IsNullOrWhiteSpace(color) ? null : color.Trim().ToLowerInvariant();
        return normalized == null || Regex.IsMatch(normalized, "^#[0-9a-f]{6}$");
    }

    private static DateTime ToUtc(DateTime d) =>
        d.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(d, DateTimeKind.Utc)
            : d.ToUniversalTime();

    private static readonly string[] Frequencies = { "DAILY", "WEEKLY", "MONTHLY", "YEARLY" };

    // Copies the repeat settings onto the event. Returns an error message, or null if they're fine.
    private static string? ApplyRecurrence(Event ev, RecurrenceDto? r)
    {
        if (r == null || string.IsNullOrWhiteSpace(r.Freq))
        {
            ev.RecurrenceFreq = null;
            ev.RecurrenceInterval = null;
            ev.RecurrenceCount = null;
            ev.RecurrenceUntil = null;
            return null;
        }

        var freq = r.Freq.Trim().ToUpperInvariant();
        if (!Frequencies.Contains(freq)) return "recurrence.freq must be DAILY, WEEKLY, MONTHLY or YEARLY";
        if (r.Interval is < 1) return "recurrence.interval must be at least 1";
        if (r.Count is < 1) return "recurrence.count must be at least 1";

        ev.RecurrenceFreq = freq;
        ev.RecurrenceInterval = r.Interval;
        ev.RecurrenceCount = r.Count;
        ev.RecurrenceUntil = r.Until is { } until ? ToUtc(until) : null;
        return null;
    }
}
