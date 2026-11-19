public class CalendarInvite
{
    public Guid CalendarInviteId { get; set; } = Guid.NewGuid();
    public Guid CalendarId { get; set; }
    public string Code { get; set; } = Guid.NewGuid().ToString("N")[..10];
    public string? InviteeEmail { get; set; }   // null => anyone with the code can join
    public CalendarRole Role { get; set; } = CalendarRole.Viewer;
    public string CreatedByUserId { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RedeemedAt { get; set; }
}