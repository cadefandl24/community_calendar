using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace calendarapi.Migrations
{
    /// <inheritdoc />
    public partial class AddEventRecurrence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "RecurrenceCount",
                schema: "app",
                table: "Events",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecurrenceFreq",
                schema: "app",
                table: "Events",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceInterval",
                schema: "app",
                table: "Events",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RecurrenceUntil",
                schema: "app",
                table: "Events",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RecurrenceCount",
                schema: "app",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "RecurrenceFreq",
                schema: "app",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "RecurrenceInterval",
                schema: "app",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "RecurrenceUntil",
                schema: "app",
                table: "Events");
        }
    }
}
