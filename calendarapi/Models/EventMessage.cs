using System.ComponentModel.DataAnnotations;

// One chat message on an event. Deleting the event deletes its messages.
public class EventMessage
{
    public Guid EventMessageId { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    public string UserId { get; set; } = "";        // Auth0 user id of the author

    [MaxLength(2000)]
    public string Body { get; set; } = "";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}