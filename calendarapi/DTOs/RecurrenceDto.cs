using Auth0.ManagementApi;

public class RecurrenceDto
{
    public string Freq { get; set; } = "";
    public int? Interval { get; set; }
    public int? Count { get; set; }
    public DateTime? Until { get; set; }
}