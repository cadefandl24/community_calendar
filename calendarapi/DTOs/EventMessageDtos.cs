// Body of POST /api/calendar/event/{eventId}/messages
public class CreateMessageDto
{
    public string Body { get; set; } = "";
}

// A chat message as the API sends it to the browser
public record EventMessageDto(
    Guid Id, Guid EventId, string UserId, string AuthorName, string Body, DateTime CreatedAt);