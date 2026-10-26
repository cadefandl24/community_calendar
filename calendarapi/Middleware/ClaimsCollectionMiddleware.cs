using System.Security.Claims;
using System.Text;

namespace CalendarAPI.Middleware;

/// <summary>
/// Middleware that collects and logs all claims from bearer tokens.
/// Useful for debugging authentication and claim issues.
/// </summary>
public class ClaimsCollectionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ClaimsCollectionMiddleware> _logger;

    public ClaimsCollectionMiddleware(RequestDelegate next, ILogger<ClaimsCollectionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var authHeader = context.Request.Headers["Authorization"].ToString();
        Console.WriteLine($"IsAuthenticated: {context.User?.Identity?.IsAuthenticated}");
        Console.WriteLine($"Auth type: {context.User?.Identity?.AuthenticationType}");

        // Capture claims if user is authenticated
        if (context.User?.Identity?.IsAuthenticated == true)
        {
            LogClaimsDetails(context);
        }
        else
        {
            _logger.LogInformation("Request to {Path} - User not authenticated", context.Request.Path);
        }

        await _next(context);
    }

    private void LogClaimsDetails(HttpContext context)
    {
        var claims = context.User.Claims.ToList();
        var authHeader = context.Request.Headers["Authorization"].ToString();

        var sb = new StringBuilder();
        sb.AppendLine();
        sb.AppendLine("╔═══════════════════════════════════════════════════════════════╗");
        sb.AppendLine("║                    CLAIMS COLLECTION REPORT                   ║");
        sb.AppendLine("╚═══════════════════════════════════════════════════════════════╝");
        sb.AppendLine($"Endpoint: {context.Request.Method} {context.Request.Path}");
        sb.AppendLine($"Timestamp: {DateTime.UtcNow:O}");
        sb.AppendLine($"Is Authenticated: {context.User.Identity?.IsAuthenticated}");
        sb.AppendLine($"Identity Name: {context.User.Identity?.Name}");
        sb.AppendLine($"Auth Type: {context.User.Identity?.AuthenticationType}");
        sb.AppendLine($"Authorization Header Present: {!string.IsNullOrEmpty(authHeader)}");
        sb.AppendLine($"Total Claims: {claims.Count}");
        sb.AppendLine();
        sb.AppendLine("Claims Details:");
        sb.AppendLine(new string('-', 65));

        if (claims.Count == 0)
        {
            sb.AppendLine("⚠️  NO CLAIMS FOUND");
        }
        else
        {
            int index = 1;
            foreach (var claim in claims.OrderBy(c => c.Type))
            {
                sb.AppendLine($"{index}. Type: {claim.Type}");
                sb.AppendLine($"   Value: {claim.Value}");
                sb.AppendLine($"   ValueType: {claim.ValueType}");
                sb.AppendLine();
                index++;
            }
        }

        sb.AppendLine(new string('═', 65));
        sb.AppendLine();

        // Log to console and logger
        var report = sb.ToString();
        Console.WriteLine(report);
        _logger.LogInformation("Claims Report: {ClaimsReport}", report);

        // Store claims in HttpContext.Items for use in controllers
        context.Items["ClaimsReport"] = new
        {
            IsAuthenticated = context.User.Identity?.IsAuthenticated,
            IdentityName = context.User.Identity?.Name,
            AuthenticationType = context.User.Identity?.AuthenticationType,
            ClaimsCount = claims.Count,
            Claims = claims.Select(c => new
            {
                Type = c.Type,
                Value = c.Value,
                ValueType = c.ValueType
            }).ToList()
        };
    }
}

/// <summary>
/// Extension method to add ClaimsCollectionMiddleware to the pipeline
/// </summary>
public static class ClaimsCollectionMiddlewareExtensions
{
    public static IApplicationBuilder UseClaimsCollection(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<ClaimsCollectionMiddleware>();
    }
}