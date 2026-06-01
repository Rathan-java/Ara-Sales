# Ara Sales — Project Guide

This file keeps future sessions scoped and consistent. Read it before changing
anything.

## Locked tech stack — DO NOT substitute

- **Mobile = Flutter** (Android + iOS, single codebase). All mobile code is Flutter.
- **Web admin = React** (Vite).
- **Backend = Node.js + Express.**
- **Database = MySQL** via the `mysql2` driver. Knex is used for migrations and
  queries — no heavy ORM.
- **Maps = OpenStreetMap tiles** (free, no API key): Leaflet on web, flutter_map
  on mobile.
- **Photo storage = pluggable** behind one interface (`backend/src/storage`):
  `local` (disk, dev), `mysql` (LONGBLOB `photo_blobs` table — no object store
  needed, served at `/api/photos/:key`), or `azure` (Blob). Switch via
  `STORAGE_DRIVER`, no code change. Photos are downscaled/recompressed
  (`image.service.js`, jimp) to ~40-120 KB before saving.
- **Auth = email + password + JWT** (bcrypt). Email **OTP is recovery-only**
  (forgot-password), sent via Gmail SMTP (Nodemailer). Role-based authz is
  enforced server-side. Reset OTPs are stored bcrypt-hashed in `password_resets`,
  single-use, expiring; `DEV_OTP` is accepted only when `NODE_ENV=development`.

## Scope rule — DO NOT add features beyond spec

Build exactly what is specified. **Out of scope (do not build):** team chat, AI
assistant, expense management, dynamic form builder, face recognition, heat maps,
predictive analytics, WhatsApp/SMS, route optimization, multi-level roles.

## Business rules (implemented in code — keep them here in one place)

- **Monthly target = two parts:** a client-count target and a revenue (₹) target,
  set per rep per month by the admin. Targets are strictly monthly, keyed by
  `YYYY-MM`. No custom date ranges.
- **"Either One" rule:** a month is **Achieved** if the rep hits **at least one**
  of the two targets. Both are not required.
- **Incentive — revenue surplus only, no cap (v1):**
  - `surplus_pct = (achieved_amount − revenue_target) / revenue_target × 100`
  - `incentive = surplus_pct% × monthly_salary`
  - Paid **only** when there is a positive revenue surplus. Client-count surplus
    is a display-only stat and pays nothing.
  - The cap/multiplier exists as config (`INCENTIVE_*`), **default off**, so it
    can be enabled later without code changes.
- **Salary is admin-only.** Never expose a rep's salary to the rep or other reps.
  The rep sees only the resulting incentive amount, and only when there is a
  surplus.

These rules live in **`backend/src/services/incentive.service.js`** (pure,
unit-tested). The visit anti-fraud logic lives in
**`backend/src/services/visit.service.js`** (pure, unit-tested). Do not duplicate
this logic elsewhere — import it.

## Conventions

- **Money:** always fixed-precision decimals. DB columns are `DECIMAL(12,2)`;
  in JS, parse to integer paise for arithmetic (see `toPaise`/`fromPaise`). Never
  use floats for currency. Knex is configured with `decimalNumbers: false` so
  money comes back as strings.
- **Time:** all visit/code stamps use **server time** (`backend/src/utils/time.js`),
  never the client clock.
- **Validation:** every API endpoint validates input with zod via the
  `validate({ body|query|params })` middleware.
- **Errors:** throw `ApiError` (or pass to `next`); the centralized
  `errorHandler` shapes all responses as `{ error: { message, details? } }`.
- **Auth:** routes use `authenticate` + `requireRole('admin'|'rep')`. Role comes
  from the signed JWT only — never trust role from the client.
- **Rep vs admin data:** `dashboard.service.repMonthSummary(..., { includeSalary })`
  gates salary exposure. Rep-facing callers MUST pass `includeSalary: false`.

## Layout

```
backend/src
  config/        env config
  db/            knex instance, migrations, seeds
  middleware/    auth, validate, error
  routes/        auth, admin, rep
  services/      incentive (pure), visit (pure), auth, dashboard, export
  storage/       storage interface (local disk driver)
  utils/         time helpers
web/src          React pages (Overview, Sales, Movement, Visits, Setup) + api client
mobile/lib       Flutter screens + services (api, auth, location, visit)
db/schema.sql    reference SQL (authoritative source is the Knex migration)
```

## Tests

- `cd backend && npm test` — pure unit tests (no DB). Must stay green. Covers the
  incentive worked example, "no surplus = no incentive", "client surplus pays
  nothing", Either-One (3 cases), geofence, and visit-code/mock-GPS rejections.
- `cd backend && npm run test:api` — API integration tests (needs MySQL + seed):
  password login (+ wrong-password), forgot/reset flow, RBAC, salary-never-leaks,
  validation, visit rejection, Excel export. `npm run test:auth` covers
  expired/used reset OTP and DEV_OTP-dev-only. `npm run test:retention` covers
  photo cleanup (old deleted, new kept, visit record preserved, days=0 disables).
- `cd mobile && flutter test` — rep-side display rule (incentive only on surplus;
  no salary field).

## Schema (11 tables)

`users, targets, salaries, clients, sales_entries, work_sessions, location_pings,
visits, visit_photos, incentives, export_logs`. `work_sessions` groups 5-minute
pings into one trip. Later migrations add `password_resets` (auth recovery) and
`photo_blobs` (used only when `STORAGE_DRIVER=mysql`).

## Don't

- Don't swap any locked technology.
- Don't add out-of-scope features.
- Don't leak salary to reps.
- Don't trust client-supplied role, time, or geofence results — re-verify server-side.
- Don't store visit photos for rejected captures.
- Photo retention: photos auto-delete after `PHOTO_RETENTION_DAYS` (default 60).
  The cleanup removes the file + `visit_photos` row but KEEPS the `visit` audit
  record. Logic is in `services/retention.service.js` (pure-ish, tested); the
  scheduler is `retention.scheduler.js`. Don't delete whole visits on expiry.
