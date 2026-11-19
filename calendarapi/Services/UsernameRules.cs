using System.Text.RegularExpressions;

namespace CalendarAPI.Services;

// The rules for usernames, in one place so every part of the API agrees.
// A username is 3-30 characters of lowercase letters, numbers, "." and "_",
// starting and ending with a letter or number, e.g. "gabe_c" or "j.smith2".
public static class UsernameRules
{
    public const int MinLength = 3;
    public const int MaxLength = 30;

    private static readonly Regex Allowed = new("^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$", RegexOptions.Compiled);
    private static readonly Regex NotAllowed = new("[^a-z0-9._]", RegexOptions.Compiled);

    // What the person typed -> the form we store: no spaces, no leading "@", lowercase.
    // Lowercase means "Gabe" and "gabe" count as the same username.
    public static string Normalize(string? value) =>
        (value ?? "").Trim().TrimStart('@').ToLowerInvariant();

    // Returns a message explaining what's wrong, or null if the username is fine.
    public static string? Problem(string username)
    {
        if (username.Length < MinLength || username.Length > MaxLength)
            return $"Usernames must be {MinLength} to {MaxLength} characters long.";
        if (!Allowed.IsMatch(username))
            return "Usernames can only use lowercase letters, numbers, dots and underscores, and must start and end with a letter or number.";
        return null;
    }

    // Turns any text (a name from Auth0, the start of an email) into a valid starting point,
    // e.g. "Gabe Carducci" -> "gabecarducci". Kept to 24 characters so a number can be added.
    public static string FromText(string? text)
    {
        var cleaned = NotAllowed.Replace((text ?? "").ToLowerInvariant(), "");
        if (cleaned.Length > 24) cleaned = cleaned[..24];
        cleaned = cleaned.Trim('.', '_');
        return cleaned.Length >= MinLength ? cleaned : "user";
    }
}