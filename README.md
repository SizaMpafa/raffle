# Collective Raffles

Vue 3 (Vercel) -> Node/Express API (Render) -> Supabase Postgres.

```
supabase/schema.sql   tables, views, add_entry() and draw_raffle() functions, locked-down permissions
backend/              Express API. The ONLY thing that talks to Supabase.
frontend/             Vue 3 + Vite app (Run a raffle, Participants, Past raffles)
```

## How the pieces fit

- The browser never talks to Supabase. It talks to the Node API with an organiser passcode.
- The Node API holds the Supabase **service role key** and calls the database.
- "Add a person" (new or returning, R5, R10 or both) is ONE database call (`add_entry`), so a new
  participant is never saved without their raffle entry.
- "Draw" is ONE database call (`draw_raffle`). It picks winners with a secure random shuffle and can
  only ever run once per raffle.

## 1. Supabase

1. Create a project.
2. SQL Editor > New query > paste all of `supabase/schema.sql` > Run.
3. Project Settings > API: copy the **Project URL** and the **service_role (secret) key**.

## 2. Run it locally

```bash
# API
cd backend
cp .env.example .env      # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSCODE
npm install
npm run dev               # http://localhost:3000

# Frontend (second terminal)
cd frontend
cp .env.example .env      # VITE_API_URL=http://localhost:3000
npm install
npm run dev               # http://localhost:5173
```

## 3. Deploy the API on Render

New > Web Service > connect the repo.

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |

Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSCODE`, and
`FRONTEND_URL` (set this after step 4). Check `https://YOUR-API.onrender.com/api/health` returns `{"ok":true}`.

## 4. Deploy the frontend on Vercel

Add New > Project > same repo.

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework | Vite (auto-detected) |
| Environment variable | `VITE_API_URL` = your Render URL, no trailing slash |

Then go back to Render and set `FRONTEND_URL` to your Vercel URL (exact, no trailing slash) and redeploy.
If the app says it "cannot reach the server" while the API is up, this value is almost always the cause.

## Free-tier behaviour to plan for

- **Render free web services spin down after 15 minutes without traffic.** The first request afterwards is
  slow (the login screen warns about this). Open the app a minute before the raffle starts.
- **Supabase free projects pause after 1 week of inactivity** and must be restored by hand in the dashboard.
  Data is kept, but the app is down until you do.
- `GET /api/health` also touches the database. An uptime monitor (for example UptimeRobot) pinging it every
  few minutes keeps both awake. That is a workaround, not something Render officially supports. For a platform
  people rely on weekly, Supabase Pro stops the pausing.

## Security notes

- One shared passcode protects the whole app. It is checked on the server, rate limited, and kept in
  `sessionStorage` (closing the tab logs out). Participants' phone numbers and emails are personal information,
  so do not share the passcode widely. If several organisers need their own logins, move to Supabase Auth later.
- All tables have Row Level Security on with no policies, and the public Supabase key is never used, so nobody
  can read the data except through this API.
