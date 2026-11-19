public enum CalendarRole { Owner, Editor, Viewer }

public class CalendarMember
{
    public Guid CalendarMemberId { get; set; } = Guid.NewGuid();
    public Guid CalendarId { get; set; }
    public string UserId { get; set; } = "";
    public string? Email { get; set; }
    public CalendarRole Role { get; set; } = CalendarRole.Viewer;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastOpenedAt { get; set; }
}