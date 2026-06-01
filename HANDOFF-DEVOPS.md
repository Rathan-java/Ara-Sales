# Ara Sales — Backend Handoff for DevOps

This document tells you everything needed to deploy the **backend API**.

## 1. The code

- Repo: **https://github.com/Rathan-java/Ara-Sales** (branch `main`)
- Backend lives in **`/backend`** (Node.js + Express + MySQL via Knex).
- Full deploy runbook: **[DEPLOY-AZURE.md](DEPLOY-AZURE.md)** — App Service +
  Azure Database for MySQL. **No Storage account is required** (photos are stored
  in MySQL and auto-compressed; see `STORAGE_DRIVER=mysql`).

## 2. Build & run (what the platform runs)

```bash
cd backend
npm ci                 # install deps (uses package-lock.json)
npm start              # = node src/server.js  (App Service default)
```

- Node **20.x** (see `engines` in `backend/package.json`).
- App Service injects `PORT`; the app reads it automatically.
- With `AUTO_MIGRATE=true`, DB schema migrations run on boot — no separate step.
- Health check: `GET /api/health` → `{"ok":true}`.

## 3. Secrets / environment variables (set in Azure — NOT in the repo)

The repo contains **only placeholders**. Set the real values as App Service
**Application Settings** (or, preferred, **Azure Key Vault** references). Template:
`backend/.env.production.example`.

| Variable | What to put | Who provides |
|----------|-------------|--------------|
| `NODE_ENV` | `production` | fixed |
| `CORS_ORIGINS` | the deployed web admin URL | DevOps |
| `DB_HOST` | `<server>.mysql.database.azure.com` | DevOps (their MySQL) |
| `DB_PORT` | `3306` | fixed |
| `DB_USER` | MySQL admin user | DevOps |
| `DB_PASSWORD` | MySQL password | **DevOps sets their own** |
| `DB_NAME` | `ara_sales` | fixed |
| `DB_SSL` | `true` (Azure MySQL needs TLS) | fixed |
| `JWT_SECRET` | a long random string (`openssl rand -hex 32`) | **DevOps generates** |
| `JWT_EXPIRES_IN` | `7d` | fixed |
| `OTP_TTL_SECONDS` | `300` | fixed |
| `BCRYPT_ROUNDS` | `12` | fixed |
| `GMAIL_USER` | the sender Gmail address | **app owner** |
| `GMAIL_APP_PASSWORD` | 16-char Google App Password | **app owner (share securely)** |
| `MAIL_FROM_NAME` | `Ara Sales` | fixed |
| `STORAGE_DRIVER` | `mysql` | fixed |
| `PUBLIC_BASE_URL` | the API's own public URL | DevOps |
| `PHOTO_RETENTION_DAYS` | `60` | fixed |
| `TRUST_PROXY` | `1` | fixed |
| `AUTO_MIGRATE` | `true` | fixed |

> **Email/OTP:** `GMAIL_USER` + `GMAIL_APP_PASSWORD` are what let the backend send
> password-reset OTPs. They are **not** in the repo by design — set them in Azure.
> Best practice: the production account has its own Google App Password
> (Google Account → Security → 2-Step Verification → App passwords).

## 4. First-run (one time)

1. Deploy → `AUTO_MIGRATE=true` creates the schema.
2. Seed the first admin (App Service SSH console): `cd /home/site/wwwroot && npm run seed`
   (creates `admin@ara.test` / `ChangeMe@123`).
3. **Log in and change that password immediately.** Reps/admins are managed via
   the admin API (`POST /api/admin/users`).

## 4b. CORS — allow the web admin origin

The web admin (Vercel) calls this API from the browser, so the API must allow its
origin. Set the App Service setting to the deployed web URL (comma-separated for
multiple), then restart:

```
CORS_ORIGINS = https://<your-app>.vercel.app
```

Without this, the browser blocks the web admin with a CORS error (the API itself
still works; it's a browser policy).

## 4c. Remove demo/seed accounts (one time)

The seed creates demo users (`admin@ara.test`, `ravi@ara.test`, `meena@ara.test`)
with the public default password. After real admins exist, delete them. From
`/home/site/wwwroot`:

```
node -e "const k=require('knex')(require('./knexfile').production||require('./knexfile').development);k('users').whereIn('email',['admin@ara.test','ravi@ara.test','meena@ara.test']).del().then(n=>{console.log('deleted',n);return k.destroy()})"
```

(Or use the admin API once a real admin is logged in: `DELETE /api/admin/users/:id`.)

## 5. Verify after deploy

- [ ] `GET /api/health` returns ok over HTTPS.
- [ ] Admin can log in (and default password changed).
- [ ] A visit photo uploads from mobile and shows in the web Visits page.
- [ ] Forgot-password email is received (confirms Gmail SMTP works from Azure).

## 6. What the app owner must hand over (securely — not email/chat plaintext)

- `GMAIL_USER` + `GMAIL_APP_PASSWORD` (or DevOps creates a new App Password).
- The web admin URL (for `CORS_ORIGINS`), once known.

Everything else (DB password, JWT secret) DevOps generates on their side.
