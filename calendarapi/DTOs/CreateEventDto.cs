public class CreateEventDto
{
    public Guid CalendarId { get; set; }
    public string Title { get; set; } = "";
    public DateTime Start { get; set; }
    public DateTime End { get; set; }
    public bool AllDay { get; set; }
    public string? Description { get; set; }
    public RecurrenceDto? Recurrence { get; set; }
}