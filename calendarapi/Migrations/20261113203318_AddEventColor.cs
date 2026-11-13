using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace calendarapi.Migrations
{
    /// <inheritdoc />
    public partial class AddEventColor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "RecurrenceFreq",
                schema: "app",
                table: "Events",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Color",
                schema: "app",
                table: "Events",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Color",
                schema: "app",
                table: "Events");

            migrationBuilder.AlterColumn<string>(
                name: "RecurrenceFreq",
                schema: "app",
                table: "Events",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(10)",
                oldMaxLength: 10,
                oldNullable: true);
        }
    }
}
