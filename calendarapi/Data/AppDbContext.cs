using Microsoft.EntityFrameworkCore;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Calendar> Calendars { get; set; }
    public DbSet<CalendarMember> CalendarMembers { get; set; }
    public DbSet<CalendarInvite> CalendarInvites { get; set; }
    public DbSet<Event> Events { get; set; }
    public DbSet<EventAttendee> EventAttendees { get; set; }
    public DbSet<UserProfile> UserProfiles { get; set; }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema("app");

        b.Entity<EventAttendee>().HasKey(a => new { a.EventId, a.UserId });

        b.Entity<CalendarMember>().HasOne<Calendar>().WithMany()
            .HasForeignKey(m => m.CalendarId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<CalendarInvite>().HasOne<Calendar>().WithMany()
            .HasForeignKey(i => i.CalendarId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Event>().HasOne<Calendar>().WithMany()
            .HasForeignKey(e => e.CalendarId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<EventAttendee>().HasOne<Event>().WithMany()
            .HasForeignKey(a => a.EventId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<CalendarMember>().HasIndex(m => new { m.CalendarId, m.UserId }).IsUnique();
        b.Entity<CalendarMember>().HasIndex(m => m.UserId);
        b.Entity<CalendarInvite>().HasIndex(i => i.Code).IsUnique();
        b.Entity<Event>().HasIndex(e => new { e.CalendarId, e.StartTime });
        b.Entity<Event>().HasIndex(e => new { e.CalendarId, e.GoogleId }).IsUnique();
        b.Entity<EventAttendee>().HasIndex(a => a.UserId);

        b.Entity<CalendarMember>().Property(m => m.Role).HasConversion<string>();
        b.Entity<CalendarInvite>().Property(i => i.Role).HasConversion<string>();

        b.Entity<UserProfile>().HasKey(p => p.UserId);
        b.Entity<UserProfile>().Property(p => p.DisplayName).HasMaxLength(50);
    }
}