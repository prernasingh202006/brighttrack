# BrightTrack

Centralized streetlight complaint reporting and repair tracking for urban areas. Residents sign up with a **verified email (6-digit code)**, report a faulty light at a **real, verified place** (address search or GPS) with optional **photos**, get a complaint ID, and follow it through **Pending → In Progress → Resolved**. Admins see every complaint, **assign a technician from a managed list**, resolve it with a **required note of what was fixed** (each change is logged with who and when), add internal notes, export CSV and spot repeat problem areas.

**Stack:** React 18 + Vite + Tailwind CSS · Node.js + Express · MongoDB + Mongoose · Zod (client and server) · JWT in httpOnly cookies · bcrypt hashing · Jest + Supertest.

**Assumptions made:** Mongo (Atlas) instead of Postgres; Vite SPA instead of Next.js; `bcryptjs` (pure-JS bcrypt, no native build); the admin note is internal and never shown to residents, but the **resolution note is shown to the resident and on the public tracking page** (it is the proof the fault was fixed); a complaint cannot be In Progress or Resolved without an assigned technician; any logged-in user (resident or admin) may file a complaint.

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

**users**: `name`, `email` (unique, lowercase), `phone` (optional, 10 digits), `passwordHash` (bcrypt, never returned), `role` (`resident`|`admin`), `createdAt`, `emailVerified` (accounts without the field count as verified), `verifyCodeHash` (HMAC of the code, never the code), `verifyExpiresAt`, `verifyAttempts`, `verifySentAt`, `unverifiedExpiresAt` (TTL index: unverified accounts delete themselves after 24 h)

**complaints**: `complaintId` (unique, `BT-XXXXX`), `user` → users, `location` (taken from the server-signed place), `coords {lat, lng}`, `locationKey` (≈110 m grid, for hotspots), `pole`, `type`, `description` (10–400), `unsafe`, `status`, `adminNote`, `technician` → technicians, `assignedTo` (name when assigned), `assignedAt`, `images[{_id, contentType, size, at}]`, `resolutionNote`, `resolvedAt`, `history[{status, changedBy → users, at, note}]`, `createdAt`, `updatedAt`

**technicians**: `name`, `phone?`, `area?`, `active` (deactivate instead of delete)

**images**: `complaint`, `owner`, `contentType` (jpeg/png/webp), `size`, `data` (bytes, never selected by default)

Indexes: `complaintId` (unique), `status`, `createdAt` (desc), `user`, `locationKey`, `(status, createdAt)`; users: `email` (unique).

## Run locally

Requirements: Node 18+ and a MongoDB (local or Atlas), **or** Docker.

```bash
# 1. install
npm run install:all

# 2. configure
cp server/.env.example server/.env     # set MONGODB_URI and JWT_SECRET (MAIL_PROVIDER=console is already set)
cp client/.env.example client/.env     # leave VITE_API_URL empty in dev

# 3. seed (admin + demo resident + 7 sample complaints)
npm run seed

# 4. run (two terminals)
npm run dev:server      # http://localhost:5000
npm run dev:client      # http://localhost:5173  (proxies /api to :5000)
```

**Sign-up codes in development:** with `MAIL_PROVIDER=console` no email is sent. The 6-digit code is **printed in the server terminal** (the one running `npm run dev:server`). Without any mail setting, sign-up is refused with a clear message.

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
| `EMAIL_DNS_CHECK` | Sign-up rejects email domains that cannot receive mail (default on, off in tests). Fails open if DNS is unreachable |
| `MAIL_PROVIDER` | `console` prints sign-up codes in the server terminal (local testing only; ignored in production) |
| `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` | Real verification emails via Brevo's HTTPS API (free plan: 300/day; verify the sender address in Brevo). **Required in production** |
| `GEO_CONTACT` | Contact email/URL sent to OpenStreetMap Nominatim (their policy asks apps to identify themselves) |
| `GEO_COUNTRY_CODES` | Countries address search is limited to (default `in`; empty = anywhere) |
| `NOMINATIM_URL` | Address-search service (default the public OpenStreetMap one; use a paid/self-hosted one at scale) |
| `SEED_ADMIN_NAME/EMAIL/PASSWORD` | Seed script admin |

**client/.env**: `VITE_API_URL`, the API base URL incl. `/api` (empty in dev and Docker).

## API

All responses: success `{ "success": true, "data": {...}, "meta"?: {...} }`, error `{ "success": false, "error": { "message", "code", "details"? } }`. State-changing requests must send `X-Requested-With: XMLHttpRequest` (the client does).

| Method & path | Auth | Description | Success | Errors |
|---|---|---|---|---|
| `POST /api/auth/register` | – | name, email, optional 10-digit phone, password ≥8, confirmPassword. Creates an **unverified** resident and emails a 6-digit code (no session until the code is entered). Rejects disposable-mailbox services, placeholder domains (`example.com`, `.test`, `.local`) and domains that cannot receive mail | 201 (`needsVerification`) | 400, 409 (verified email taken), 429, 502, 503 |
| `POST /api/auth/verify-email` | – | `{email, code}` (6 digits). Max 5 wrong tries per code, 10-minute expiry, single use. Success verifies the account **and starts the session** | 200 | 400 (`CODE_INVALID`, `CODE_EXPIRED`, `ALREADY_VERIFIED`), 429 |
| `POST /api/auth/resend-code` | – | `{email}`. 60 s cooldown. Answers the same whether or not the email exists | 200 | 429, 502 (email provider), 503 (not configured) |
| `POST /api/auth/login` | – | email, password; sets httpOnly cookie | 200 | 400, 401, 403 (`EMAIL_NOT_VERIFIED`), 429 |
| `POST /api/auth/logout` | – | clears cookie | 200 | |
| `GET /api/auth/me` | user | current user | 200 | 401 |
| `GET /api/geo/search?q=` | user | Address search (OpenStreetMap). Returns places, each with a **signed token** | 200 | 400, 401, 503 |
| `GET /api/geo/reverse?lat=&lng=` | user | Address for a GPS point, with a signed token | 200 | 400 (`OUT_OF_AREA`), 404, 503 |
| `POST /api/complaints` | user | `locationToken` (from the two routes above; typed text is rejected), pole?, type, description, unsafe. Address and coordinates come from inside the signed token | 201 (returns `complaintId`) | 400, 401 |
| `POST /api/complaints/:complaintId/images` | owner | **raw image bytes** (`Content-Type: image/jpeg|png|webp`, ≤2 MB). Type is checked from the bytes. Max 3 per complaint, none once resolved | 201 | 400, 401, 404, 413, 415 |
| `DELETE /api/complaints/:complaintId/images/:imageId` | owner | remove a photo | 200 | 400, 404 |
| `GET /api/images/:imageId` | owner or admin | the photo (others get 404) | 200 | 401, 404 |
| `GET /api/complaints/mine` | user | own complaints with status history (max 100) | 200 | 401 |
| `GET /api/complaints/mine/:complaintId` | owner | one own complaint | 200 | 401, 404 (also if not yours) |
| `GET /api/complaints/track/:complaintId` | – | public: type, location, status, history, and the resolution note once resolved (never the technician) | 200 | 400, 404 |
| `GET /api/complaints/recent` | – | latest 8: location, type, status, createdAt only | 200 | |
| `GET /api/complaints/stats` | – | total, pending, inProgress, resolved, unsafeOpen | 200 | |
| `GET /api/admin/complaints` | admin | `search`, `status`, `unsafe`, `sort` (createdAt, updatedAt, status, location), `order`, `page`, `limit`≤100 | 200 + `meta` | 400, 401, 403 |
| `PATCH /api/admin/complaints/:complaintId/assign` | admin | `{technicianId}` (an **active** technician). A Pending complaint becomes In Progress. Not allowed on a Resolved complaint | 200 | 400, 404 |
| `PATCH /api/admin/complaints/:complaintId/status` | admin | `{status, resolutionNote?}`. In Progress and Resolved need an assigned technician (`NEEDS_TECHNICIAN`); Resolved also needs `resolutionNote` (10–500 chars). Leaving Resolved reopens it and clears the resolution (kept in history). Appends to history with admin and time | 200 | 400 (invalid, unchanged, no technician, no note), 404 |
| `GET /api/admin/technicians` | admin | all technicians with their open-job counts | 200 | |
| `POST /api/admin/technicians` | admin | `{name, phone?, area?}` | 201 | 400, 409 (duplicate name) |
| `PATCH /api/admin/technicians/:technicianId` | admin | `{name?, phone?, area?, active?}` | 200 | 400, 404, 409 |
| `PATCH /api/admin/complaints/:complaintId/note` | admin | `{note}` ≤500 | 200 | 400, 404 |
| `DELETE /api/admin/complaints/:complaintId` | admin | delete | 200 | 404 |
| `GET /api/admin/complaints/export` | admin | CSV (same `search`/`status`/`unsafe` filters), formula-injection safe | 200 | |
| `GET /api/admin/hotspots` | admin | locations reported more than once | 200 | |
| `GET /api/health` | – | liveness + DB status | 200 / 503 | |

Other codes: 403 role or CSRF, 413 body over 10 KB, 429 rate limited.

## Security summary

Helmet · CORS restricted to `CLIENT_ORIGIN` · rate limits (global, login failures, registration) · body limit 10 KB · `$`/`.` keys stripped (NoSQL injection) and HTML stripped from text (XSS) · Email verification codes (HMAC-hashed, 5 tries, expiry, cooldown, unverified accounts auto-deleted) · server-signed locations (the client cannot invent or move a place) · photos checked by their bytes (SVG/GIF/scripts rejected), size-capped, owner/admin-only · Zod validation is authoritative · sign-up email domain checks (disposable, placeholder, reserved TLD, DNS) · ownership enforced by querying on `req.user._id` · roles re-read from the DB on every request · CSRF header check on writes · bcrypt cost 12 · constant-ish login timing · structured JSON logs (cookies redacted) · central error handler hides 5xx details in production.

## Deployment: Atlas + Render + Vercel

**1. MongoDB Atlas.** Create a free cluster → Database Access: add a user → Network Access: allow `0.0.0.0/0` (Render free has no fixed IP) → copy the connection string and add the DB name: `mongodb+srv://USER:PASS@cluster.mongodb.net/brighttrack?retryWrites=true&w=majority`.

**2. Render (API).** New → Web Service → connect the repo.
- Root Directory: `server` · Build: `npm ci` · Start: `npm start` · Health Check Path: `/api/health`
- Environment: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`), `CLIENT_ORIGIN` (set in step 4), **`BREVO_API_KEY` and `MAIL_FROM_EMAIL`** (the server refuses to start in production without them: create a free Brevo account, verify a sender address under *Senders*, create an API key under *SMTP & API*), `GEO_CONTACT` (your contact email)
- Seed the admin once from your machine (Render free has no shell):
  ```bash
  cd server && NODE_ENV=production MONGODB_URI='<atlas uri>' JWT_SECRET='<32+ chars>' CLIENT_ORIGIN='https://x' \
    BREVO_API_KEY='x' MAIL_FROM_EMAIL='you@example.com' \
    SEED_ADMIN_EMAIL='you@example.com' SEED_ADMIN_PASSWORD='<strong password>' npm run seed
  ```

**3. Vercel (frontend).** Import the repo → Root Directory `client` → Framework Vite → Build `npm run build` → Output `dist` → env `VITE_API_URL=https://<your-service>.onrender.com/api` → Deploy. `vercel.json` handles SPA routing.

**4. Production CORS origin.** On Render set `CLIENT_ORIGIN=https://<your-app>.vercel.app` (exact origin, no trailing slash; comma-separate to allow a custom domain too) and redeploy. Wrong value = browser "CORS error" and failed logins.

**Cookie caveat.** With Vercel and Render on different domains, the session cookie is cross-site (`SameSite=None; Secure`). Browsers that block third-party cookies (Safari, some Chrome settings) will break login. Fix: put both under one parent domain (`app.example.com` and `api.example.com`) and set `COOKIE_SAMESITE=lax` on the API.

## Manual test checklist

1. Landing loads with counts, lamps, recent list; no names/emails/phones anywhere.
2. Register: short password, mismatched confirm, 9-digit phone each show an error; a valid signup goes to *Check your email* (no login yet). Enter the code (from the server terminal in dev): a wrong code shows attempts left, the right one logs you in. Try *Send a new code* (60 s countdown) and logging in before verifying (it sends you back to the code screen).
3. Duplicate email shows "already exists"; wrong password shows "Invalid email or password"; after `AUTH_RATE_LIMIT_MAX` (default 20) failed logins you get 429 (only when `NODE_ENV` is not `test`; raise `AUTH_RATE_LIMIT_MAX` to see it sooner).
4. Report a fault: you cannot submit without choosing a place; typing text without searching does nothing; **Search** a real street and pick a result (map preview appears); **Use my current location** works on HTTPS/localhost; a 9-char description and no type are rejected; add 1–3 photos (a 5 MB phone photo is shrunk automatically); success shows `BT-XXXXX`.
5. My complaints shows it with a Pending badge, one history entry, a map link and your photos (add or remove photos while it is open).
6. Track: lowercase ID works; unknown ID shows not found; malformed ID shows a format error.
7. As resident open `/admin` → redirected; `curl` any `/api/admin/*` with the resident cookie → 403.
8. Log in as admin: counts correct; search, status filter, sort headers, pagination work.
9. Repair workflow: open **Technicians** and add a few; on a Pending complaint click **Assign technician** and choose one from the list → it becomes In Progress and shows the technician. Click **Mark resolved**: an empty or short note is rejected; a real note resolves it. The resident's My complaints and Track now show *What was done*; the technician's name and admin name appear only in the admin view (and the technician's name in the resident's own My complaints). **Reopen** brings it back to In Progress and removes the resolution from the resident's view.
9b. Admin sees the resident's photos and a map link in *Note & history*. Sign-up rejects `x@mailinator.com`, `x@example.com`, `x@company.test` and a made-up domain like `x@gmial-typo-zz.com`, with the message under the email field.
10. Add a note; delete asks for confirmation; export CSV opens in Excel.
11. File two reports at the same location → appears under Repeat problem areas.
12. Toggle dark/light; tab through every form (visible focus); resize to 360px, no horizontal scroll.
13. Stop the API → pages show an error state with retry, not a blank screen.

## Known limitations

- Email is verified by a code, so only real, reachable mailboxes can sign up. The disposable-domain blocklist is a starter list in `server/src/utils/emailCheck.js` (a throwaway inbox that really receives mail can still verify); swap in the `disposable-email-domains` package for a bigger list.
- Brevo's free plan sends 300 emails/day, and mail from a free sender address (e.g. Gmail) may land in spam. Use a sender on your own domain for production.
- No password reset (the email infrastructure now exists to add it) or account lockout beyond IP rate limiting.
- Technicians are records managed by admins, not accounts: they cannot log in or update jobs themselves, and reassigning an In Progress complaint is not added to the status history.
- Address search uses the free public OpenStreetMap Nominatim service (about 1 request/second, results cached and queued, login required). Coverage of Indian street names varies; use a paid geocoder or self-host Nominatim at scale. GPS accuracy is whatever the device reports.
- Photos are stored inside MongoDB (≤2 MB each, 3 per complaint) so no extra service is needed. On Atlas free (512 MB) that is roughly 300–1,000 complaints with photos; move to object storage (S3/Cloudinary) beyond that. In production the frontend and API should share a parent domain, otherwise some browsers block the cross-site cookie that photos and login rely on.
- The map preview is an OpenStreetMap iframe: no pin dragging.
- The resident cannot yet confirm or dispute a resolution; an admin must reopen it.
- Rate-limit counters are in memory, per instance (use a shared store such as Redis when scaling out).
- JWTs are stateless: logout clears the cookie but a copied token stays valid until it expires (7 days).
- Registration reveals whether a verified email is taken (409).
- My complaints is capped at 100 items with no pagination; CSV export is capped at 10,000 rows.
- Public lookup exposes location, type and status history to anyone holding the ID.
- Client validation is a copy of the server schemas, not shared code; keep both in sync.
- Client has unit tests for validation only; no component or end-to-end tests.
- Google Fonts are loaded from the CDN.

## Future scope hooks (not implemented)

- **Password reset by emailed code:** reuse `server/src/utils/verification.js` and `mailer.js`.
- **Technician accounts and before/after photos:** add a `technician` role and let them upload a repair photo on resolve.
- **Resident confirms the fix:** a confirm/dispute step after Resolved.
- **Email / SMS notifications:** controllers emit `complaint.created`, `complaint.assigned` and `complaint.statusChanged` on `server/src/utils/notifier.js`; add listeners there.
