using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;   // for AnyAsync
using System.Security.Claims;

namespace CalendarAPI.Hubs;

[Authorize]
public class CalendarHub : Hub
{
    private readonly AppDbContext _db;

    public CalendarHub(AppDbContext db)
    {
        _db = db;
    }

    public async Task JoinCalendar(string calendarId)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId == null) throw new HubException("Unauthorized");

        var isMember = await _db.CalendarMembers
            .AnyAsync(m => m.CalendarId == calendarId && m.UserId == userId);
        if (!isMember) throw new HubException("Not a member of this calendar");

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(calendarId));
    }

    public async Task LeaveCalendar(string calendarId)
        => await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(calendarId));

    public static string GroupName(string calendarId) => $"calendar-{calendarId}";
}