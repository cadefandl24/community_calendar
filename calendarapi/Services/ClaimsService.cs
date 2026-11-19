using System.Security.Claims;

namespace CalendarAPI.Services;

/// <summary>
/// Service to provide access to current request's claims information
/// </summary>
public interface IClaimsService
{
    string? GetUserId();
    string? GetUserEmail();
    string? GetUserName();
    IReadOnlyList<ClaimInfo> GetAllClaims();
    T? GetClaimValue<T>(string claimType);
}

public class ClaimInfo
{
    public string Type { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string ValueType { get; set; } = string.Empty;
}

/// <summary>
/// Implementation of IClaimsService that extracts claims from the current HttpContext
/// </summary>
public class ClaimsService : IClaimsService
{
    private readonly IHttpContextAccessor _contextAccessor;
    private readonly ILogger<ClaimsService> _logger;

    public ClaimsService(IHttpContextAccessor contextAccessor, ILogger<ClaimsService> logger)
    {
        _contextAccessor = contextAccessor;
        _logger = logger;
    }

    /// <summary>
    /// Get the user ID (sub claim) from the current token
    /// </summary>
    public string? GetUserId()
    {
        var userId = _contextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("User ID (sub claim) not found in token");
        }
        return userId;
    }

    /// <summary>
    /// Get the user email from the current token
    /// </summary>
    public string? GetUserEmail()
    {
        var user = _contextAccessor.HttpContext?.User;
        if (user == null) return null;

        // The email can arrive under different names:
        //  - "https://ku.calendar.ui/email": added to the access token by our Auth0 Action
        //  - ClaimTypes.Email: what ASP.NET renames a plain "email" claim to
        //  - "email": in case that renaming is turned off
        return user.FindFirst(EmailClaim)?.Value
            ?? user.FindFirst(ClaimTypes.Email)?.Value
            ?? user.FindFirst("email")?.Value;
    }

    public const string EmailClaim = "https://ku.calendar.ui/email";

    /// <summary>
    /// Get the user name from the current token
    /// </summary>
    public string? GetUserName()
    {
        return _contextAccessor.HttpContext?.User.FindFirst("name")?.Value 
            ?? _contextAccessor.HttpContext?.User.FindFirst("nickname")?.Value;
    }

    /// <summary>
    /// Get all claims from the current token
    /// </summary>
    public IReadOnlyList<ClaimInfo> GetAllClaims()
    {
        var claims = _contextAccessor.HttpContext?.User.Claims
            .Select(c => new ClaimInfo 
            { 
                Type = c.Type, 
                Value = c.Value, 
                ValueType = c.ValueType 
            })
            .ToList() ?? new List<ClaimInfo>();

        return claims.AsReadOnly();
    }

    /// <summary>
    /// Get a specific claim value by type
    /// </summary>
    public T? GetClaimValue<T>(string claimType)
    {
        var claimValue = _contextAccessor.HttpContext?.User.FindFirst(claimType)?.Value;

        if (string.IsNullOrEmpty(claimValue))
        {
            _logger.LogDebug("Claim type '{ClaimType}' not found", claimType);
            return default;
        }

        try
        {
            if (typeof(T) == typeof(string))
            {
                return (T)(object)claimValue;
            }

            return (T?)Convert.ChangeType(claimValue, typeof(T));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error converting claim '{ClaimType}' to type '{TargetType}'", claimType, typeof(T).Name);
            return default;
        }
    }
}
