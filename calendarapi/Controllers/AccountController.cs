using CalendarAPI.Hubs;
using CalendarAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/account")]
[Authorize]
public class AccountController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IClaimsService _claimsService;
    private readonly IHubContext<CalendarHub> _hub;
    private string UserId => _claimsService.GetUserId() ?? throw new UnauthorizedAccessException();

    public AccountController(AppDbContext db, IClaimsService claimsService, IHubContext<CalendarHub> hub)
    {
        _db = db;
        _claimsService = claimsService;
        _hub = hub;
    }

    // DELETE /api/account   -> wipes this user's data
    [HttpDelete]
    public async Task<IActionResult> DeleteAccount()
    {
        var userId = UserId;
        var ownedIds = await _db.Calendars
            .Where(c => c.OwnerUserId == userId)
            .Select(c => c.CalendarId)
            .ToListAsync();

        await using var tx = await _db.Database.BeginTransactionAsync();

        // 1. Calendars I own (everything inside them cascades)
        await _db.Calendars.Where(c => c.OwnerUserId == userId).ExecuteDeleteAsync();
        // 2. My memberships in other people's calendars
        await _db.CalendarMembers.Where(m => m.UserId == userId).ExecuteDeleteAsync();
        // 3. My "I'm going" on other people's events
        await _db.EventAttendees.Where(a => a.UserId == userId).ExecuteDeleteAsync();
        // 4. Unused invites I created
        await _db.CalendarInvites
            .Where(i => i.CreatedByUserId == userId && i.RedeemedAt == null)
            .ExecuteDeleteAsync();

        await tx.CommitAsync();

        foreach (var id in ownedIds)
            await _hub.Clients.Group(CalendarHub.GroupName(id)).SendAsync("calendarDeleted", id);

        return Ok(new { success = true });
    }
}