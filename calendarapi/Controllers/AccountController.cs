using Auth0.ManagementApi;
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
    private const int MaxNameLength = 50;
    private string? UserEmail => _claimsService.GetUserEmail();
    private string? TokenName => _claimsService.GetUserName();

    public AccountController(AppDbContext db, IClaimsService claimsService, IHubContext<CalendarHub> hub)
    {
        _db = db;
        _claimsService = claimsService;
        _hub = hub;
    }

    // GET /api/account
    [HttpGet]
    public async Task<IActionResult> GetMyAccount()
    {
        var profile = await GetOrCreateProfileAsync();
        return Ok(ToDto(profile));
    }

    // Put /api/account/name  body: {"displayName": "Gabe" }
    [HttpPut("name")]
    public async Task<IActionResult> UpdateDisplayName([FromBody] UpdateDisplayNameDto dto)
    {
        var name = dto.DisplayName?.Trim() ?? "";
        if (name.Length == 0)
            return BadRequest(new { error = "Display name is required" });
        if (name.Length > MaxNameLength)
            return BadRequest(new { error = $"Display name must be {MaxNameLength} characters long or less" });

        var profile = await GetOrCreateProfileAsync();
        profile.DisplayName = name;
        profile.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(ToDto(profile));
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
        await _db.UserProfiles.Where(p => p.UserId == userId).ExecuteDeleteAsync();

        await tx.CommitAsync();

        foreach (var id in ownedIds)
            await _hub.Clients.Group(CalendarHub.GroupName(id)).SendAsync("calendarDeleted", id);

        return Ok(new { success = true });
    }

    private async Task<UserProfile> GetOrCreateProfileAsync()
    {
        var profile = await _db.UserProfiles.FindAsync(UserId);
        if (profile != null) return profile;

        profile = new UserProfile { UserId = UserId, DisplayName = DefaultName(), Email = UserEmail };
        _db.UserProfiles.Add(profile);
        try 
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            _db.Entry(profile).State = EntityState.Detached;
            profile = await _db.UserProfiles.FirstAsync(p => p.UserId == UserId);
        }
        return profile;
    }

    private string DefaultName()
    {
        var name = TokenName?.Trim();
        if (string.IsNullOrEmpty(name)) name = UserEmail?.Split('@')[0];
        if (string.IsNullOrEmpty(name)) name = "New user";
        return name.Length > MaxNameLength ? name[..MaxNameLength] : name;
    }

    private static object ToDto(UserProfile p) => new { p.UserId, p.DisplayName, p.Email };
}