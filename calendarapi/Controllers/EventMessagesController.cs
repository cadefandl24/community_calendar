using CalendarAPI.Hubs;
using CalendarAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

// Chat on an event. Anyone in the event's calendar can read and post.
[ApiController]
[Route("api/calendar/event/{eventId:guid}/messages")]
[Authorize]
public class EventMessagesController : ControllerBase
{
    private const int MaxBodyLength = 2000;
    private const int DefaultPageSize = 50;
    private const int MaxPageSize = 100;

    private readonly AppDbContext _db;
    private readonly IClaimsService _claimsService;
    private readonly IHubContext<CalendarHub> _hub;
    private string UserId => _claimsService.GetUserId() ?? throw new UnauthorizedAccessException();

    public EventMessagesController(AppDbContext db, IClaimsService claimsService, IHubContext<CalendarHub> hub)
    {
        _db = db;
        _claimsService = claimsService;
        _hub = hub;
    }

    // GET /api/calendar/event/{eventId}/messages?before=<createdAt>&limit=50
    // Returns the newest messages (or the ones before "before"), oldest first.
    [HttpGet]
    public async Task<IActionResult> GetMessages(Guid eventId, [FromQuery] DateTime? before, [FromQuery] int? limit)
    {
        var calendarId = await CalendarIdOfAsync(eventId);
        if (calendarId == null) return NotFound();
        if (await MyRoleAsync(calendarId.Value) == null) return Forbid();

        var pageSize = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
        var query = _db.EventMessages.Where(m => m.EventId == eventId);
        if (before is { } cursor)
        {
            var cursorUtc = ToUtc(cursor);
            query = query.Where(m => m.CreatedAt < cursorUtc);
        }

        // Take one extra row to find out whether there are older messages to load
        var rows = await (
                from m in query
                join p in _db.UserProfiles on m.UserId equals p.UserId into profiles
                from p in profiles.DefaultIfEmpty()
                orderby m.CreatedAt descending
                select new { Message = m, Name = p != null ? p.DisplayName : null })
            .Take(pageSize + 1)
            .ToListAsync();

        var hasMore = rows.Count > pageSize;
        var messages = rows
            .Take(pageSize)
            .Reverse()   // oldest first, the order a chat is read in
            .Select(r => ToDto(r.Message, r.Name))
            .ToList();

        return Ok(new { messages, hasMore });
    }

    // POST /api/calendar/event/{eventId}/messages   body: { "body": "See you there!" }
    [HttpPost]
    public async Task<IActionResult> PostMessage(Guid eventId, [FromBody] CreateMessageDto dto)
    {
        var body = dto.Body?.Trim() ?? "";
        if (body.Length == 0) return BadRequest(new { error = "Message can't be empty" });
        if (body.Length > MaxBodyLength)
            return BadRequest(new { error = $"Message must be {MaxBodyLength} characters or fewer" });

        var calendarId = await CalendarIdOfAsync(eventId);
        if (calendarId == null) return NotFound();
        if (await MyRoleAsync(calendarId.Value) == null) return Forbid();

        var message = new EventMessage { EventId = eventId, UserId = UserId, Body = body };
        _db.EventMessages.Add(message);
        await _db.SaveChangesAsync();

        var name = await _db.UserProfiles
            .Where(p => p.UserId == message.UserId)
            .Select(p => p.DisplayName)
            .FirstOrDefaultAsync();
        var result = ToDto(message, name);

        await _hub.Clients.Group(CalendarHub.GroupName(calendarId.Value)).SendAsync("messageCreated", result);
        return Ok(result);
    }

    // DELETE /api/calendar/event/{eventId}/messages/{messageId}
    // The author can delete their own message; the calendar's owner can delete any.
    [HttpDelete("{messageId:guid}")]
    public async Task<IActionResult> DeleteMessage(Guid eventId, Guid messageId)
    {
        var message = await _db.EventMessages
            .FirstOrDefaultAsync(m => m.EventMessageId == messageId && m.EventId == eventId);
        if (message == null) return NotFound();

        var calendarId = await CalendarIdOfAsync(eventId);
        if (calendarId == null) return NotFound();
        var myRole = await MyRoleAsync(calendarId.Value);
        if (myRole == null) return Forbid();
        if (message.UserId != UserId && myRole != CalendarRole.Owner) return Forbid();

        _db.EventMessages.Remove(message);
        await _db.SaveChangesAsync();

        await _hub.Clients.Group(CalendarHub.GroupName(calendarId.Value))
            .SendAsync("messageDeleted", new { Id = messageId, EventId = eventId });
        return Ok(new { success = true });
    }

    // The calendar an event belongs to, or null if the event doesn't exist
    private async Task<Guid?> CalendarIdOfAsync(Guid eventId) =>
        await _db.Events
            .Where(e => e.EventId == eventId)
            .Select(e => (Guid?)e.CalendarId)
            .FirstOrDefaultAsync();

    // My role in a calendar, or null if I'm not a member
    private async Task<CalendarRole?> MyRoleAsync(Guid calendarId) =>
        await _db.CalendarMembers
            .Where(m => m.CalendarId == calendarId && m.UserId == UserId)
            .Select(m => (CalendarRole?)m.Role)
            .FirstOrDefaultAsync();

    private static EventMessageDto ToDto(EventMessage m, string? authorName) => new(
        m.EventMessageId, m.EventId, m.UserId,
        string.IsNullOrWhiteSpace(authorName) ? "Calendar member" : authorName,
        m.Body,
        DateTime.SpecifyKind(m.CreatedAt, DateTimeKind.Utc));

    // Postgres timestamptz columns only accept UTC times
    private static DateTime ToUtc(DateTime d) =>
        d.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(d, DateTimeKind.Utc)
            : d.ToUniversalTime();
}