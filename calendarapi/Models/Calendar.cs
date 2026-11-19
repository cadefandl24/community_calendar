public class Calendar
{
    public Guid CalendarId { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string OwnerUserId { get; set; } = ""; //Auth0 user id
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}