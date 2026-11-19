using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace calendarapi.Migrations
{
    /// <inheritdoc />
    public partial class AddUsernames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Keep everyone's existing name: rename the column instead of dropping it
            migrationBuilder.RenameColumn(
                name: "DisplayName",
                schema: "app",
                table: "UserProfiles",
                newName: "Username");

            // 2. Turn existing display names into valid usernames:
            //    lowercase, only a-z 0-9 . _, at most 24 characters, no . or _ at either end
            migrationBuilder.Sql(@"
                UPDATE app.""UserProfiles""
                SET ""Username"" = trim(both '._' from left(regexp_replace(lower(""Username""), '[^a-z0-9._]', '', 'g'), 24));");

            //    anything too short (or emptied by step 2) becomes 'user'
            migrationBuilder.Sql(@"
                UPDATE app.""UserProfiles""
                SET ""Username"" = 'user'
                WHERE length(""Username"") < 3;");

            //    duplicates: the oldest keeps the name, the rest get 2, 3, ... added
            migrationBuilder.Sql(@"
                WITH numbered AS (
                    SELECT ""UserId"",
                           ""Username"",
                           row_number() OVER (PARTITION BY ""Username"" ORDER BY ""CreatedAt"", ""UserId"") AS n
                    FROM app.""UserProfiles""
                )
                UPDATE app.""UserProfiles"" AS p
                SET ""Username"" = numbered.""Username"" || numbered.n
                FROM numbered
                WHERE p.""UserId"" = numbered.""UserId"" AND numbered.n > 1;");

            // 3. Usernames are at most 30 characters
            migrationBuilder.AlterColumn<string>(
                name: "Username",
                schema: "app",
                table: "UserProfiles",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50);

            // 4. No two people can have the same username
            migrationBuilder.CreateIndex(
                name: "IX_UserProfiles_Username",
                schema: "app",
                table: "UserProfiles",
                column: "Username",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_UserProfiles_Username",
                schema: "app",
                table: "UserProfiles");

            migrationBuilder.AlterColumn<string>(
                name: "Username",
                schema: "app",
                table: "UserProfiles",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(30)",
                oldMaxLength: 30);

            migrationBuilder.RenameColumn(
                name: "Username",
                schema: "app",
                table: "UserProfiles",
                newName: "DisplayName");
        }
    }
}
