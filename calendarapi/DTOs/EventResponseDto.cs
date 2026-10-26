namespace calendarapi.DTOs
{
    public record EventResponseDto(
    string Id, string CalendarId, string Title,
    DateTime Start, DateTime End, string? Description)
    {
        public static EventResponseDto From(Event e) => new(
            e.Id, e.CalendarId, e.Title,
            DateTime.SpecifyKind(e.StartTime, DateTimeKind.Utc),
            DateTime.SpecifyKind(e.EndTime, DateTimeKind.Utc),
            e.Description);
    }
}