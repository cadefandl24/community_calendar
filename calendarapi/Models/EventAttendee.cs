public class EventAttendee
{
    public Guid EventId { get; set; } = Guid.NewGuid();
    public string UserId { get; set; } = "";
    public string? Email { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}