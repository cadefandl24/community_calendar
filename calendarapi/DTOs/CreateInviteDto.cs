public class CreateInviteDto
{
    public string? Email { get; set; }
    public string Role { get; set; } = "Viewer";
    public int? ExpiresInDays { get; set; }
}