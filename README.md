# BrightTrack

Centralized streetlight complaint reporting and repair tracking for urban areas. Residents report a faulty light with a location and description, get a complaint ID, and follow it through **Pending → In Progress → Resolved**. Admins see every complaint, change status (each change is logged with who and when), add notes, export CSV and spot repeat problem areas.

**Stack:** React 18 + Vite + Tailwind CSS · Node.js + Express · MongoDB + Mongoose · Zod (client and server) · JWT in httpOnly cookies · bcrypt hashing · Jest + Supertest.

**Assumptions made:** Mongo (Atlas) instead of Postgres; Vite SPA instead of Next.js; `bcryptjs` (pure-JS bcrypt, no native build); one admin note per complaint is internal and never shown to residents; any logged-in user (resident or admin) may file a complaint.

## Screenshots

| Landing (light) | Landing (dark) |
|---|---|
| ![Landing light](docs/screenshots/landing-light.png) | ![Landing dark](docs/screenshots/landing-dark.png) |

| Admin dashboard | Report success | Track (mobile) |
|---|---|---|
| ![Admin](docs/screenshots/admin.png) | ![Report](docs/screenshots/report-success.png) | ![Track](docs/screenshots/track-mobile.png) |

## Folder structure

```
brighttrack/
├── client/                    React + Vite + Tailwind
│   ├── src/
│   │   ├── components/        Layout, ui.jsx (Field, Modal, StatusBadge…), Lamps.jsx (LampRow, ProgressTracker, Timeline)
│   │   ├── context/           AuthContext, ThemeContext
│   │   ├── lib/               api (axios), schemas (Zod), constants, format
│   │   └── pages/             Landing, Login, Register, Report, MyComplaints, Track, AdminDashboard
│   ├── Dockerfile, nginx.conf, vercel.json, .env.example
├── server/                    Express API
│   ├── src/
│   │   ├── config/            env (validated), db
│   │   ├── controllers/       auth, complaint, admin
│   │   ├── middleware/        auth, validate, sanitize, security (rate limit + CSRF), errorHandler
│   │   ├── models/            User, Complaint
│   │   ├── routes/            index.js (all routes)
│   │   ├── scripts/seed.js
│   │   ├── utils/             logger, ApiError, helpers, notifier (future hook)
│   │   └── validators/        Zod schemas
│   ├── tests/                 Jest + Supertest
│   ├── Dockerfile, .env.example
├── docker-compose.yml
├── .github/workflows/ci.yml
└── package.json               convenience scripts
```

## Database schema

**users**: `name`, `email` (unique, lowercase), `phone` (optional, 10 digits), `passwordHash` (bcrypt, never returned), `role` (`resident`|`admin`), `createdAt`

**complaints**: `complaintId` (unique, `BT-XXXXX`), `user` → users, `location`, `locationKey` (normalized, for hotspots), `pole`, `type`, `description` (10–400), `unsafe`, `status`, `adminNote`, `history[{status, changedBy → users, at}]`, `createdAt`, `updatedAt`; future-scope hooks `attachments`, `coords` (not exposed)

Indexes: `complaintId` (unique), `status`, `createdAt` (desc), `user`, `locationKey`, `(status, createdAt)`; users: `email` (unique).

## Run locally

Requirements: Node 18+ and a MongoDB (local or Atlas), **or** Docker.

```bash
# 1. install
npm run install:all

# 2. configure
cp server/.env.example server/.env     # set MONGODB_URI and JWT_SECRET
cp client/.env.example client/.env     # leave VITE_API_URL empty in dev

# 3. seed (admin + demo resident + 7 sample complaints)
npm run seed

# 4. run (two terminals)
npm run dev:server      # http://localhost:5000
npm run dev:client      # http://localhost:5173  (proxies /api to :5000)
```

**Docker:** `docker compose up --build`, then `docker compose exec server npm run seed`. App at http://localhost:8080.

### Demo logins (created by the seed, development only)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@brighttrack.local` | `ChangeMe123!` |
| Resident | `resident@brighttrack.local` | `Resident123!` |

**Change or remove these before any real deployment.** In production the seed refuses to run without `SEED_ADMIN_PASSWORD` and skips the demo resident and samples.

### Scripts

| | server | client |
|---|---|---|
| dev | `npm run dev` | `npm run dev` |
| build | `npm run build` (no-op) | `npm run build` |
| start | `npm start` | `npm start` (vite preview) |
| test | `npm test` | `npm test` (vitest) |
| lint | `npm run lint` | `npm run lint` |

Server tests use `mongodb-memory-server`. If it cannot download a MongoDB binary (offline / restricted network), point the tests at any running MongoDB: `TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test` (each run uses a throwaway database).

## Environment variables

**server/.env**

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | ≥16 chars (≥32 in production) |
| `CLIENT_ORIGIN` | Frontend origin(s) allowed by CORS, comma-separated, no trailing slash |
| `JWT_EXPIRES_DAYS` | Session length (default 7) |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` | Default: dev `lax`/insecure, production `none`/secure |
| `API_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX` | Rate limits per 15 min / auth attempts |
| `SEED_ADMIN_NAME/EMAIL/PASSWORD` | Seed script admin |

**client/.env**: `VITE_API_URL`, the API base URL incl. `/api` (empty in dev and Docker).

## API

All responses: success `{ "success": true, "data": {...}, "meta"?: {...} }`, error `{ "success": false, "error": { "message", "code", "details"? } }`. State-changing requests must send `X-Requested-With: XMLHttpRequest` (the client does).

| Method & path | Auth | Description | Success | Errors |
|---|---|---|---|---|
| `POST /api/auth/register` | – | name, email, optional 10-digit phone, password ≥8, confirmPassword. Always creates a resident | 201 | 400, 409 (email taken), 429 |
| `POST /api/auth/login` | – | email, password; sets httpOnly cookie | 200 | 400, 401, 429 |
| `POST /api/auth/logout` | – | clears cookie | 200 | |
| `GET /api/auth/me` | user | current user | 200 | 401 |
| `POST /api/complaints` | user | location, pole?, type, description, unsafe | 201 (returns `complaintId`) | 400, 401 |
| `GET /api/complaints/mine` | user | own complaints with status history (max 100) | 200 | 401 |
| `GET /api/complaints/mine/:complaintId` | owner | one own complaint | 200 | 401, 404 (also if not yours) |
| `GET /api/complaints/track/:complaintId` | – | public: type, location, status, history | 200 | 400, 404 |
| `GET /api/complaints/recent` | – | latest 8: location, type, status, createdAt only | 200 | |
| `GET /api/complaints/stats` | – | total, pending, inProgress, resolved, unsafeOpen | 200 | |
| `GET /api/admin/complaints` | admin | `search`, `status`, `unsafe`, `sort` (createdAt, updatedAt, status, location), `order`, `page`, `limit`≤100 | 200 + `meta` | 400, 401, 403 |
| `PATCH /api/admin/complaints/:complaintId/status` | admin | `{status}`; appends to history with admin and time | 200 | 400 (invalid or unchanged), 404 |
| `PATCH /api/admin/complaints/:complaintId/note` | admin | `{note}` ≤500 | 200 | 400, 404 |
| `DELETE /api/admin/complaints/:complaintId` | admin | delete | 200 | 404 |
| `GET /api/admin/complaints/export` | admin | CSV (same `search`/`status`/`unsafe` filters), formula-injection safe | 200 | |
| `GET /api/admin/hotspots` | admin | locations reported more than once | 200 | |
| `GET /api/health` | – | liveness + DB status | 200 / 503 | |

Other codes: 403 role or CSRF, 413 body over 10 KB, 429 rate limited.

## Security summary

Helmet · CORS restricted to `CLIENT_ORIGIN` · rate limits (global, login failures, registration) · body limit 10 KB · `$`/`.` keys stripped (NoSQL injection) and HTML stripped from text (XSS) · Zod validation is authoritative · ownership enforced by querying on `req.user._id` · roles re-read from the DB on every request · CSRF header check on writes · bcrypt cost 12 · constant-ish login timing · structured JSON logs (cookies redacted) · central error handler hides 5xx details in production.

## Deployment: Atlas + Render + Vercel

**1. MongoDB Atlas.** Create a free cluster → Database Access: add a user → Network Access: allow `0.0.0.0/0` (Render free has no fixed IP) → copy the connection string and add the DB name: `mongodb+srv://USER:PASS@cluster.mongodb.net/brighttrack?retryWrites=true&w=majority`.

**2. Render (API).** New → Web Service → connect the repo.
- Root Directory: `server` · Build: `npm ci` · Start: `npm start` · Health Check Path: `/api/health`
- Environment: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`), `CLIENT_ORIGIN` (set in step 4)
- Seed the admin once from your machine (Render free has no shell):
  ```bash
  cd server && NODE_ENV=production MONGODB_URI='<atlas uri>' JWT_SECRET='<32+ chars>' CLIENT_ORIGIN='https://x' \
    SEED_ADMIN_EMAIL='you@example.com' SEED_ADMIN_PASSWORD='<strong password>' npm run seed
  ```

**3. Vercel (frontend).** Import the repo → Root Directory `client` → Framework Vite → Build `npm run build` → Output `dist` → env `VITE_API_URL=https://<your-service>.onrender.com/api` → Deploy. `vercel.json` handles SPA routing.

**4. Production CORS origin.** On Render set `CLIENT_ORIGIN=https://<your-app>.vercel.app` (exact origin, no trailing slash; comma-separate to allow a custom domain too) and redeploy. Wrong value = browser "CORS error" and failed logins.

**Cookie caveat.** With Vercel and Render on different domains, the session cookie is cross-site (`SameSite=None; Secure`). Browsers that block third-party cookies (Safari, some Chrome settings) will break login. Fix: put both under one parent domain (`app.example.com` and `api.example.com`) and set `COOKIE_SAMESITE=lax` on the API.

## Manual test checklist

1. Landing loads with counts, lamps, recent list; no names/emails/phones anywhere.
2. Register: short password, mismatched confirm, 9-digit phone each show an error; valid signup logs you in.
3. Duplicate email shows "already exists"; wrong password shows "Invalid email or password"; after `AUTH_RATE_LIMIT_MAX` (default 20) failed logins you get 429 (only when `NODE_ENV` is not `test`; raise `AUTH_RATE_LIMIT_MAX` to see it sooner).
4. Report a fault: empty location, 9-char description and no type are rejected; success shows `BT-XXXXX` and Copy works.
5. My complaints shows it with a Pending badge and one history entry.
6. Track: lowercase ID works; unknown ID shows not found; malformed ID shows a format error.
7. As resident open `/admin` → redirected; `curl` any `/api/admin/*` with the resident cookie → 403.
8. Log in as admin: counts correct; search, status filter, sort headers, pagination work.
9. Change a status → toast; resident's My complaints and Track update; history shows time (and admin name in admin view only).
10. Add a note; delete asks for confirmation; export CSV opens in Excel.
11. File two reports at the same location → appears under Repeat problem areas.
12. Toggle dark/light; tab through every form (visible focus); resize to 360px, no horizontal scroll.
13. Stop the API → pages show an error state with retry, not a blank screen.

## Known limitations

- No email verification, password reset, or account lockout beyond IP rate limiting.
- Rate-limit counters are in memory, per instance (use a shared store such as Redis when scaling out).
- JWTs are stateless: logout clears the cookie but a copied token stays valid until it expires (7 days).
- Registration reveals whether an email is taken (409).
- My complaints is capped at 100 items with no pagination; CSV export is capped at 10,000 rows.
- Public lookup exposes location, type and status history to anyone holding the ID.
- Client validation is a copy of the server schemas, not shared code; keep both in sync.
- Client has unit tests for validation only; no component or end-to-end tests.
- Google Fonts are loaded from the CDN.

## Future scope hooks (not implemented)

- **Image upload:** `Complaint.attachments` field; add a route and storage adapter.
- **GPS capture / map view:** `Complaint.coords` field; add a 2dsphere index and a map page.
- **Email / SMS:** controllers emit `complaint.created` and `complaint.statusChanged` on `server/src/utils/notifier.js`; add listeners there.
