using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace calendarapi.Migrations
{
    /// <inheritdoc />
    public partial class InitSupabase : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "app");

            migrationBuilder.CreateTable(
                name: "Calendars",
                schema: "app",
                columns: table => new
                {
                    CalendarId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    OwnerUserId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Calendars", x => x.CalendarId);
                });

            migrationBuilder.CreateTable(
                name: "CalendarInvites",
                schema: "app",
                columns: table => new
                {
                    CalendarInviteId = table.Column<Guid>(type: "uuid", nullable: false),
                    CalendarId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    InviteeEmail = table.Column<string>(type: "text", nullable: true),
                    Role = table.Column<string>(type: "text", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RedeemedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CalendarInvites", x => x.CalendarInviteId);
                    table.ForeignKey(
                        name: "FK_CalendarInvites_Calendars_CalendarId",
                        column: x => x.CalendarId,
                        principalSchema: "app",
                        principalTable: "Calendars",
                        principalColumn: "CalendarId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CalendarMembers",
                schema: "app",
                columns: table => new
                {
                    CalendarMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    CalendarId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: true),
                    Role = table.Column<string>(type: "text", nullable: false),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CalendarMembers", x => x.CalendarMemberId);
                    table.ForeignKey(
                        name: "FK_CalendarMembers_Calendars_CalendarId",
                        column: x => x.CalendarId,
                        principalSchema: "app",
                        principalTable: "Calendars",
                        principalColumn: "CalendarId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Events",
                schema: "app",
                columns: table => new
                {
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    CalendarId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    StartTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AllDay = table.Column<bool>(type: "boolean", nullable: false),
                    GoogleId = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Events", x => x.EventId);
                    table.ForeignKey(
                        name: "FK_Events_Calendars_CalendarId",
                        column: x => x.CalendarId,
                        principalSchema: "app",
                        principalTable: "Calendars",
                        principalColumn: "CalendarId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EventAttendees",
                schema: "app",
                columns: table => new
                {
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: true),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventAttendees", x => new { x.EventId, x.UserId });
                    table.ForeignKey(
                        name: "FK_EventAttendees_Events_EventId",
                        column: x => x.EventId,
                        principalSchema: "app",
                        principalTable: "Events",
                        principalColumn: "EventId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CalendarInvites_CalendarId",
                schema: "app",
                table: "CalendarInvites",
                column: "CalendarId");

            migrationBuilder.CreateIndex(
                name: "IX_CalendarInvites_Code",
                schema: "app",
                table: "CalendarInvites",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CalendarMembers_CalendarId_UserId",
                schema: "app",
                table: "CalendarMembers",
                columns: new[] { "CalendarId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CalendarMembers_UserId",
                schema: "app",
                table: "CalendarMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_EventAttendees_UserId",
                schema: "app",
                table: "EventAttendees",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Events_CalendarId_GoogleId",
                schema: "app",
                table: "Events",
                columns: new[] { "CalendarId", "GoogleId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Events_CalendarId_StartTime",
                schema: "app",
                table: "Events",
                columns: new[] { "CalendarId", "StartTime" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CalendarInvites",
                schema: "app");

            migrationBuilder.DropTable(
                name: "CalendarMembers",
                schema: "app");

            migrationBuilder.DropTable(
                name: "EventAttendees",
                schema: "app");

            migrationBuilder.DropTable(
                name: "Events",
                schema: "app");

            migrationBuilder.DropTable(
                name: "Calendars",
                schema: "app");
        }
    }
}
