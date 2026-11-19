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

    // PUT /api/account/username   body: { "username": "gabe_c" }
    [HttpPut("username")]
    public async Task<IActionResult> UpdateUsername([FromBody] UpdateUsernameDto dto)
    {
        var username = UsernameRules.Normalize(dto.Username);
        if (UsernameRules.Problem(username) is { } problem)
            return BadRequest(new { error = problem });

        var profile = await GetOrCreateProfileAsync();
        if (profile.Username == username) return Ok(ToDto(profile));   // nothing to change

        if (await _db.UserProfiles.AnyAsync(p => p.Username == username))
            return Conflict(new { error = "That username is taken." });

        profile.Username = username;
        profile.UpdatedAt = DateTime.UtcNow;
        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Someone else took it in the moment between the check and the save;
            // the unique index in the database stopped the duplicate.
            return Conflict(new { error = "That username is taken." });
        }

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
        // 5. Chat messages I wrote in other people's calendars
        await _db.EventMessages.Where(m => m.UserId == userId).ExecuteDeleteAsync();
        // 6. My profile
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

        // New user: start them with a username made from their name or email, e.g. "gabecarducci".
        // They can change it from the account menu.
        var start = UsernameRules.FromText(
            !string.IsNullOrWhiteSpace(TokenName) ? TokenName : UserEmail?.Split('@')[0]);

        for (var attempt = 0; attempt < 3; attempt++)
        {
            profile = new UserProfile { UserId = UserId, Username = await FreeUsernameAsync(start), Email = UserEmail };
            _db.UserProfiles.Add(profile);
            try
            {
                await _db.SaveChangesAsync();
                return profile;
            }
            catch (DbUpdateException)
            {
                _db.Entry(profile).State = EntityState.Detached;
                // Either this same user's profile was created by another request at the same moment...
                var existing = await _db.UserProfiles.FindAsync(UserId);
                if (existing != null) return existing;
                // ...or someone else grabbed that username at the same moment: try again.
            }
        }
        throw new InvalidOperationException("Could not create a profile with a unique username");
    }

    // "gabe" if nobody has it, otherwise "gabe2", "gabe3", ...
    private async Task<string> FreeUsernameAsync(string start)
    {
        var taken = await _db.UserProfiles
            .Where(p => p.Username.StartsWith(start))
            .Select(p => p.Username)
            .ToListAsync();
        if (!taken.Contains(start)) return start;

        for (var n = 2; n < 10000; n++)
        {
            var candidate = $"{start}{n}";
            if (!taken.Contains(candidate)) return candidate;
        }
        return $"{start}{Random.Shared.Next(10000, 99999)}";
    }

    private static object ToDto(UserProfile p) => new { p.UserId, p.Username, p.Email };
}