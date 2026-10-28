# Connecting the deployed calendar

The Vite frontend and the ASP.NET Core API are separate applications. Deploying
the frontend to Vercel does not start `calendarapi`. Vite's `/api` proxy only runs
during local development.

1. Deploy `calendarapi` to a host supporting .NET 10, including the latest
   `/api/calendars/personal` endpoint. Its SQLite `dev.db` needs persistent disk
   storage and the EF Core migrations must be applied before use. Use one API
   instance with SQLite, or move to a shared database before scaling.
2. On the backend, set `Cors__AllowedOrigins__0` to the exact frontend origin
   (scheme and hostname, no trailing slash). Add additional trusted frontend
   origins with `Cors__AllowedOrigins__1`, etc. Preserve the existing Auth0
   domain and audience configuration.
3. In Vercel's frontend environment variables, set `VITE_API_BASE_URL` to the
   backend HTTPS origin, for example `https://your-api.example.com` (no `/api`
   suffix). Set it in each environment that needs access and redeploy.
4. Log in and verify calendar loading, event creation, and persistence after
   refresh. A second account should receive its own calendar.

Locally, leave `VITE_API_BASE_URL` unset, run `calendarapi` on port 3001, and
run the frontend with `npm run dev`.

Existing events in the Supabase test calendar are not migrated to the C# API.
