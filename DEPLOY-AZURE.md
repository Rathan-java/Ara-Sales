# Deploying Ara Sales to Azure

This guide deploys the three parts:

| Part | Azure service |
|------|----------------|
| Backend API (Node/Express) | **Azure App Service** (Linux, Node 20) |
| Database (MySQL) | **Azure Database for MySQL — Flexible Server** |
| Visit photos | **MySQL (built-in)** — or Azure Blob for large scale |
| Web admin (React build) | **Azure Static Web Apps** (or App Service) |
| Mobile (Flutter) | Built locally, pointed at the API URL (not hosted) |

The app was written to be cloud-ready: all configuration comes from environment
variables, the DB driver supports TLS, and migrations run automatically on boot.
No code changes are needed to deploy — only the settings below.

### Photo storage: you do NOT need a Storage account

Photos are downscaled to ~40–120 KB and can be stored **inside MySQL**
(`STORAGE_DRIVER=mysql`) — so you can deploy with **only App Service + Azure
MySQL**, no Storage account. The 60-day retention sweep keeps the table small.
If you later want to offload them, create a Storage account and switch to
`STORAGE_DRIVER=azure` — no code change. **Step 2 below is optional**; skip it to
go MySQL-only.

---

## 0. Prerequisites

- An Azure subscription and the **Azure CLI** (`az login`).
- The repo pushed to GitHub (for CI/CD) or zipped (for `az webapp deploy`).

Set a few shell variables to reuse below:

```bash
RG=ara-sales-rg
LOC=centralindia
APP=ara-sales-api          # must be globally unique
DBSERVER=ara-sales-db      # must be globally unique
STORAGE=arasalesphotos     # must be globally unique, 3-24 lowercase
az group create -n $RG -l $LOC
```

---

## 1. Database — Azure Database for MySQL (Flexible Server)

```bash
az mysql flexible-server create \
  -g $RG -n $DBSERVER -l $LOC \
  --admin-user araadmin --admin-password '<STRONG_PASSWORD>' \
  --sku-name Standard_B1ms --tier Burstable --version 8.0 \
  --public-access 0.0.0.0           # allow Azure services; tighten later

az mysql flexible-server db create -g $RG -s $DBSERVER -d ara_sales
```

Notes:
- TLS is required → you'll set `DB_SSL=true` on the API.
- The host is `"$DBSERVER".mysql.database.azure.com`, user `araadmin`.

---

## 2. Storage — OPTIONAL (Azure Blob)

**Skip this whole step for a MySQL-only deploy** (`STORAGE_DRIVER=mysql`). Photos
are compressed and stored in the `photo_blobs` table you already have.

Only if you want photos in Blob instead (lower DB load at large scale):

```bash
az storage account create -g $RG -n $STORAGE -l $LOC --sku Standard_LRS
CONN=$(az storage account show-connection-string -g $RG -n $STORAGE -o tsv)
az storage container create --name visit-photos --connection-string "$CONN" --public-access blob
```

Keep `$CONN` for `AZURE_STORAGE_CONNECTION_STRING`, and set `STORAGE_DRIVER=azure`
instead of `mysql` in step 3.

> Never use App Service local disk for photos — it's ephemeral and per-instance,
> so uploads would vanish on restart/scale. Use `mysql` (default here) or `azure`.

---

## 3. Backend API — App Service

Create the web app (Linux, Node 20):

```bash
az appservice plan create -g $RG -n ara-sales-plan --is-linux --sku B1
az webapp create -g $RG -p ara-sales-plan -n $APP --runtime "NODE:20-lts"
```

### App settings (environment variables)

Set everything from `backend/.env.production.example`. Minimum required:

```bash
az webapp config appsettings set -g $RG -n $APP --settings \
  NODE_ENV=production \
  CORS_ORIGINS="https://<your-web-admin-host>" \
  DB_HOST="$DBSERVER.mysql.database.azure.com" DB_PORT=3306 \
  DB_USER=araadmin DB_PASSWORD='<STRONG_PASSWORD>' DB_NAME=ara_sales DB_SSL=true \
  JWT_SECRET="$(openssl rand -hex 32)" JWT_EXPIRES_IN=7d \
  OTP_TTL_SECONDS=300 BCRYPT_ROUNDS=12 \
  GMAIL_USER='<gmail>' GMAIL_APP_PASSWORD='<gmail-app-password>' MAIL_FROM_NAME='Ara Sales' \
  STORAGE_DRIVER=mysql \
  PUBLIC_BASE_URL="https://$APP.azurewebsites.net" \
  PHOTO_RETENTION_DAYS=60 \
  TRUST_PROXY=1 AUTO_MIGRATE=true \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true
# (For Blob instead: STORAGE_DRIVER=azure AZURE_STORAGE_CONNECTION_STRING="$CONN" AZURE_STORAGE_CONTAINER=visit-photos)
```

- `AUTO_MIGRATE=true` runs `knex migrate:latest` on boot — no separate release
  step. (It never seeds; production data is never truncated.)
- `TRUST_PROXY=1` so rate-limiting and `req.ip` see the real client behind the
  App Service proxy.
- App Service injects `PORT`; the app reads it automatically.
- For real security, store `DB_PASSWORD`, `JWT_SECRET`, `GMAIL_APP_PASSWORD`,
  and the storage connection string in **Azure Key Vault** and reference them
  with `@Microsoft.KeyVault(...)` instead of plaintext settings.

### Deploy the code

The backend lives in `/backend`. Point the deployment at that folder. Easiest:

```bash
cd backend
npm ci --omit=dev          # production install
zip -r ../api.zip . -x "node_modules/*"   # let Oryx build, or include node_modules
az webapp deploy -g $RG -n $APP --src-path ../api.zip --type zip
```

Set the startup command (App Service runs `npm start` by default, which is
`node src/server.js`). If needed:

```bash
az webapp config set -g $RG -n $APP --startup-file "npm start"
```

> GitHub Actions alternative: use the "Deploy to Azure Web App" action with
> `package: backend` and app name `$APP`.

### First-run seed (ONE TIME, optional)

`AUTO_MIGRATE` creates the schema but does **not** seed. To create the first
admin user, either run the seed once from the App Service SSH console:

```bash
# In the App Service "SSH" console:
cd /home/site/wwwroot && npm run seed     # demo users incl. admin@ara.test / ChangeMe@123
```

…or, preferably for production, insert a single admin and set its password via
the API once a temp admin exists. **Change the default password immediately.**

### Verify

```bash
curl https://$APP.azurewebsites.net/api/health      # {"ok":true,...}
```

---

## 4. Web admin — Azure Static Web Apps

The React app is a static build (`web/dist`). Build it pointed at the API:

```bash
cd web
echo "VITE_API_BASE_URL=https://$APP.azurewebsites.net" > .env.production
npm ci && npm run build       # outputs web/dist
```

Deploy `web/dist` to Static Web Apps (CLI or the GitHub integration):

```bash
az staticwebapp create -g $RG -n ara-sales-web -l $LOC \
  --source . --app-location "web" --output-location "dist" --login-with-github
```

`web/staticwebapp.config.json` is already included for SPA routing (so deep links
like `/visits` fall back to `index.html`).

After it's live, update the API's `CORS_ORIGINS` to the Static Web App URL:

```bash
az webapp config appsettings set -g $RG -n $APP --settings \
  CORS_ORIGINS="https://<your-static-web-app>.azurestaticapps.net"
```

---

## 5. Mobile (Flutter) — point at the API

Build the rep app against the deployed API (mobile isn't hosted on Azure):

```bash
cd mobile
flutter build apk --release \
  --dart-define=API_BASE_URL=https://ara-sales-api.azurewebsites.net \
  --dart-define=PING_INTERVAL_SECONDS=300
# iOS: flutter build ipa --release --dart-define=...
```

Distribute the APK/IPA (Play Console / App Store / internal distribution).

---

## 6. Post-deploy checklist

- [ ] `GET /api/health` returns ok over HTTPS.
- [ ] Admin can log in on the web app; **default password changed**.
- [ ] A visit photo uploads from mobile and appears in the web Visits page
      (served from the Blob URL, not `/uploads`).
- [ ] Forgot-password email arrives (Gmail SMTP reachable from Azure).
- [ ] `CORS_ORIGINS` matches the web admin host exactly (scheme + host).
- [ ] Secrets are in Key Vault, not plaintext app settings (recommended).
- [ ] MySQL firewall tightened from `0.0.0.0` to App Service outbound IPs / VNet.
- [ ] Photo retention set (`PHOTO_RETENTION_DAYS=60`). The in-process sweeper runs
      automatically; for a single-instance App Service that's enough. If you scale
      out, run `npm run purge:photos` from one Azure scheduled job (WebJob / Logic
      App / Container Job) and set `RETENTION_SWEEP_HOURS=0` to avoid duplicate sweeps.

---

## What changes vs. local dev

| Concern | Local (dev) | Azure (prod) |
|---------|-------------|--------------|
| `NODE_ENV` | development | production (disables DEV_OTP) |
| Photos | local disk `/uploads` | Azure Blob (`STORAGE_DRIVER=azure`) |
| DB TLS | off | `DB_SSL=true` |
| Migrations | `npm run migrate` | `AUTO_MIGRATE=true` on boot |
| Proxy | none | `TRUST_PROXY=1` |
| Secrets | `.env` (gitignored) | App Settings / Key Vault |

No source changes are needed to switch between them — only environment values.
