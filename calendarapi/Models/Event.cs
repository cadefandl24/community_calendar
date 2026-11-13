using Microsoft.EntityFrameworkCore.Storage.ValueConversion.Internal;
using System.ComponentModel.DataAnnotations;

public class Event
{
    [MaxLength(10)]

    public Guid EventId { get; set; } = Guid.NewGuid();
    public Guid CalendarId { get; set; }
    public string CreatedByUserId { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public bool AllDay { get; set; }
    public string? GoogleId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? RecurrenceFreq { get; set; }      // DAILY, WEEKLY, MONTHLY or YEARLY; null = doesn't repeat
    public int? RecurrenceInterval { get; set; }     // every N days/weeks/...; null = every 1
    public int? RecurrenceCount { get; set; }        // stop after N times; null = no limit
    public DateTime? RecurrenceUntil { get; set; }
}