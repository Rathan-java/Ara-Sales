# Ara Sales

A lightweight, two-role sales-rep monitoring application for **Ara Discoveries**.

- **Management (Super Admin) — Web (React):** set monthly targets & salary per rep,
  monitor sales & leads, view live/historical field movement on a map, review
  verified visit photos, and export everything to Excel.
- **Sales Rep — Mobile (Flutter):** see a personal monthly dashboard, add sales,
  start/stop field tracking, and capture tamper-proof client-visit photos.

## Tech stack (locked)

| Layer        | Technology                                             |
|--------------|--------------------------------------------------------|
| Mobile       | Flutter (Android + iOS, one codebase)                  |
| Web admin    | React (Vite)                                           |
| Backend      | Node.js + Express                                      |
| Database     | MySQL (`mysql2` driver, Knex for migrations/queries)   |
| Maps         | OpenStreetMap — Leaflet (web), flutter_map (mobile)    |
| Photo storage| Local disk behind a storage interface (swappable)      |
| Auth         | Email + password (JWT); email OTP for password reset   |

## Repository layout

```
/backend   Node + Express + MySQL API (Knex migrations & seed, tests)
/web       React admin dashboard (Vite + react-leaflet)
/mobile    Flutter rep app
/db        Reference SQL schema
README.md  this file
PROJECT_GUIDE.md  locked stack, conventions, business rules, scope guard
```

---

## Prerequisites

- **Node.js ≥ 18** (developed/tested on Node 22)
- **MySQL ≥ 8** running locally
- **Flutter ≥ 3.19** (for the mobile app)

---

## 1) Backend

```bash
cd backend
cp .env.example .env          # then edit DB_* and JWT_SECRET
npm install

# create schema + demo data (one admin, two reps, sample sales/visits/route)
npm run migrate
npm run seed
# (or do all three at once: npm run db:reset)

npm start                     # -> http://localhost:4000
```

Health check: `GET http://localhost:4000/api/health`

**Seed accounts** — all seeded users share the default password **`ChangeMe@123`**
(bcrypt-hashed in the seed; change it after first login):

| Role  | Email             | Password       |
|-------|-------------------|----------------|
| Admin | `admin@ara.test`  | `ChangeMe@123` |
| Rep   | `ravi@ara.test`   | `ChangeMe@123` |
| Rep   | `meena@ara.test`  | `ChangeMe@123` |

### Authentication

Login is **email + password**. The email **OTP is used ONLY for password
recovery** (not for normal login).

| Endpoint | Body | Purpose |
|----------|------|---------|
| `POST /api/auth/login` | `{ email, password }` | Verify password (bcrypt) → JWT. Rate-limited (5 / email / 15 min). |
| `POST /api/auth/forgot-password` | `{ email }` | Issue a 6-digit OTP, store it **hashed**, email it via Gmail SMTP. Always returns a generic success (no account enumeration). Rate-limited (3 / email / 15 min). |
| `POST /api/auth/verify-reset-otp` | `{ email, otp }` | Check the code (unused, unexpired). In development, `DEV_OTP` is accepted. |
| `POST /api/auth/reset-password` | `{ email, otp, newPassword }` | Re-verify OTP, set new password (min 8 chars), consume the OTP. |
| `POST /api/admin/users` | `{ name, email, role, password? }` | Admin creates a user with an optional initial password. |
| `PUT /api/admin/users/:id` | `{ name?, phone?, role?, password? }` | Admin edits a user / sets a new password. |

**Forgot-password flow:** email → 6-digit OTP (emailed) → set new password → log in.
In **development** (`NODE_ENV=development`), the fixed `DEV_OTP` (default `000000`)
is accepted so you can test without reading email. It is rejected in production.

**Email setup (Gmail SMTP):** set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in
`backend/.env` (use a Google *App Password*, not your normal password). If they
are missing, the server logs a startup warning and prints reset codes to the
console instead of emailing them — so the flow still works in dev.

### Backend tests

```bash
cd backend
npm test          # pure business-logic unit tests (no DB needed) — 25 tests
npm run test:api  # API integration tests (needs MySQL + the seed) — incl. password login + reset
npm run test:auth # auth service: expired/used OTP, DEV_OTP dev-only (needs MySQL)
```

`npm test` covers the incentive math, the Either-One rule, geofence (Haversine),
and the visit-code / mock-location rejections. The worked example
(₹1,00,000 target, ₹1,20,000 achieved, ₹20,000 salary → 20% → **₹4,000**) is
asserted directly.

---

## 2) Web admin (React)

```bash
cd web
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:4000
npm install
npm run dev                   # -> http://localhost:5173
```

Log in with `admin@ara.test` / `ChangeMe@123`. A **Forgot password?** link runs
the 3-step email-OTP reset. Pages: Overview, Sales (with product/lead filters),
Movement (Leaflet timeline), Visits (photos + flags), Targets & Salary, and
one-click **Export to Excel**.

---

## 3) Mobile app (Flutter)

```bash
cd mobile
flutter create .              # generate android/ + ios/ (keeps lib/ intact)
flutter pub get
```

Add camera/location permissions as described in
[`mobile/PLATFORM_SETUP.md`](mobile/PLATFORM_SETUP.md), then:

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:4000 \
  --dart-define=PING_INTERVAL_SECONDS=300
```

Log in with `ravi@ara.test` / `ChangeMe@123`. A **Forgot Password?** link runs
the 3-step email-OTP reset. Flows: dashboard (Achieved / Pending, incentive only
when there's a revenue surplus — salary never shown), add sale, Start/End Work
(5-minute GPS pings), and the camera visit flow with the stamped overlay.

Mobile unit test:

```bash
flutter test
```

---

## How the anti-fraud visit check works

1. **Start Visit** → server issues a single-use, short-lived code (~90s) tied to
   rep + client, plus a server timestamp.
2. App captures a photo with the **camera only** (no gallery/file picker) and
   burns the code, server time, and GPS into a fixed overlay.
3. **Submit** → server re-verifies: the one-time code (correct, unused,
   unexpired), the **geofence** (Haversine vs the client's reference point,
   ≤ 150 m), and a **mock-/fake-GPS** flag.
   - invalid code or mock GPS → **reject** (photo not stored)
   - out of geofence → **flag** (stored, surfaced to admin)
   - all pass → **pass**
   - a brand-new client with no reference adopts the first verified capture as
     its reference point.

All timestamps use **server time**, never the phone clock.

---

## Photo storage options

Visit photos can be stored three ways — pick via `STORAGE_DRIVER`; no code change:

| `STORAGE_DRIVER` | Where photos go | Needs | Best for |
|------------------|-----------------|-------|----------|
| `local` | Disk `./uploads` | nothing | local dev |
| `mysql` | A `photo_blobs` LONGBLOB table | **only your MySQL** | deploying with no object store |
| `azure` | Azure Blob Storage | a Storage account | large scale / lowest DB load |

Before storing, every photo is **downscaled and recompressed** (longest side
`PHOTO_MAX_DIMENSION`=1080 px, JPEG `PHOTO_JPEG_QUALITY`=60) — a 3–4 MB phone
photo becomes ~40–120 KB. Combined with the 60-day retention below, the `mysql`
driver stays small and cheap, so **you can deploy with only MySQL** and add Blob
later by changing one env var. With `mysql`, photos are served by the app at
`GET /api/photos/:key` (public, like the local `/uploads`).

## Visit-photo retention (auto-cleanup)

Visit photos are kept for **`PHOTO_RETENTION_DAYS` (default 60 ≈ 2 months)**, then
automatically deleted to cap storage and cost. When a photo expires, its **file**
(local disk or Azure Blob) and its `visit_photos` **row** are removed, but the
parent **`visit` record is kept** — so the anti-fraud audit trail (status,
geofence/mock flags, GPS, timestamps) survives even after the image is purged.

Three ways it runs (all use the same logic in `services/retention.service.js`):

| Mechanism | How |
|-----------|-----|
| **Automatic (in-process)** | A scheduler sweeps every `RETENTION_SWEEP_HOURS` (default 24h), starting ~1 min after boot. On by default. |
| **On demand (admin)** | `POST /api/admin/photos/purge` (admin only). Optional `?days=N` overrides the window for that run. |
| **External cron** | `npm run purge:photos [days]` — a one-shot script. Set `RETENTION_SWEEP_HOURS=0` to use this instead of the in-process sweeper. |

Set `PHOTO_RETENTION_DAYS=0` to disable deletion entirely (keep photos forever).
Tested in `tests/retention.test.js` (`npm run test:retention`): old photo removed,
newer kept, visit record preserved, `days=0` disables.

---

## Environment variables

Each app ships an `.env.example` documenting every variable. Secrets are never
hardcoded. Key ones: `backend/.env` (DB, `JWT_SECRET`, storage, incentive/geofence
config), `web/.env` (`VITE_API_BASE_URL`), mobile via `--dart-define`
(`API_BASE_URL`, `PING_INTERVAL_SECONDS`).

## Deployment (Azure)

The app is cloud-ready with **no code changes** — only environment values differ
between local and production. See **[DEPLOY-AZURE.md](DEPLOY-AZURE.md)** for the
full step-by-step (App Service + Azure Database for MySQL + Blob Storage + Static
Web Apps). Production templates: `backend/.env.production.example`,
`web/.env.production.example`.

What flips on for production (all via env vars):

| Concern | Setting |
|---------|---------|
| Durable photo storage | `STORAGE_DRIVER=azure` + `AZURE_STORAGE_*` (instead of local disk) |
| Database TLS | `DB_SSL=true` (required by Azure MySQL) |
| Migrations on boot | `AUTO_MIGRATE=true` (no separate release step; never seeds) |
| Behind a proxy | `TRUST_PROXY=1` (correct client IP for rate-limiting) |
| Hardening | `helmet` security headers + `compression` are always on |
