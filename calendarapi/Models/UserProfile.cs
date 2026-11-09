public class UserProfile
{
    public string UserId { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? Email { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

