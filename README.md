# Barangay Bang-Bang Smart Garbage Monitoring System

Web system for Barangay Bang-Bang, Cordova, Cebu that manages garbage collection schedules, collector field work,
resident disposal participation, the weekly ₱5.00 contribution, and purok endorsements.

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS 4 (light and dark theme, mobile friendly)
- **Backend:** Node.js + Express + TypeScript REST API (`backend/`), the frontend is in `frontend/`
- **Database:** MySQL 8 (local MySQL for development, Aiven MySQL for production)

---

## 1. Roles and what each can do

| Role | Main features |
|---|---|
| **Admin** (Barangay Captain/Secretary) | Dashboard with live statistics, create/edit/cancel collection schedules, collection monitoring, **live map & GPS tracking of trucks**, households (with printable **QR cards**), resident and staff accounts (create, edit, deactivate, reset password, approve registrations), read-only contribution ledger and endorsement records, reports (PDF + CSV), announcements, activity logs, barangay settings (weekly fee, GCash/Maya numbers and **official payment QR images**, hotline) |
| **Garbage Collector** | Today's route (start → record kg → complete), **QR scanner** (scan household cards → garbage collected / cash received; Admin + Leader are notified), **live GPS sharing** while a route is in progress, route map, upcoming routes, collection history with totals, own schedules, announcements |
| **Purok Leader** | Purok dashboard, approve/reject new resident registrations (email already verified by OTP), purok households + QR cards, **purok map**, **QR cash scanner**, verify/reject disposal logs, verify/reject weekly payments, **final approval** of endorsement requests (certificate code `BB-END-YYYY-NNNNN`), purok schedules |
| **Resident** | Dashboard (next collection, unpaid weeks), collection schedules, log disposal participation (with optional photo), pay the weekly contribution by **scanning the barangay GCash/Maya QR** (13-digit reference + screenshot, unique `BB-PAY-XXXX-XXXX` code and QR receipt) or **cash to collector/leader by showing the household QR**, **My Household QR** card, **Truck Tracker** (live truck distance), request endorsements and print approved certificates, profile |

Every role also has **Notifications** (bell + full page) and **My Profile** (update contact details, change password).
Visitors can view upcoming schedules and announcements, register a household, and verify an endorsement certificate code on the public landing page.

### New in this version
- **Email OTP registration** — after the form, a 6-digit code is emailed (10-minute expiry, 5 tries, resend after 60 s, max 5 resends). The household and account are only created after the code is correct; the Purok Leader still approves.
- **QR payments** — GCash/Maya QR (uploaded by the Admin in Settings), GCash reference must be 13 digits, a reference number can never be reused, a screenshot is required, and every payment gets a unique `BB-PAY-XXXX-XXXX` code.
- **Household QR cards** — random, unguessable token; can be re-issued (old card stops working). Collectors scan with the phone camera (or a photo, or by typing the household number).
- **Collector scanner** — “Mark garbage collected” (once per household per run, only during an In Progress route of that purok) and “Cash received” (stays Pending until the Leader verifies). Leader cash scans are verified right away. Admin, Leader and the household are notified.
- **Map** — OpenStreetMap/Leaflet. Households coloured by today's pick-up and this week's payment, trucks with GPS trails (collector phone shares location every ~20 s while a route is In Progress), scan points, pin-a-house mode, and a resident Truck Tracker.

> The camera and GPS only work on **https://** or **http://localhost**. On a phone over plain http (e.g. `http://192.168.x.x:5173`) use “Scan from photo” / typing the household number, or deploy with https (Vercel/Render).

### Business rules enforced by the server
- Exactly four roles. Permissions are checked on the server for every request — hiding a button is never the only protection.
- A Purok Leader only sees and acts on records from **their own purok**. Residents only see their own household's records. Collectors only see schedules assigned to them.
- The **Purok Leader is the final approver** of endorsements. There is no admin approval stage; a decision cannot be changed afterwards.
- Weekly contributions use the fee from Settings (default **₱5.00**), are **never auto-verified**, and only one live payment per household per week is allowed.
- One disposal log per household per collection (a rejected log can be corrected and re-submitted). Logs are accepted on the collection day and up to 3 days after.
- Collections follow *Scheduled → In Progress → Completed*; only the assigned collector can move them. Schedules are cancelled, never deleted, so history stays intact.
- New self-registered residents stay **pending** until their Purok Leader (or the Admin) approves them.
- Every important action is written to the activity log and creates notifications for the people involved.

### Security
- Passwords hashed with bcrypt (cost 12); at least 8 characters with letters and numbers.
- Sign-in uses a random 256-bit session token; only its SHA-256 hash is stored, sessions expire, and they are revoked on logout, password change, password reset and deactivation.
- No master/demo password, and no codes are ever sent back to the browser. Password reset codes are emailed (SMTP) — without SMTP they are printed in the server console in development, and the Admin can reset passwords.
- All SQL uses parameter placeholders; multi-step changes run in transactions with row locks; duplicate rules are also enforced by unique keys in MySQL.
- Input validation with zod, login/registration/reset rate limits, upload checks (real PNG/JPEG/WEBP bytes, max 2 MB), CSV formula-injection protection, `no-store` on API responses, basic security headers.
- No secrets in the code — everything comes from `.env`.

---

## 2. Run it on your computer (Windows, macOS or Linux)

The project has **two folders** that run at the same time:

| Folder | What it is | Address |
|---|---|---|
| `backend/` | Express API + MySQL | http://localhost:4000/api |
| `frontend/` | React website (Vite) | **http://localhost:5173** ← open this one |

### Requirements
- **Node.js 20 or newer** — https://nodejs.org
- **MySQL 8** running on your computer, and a MySQL user + password that works in MySQL Workbench (usually `root`)

### Steps
1. **Backend: install and configure**
   ```bash
   cd backend
   npm install
   ```
   Copy `backend/.env.example` to `backend/.env` and set your MySQL login:
   ```ini
   MYSQL_USER=root
   MYSQL_PASSWORD=your-mysql-password
   MYSQL_DATABASE=bangbang_sgms
   SEED_PASSWORD=Barangay2026
   ```
   The database `bangbang_sgms` is **created automatically** — you do not need to create it in Workbench.
2. **Create the tables and demo data** (still inside `backend/`)
   ```bash
   npm run db:reset
   ```
3. **Start the backend** (leave this terminal open)
   ```bash
   npm run dev
   ```
4. **Frontend: open a second terminal**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
5. Open **http://localhost:5173** in your browser.

### Email OTP (Gmail) setup
Without SMTP the OTP code is printed in the **backend terminal** (look for `DEV MAIL`). To send real emails with Gmail:
1. Go to https://myaccount.google.com → **Security** → turn on **2-Step Verification**.
2. Open https://myaccount.google.com/apppasswords → create an app password (name: `SGMS`) → copy the 16 letters.
3. In `backend/.env`:
   ```ini
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=yourname@gmail.com
   SMTP_PASSWORD=abcdefghijklmnop
   SMTP_FROM=Barangay Bang-Bang SGMS <yourname@gmail.com>
   ```
4. Restart the backend. It prints `[mail] SMTP login OK` when the settings are correct.

### Bisaya nga mubo nga giya
1. Terminal 1: `cd backend` → `npm install` → kopyaha ang `.env.example` ngadto sa `.env` ug ibutang ang imong MySQL user ug password (parehas sa imong gigamit sa MySQL Workbench) → `npm run db:reset` → `npm run dev`
2. Terminal 2: `cd frontend` → `npm install` → `npm run dev`
3. Ablihi ang **http://localhost:5173**

### Demo accounts (password = your `SEED_PASSWORD`)

| Role | Username |
|---|---|
| Admin | `captain.degamo` |
| Collector | `collector.danilo`, `collector.bernardo`, `collector.eduardo` |
| Purok Leader | `leader.rolando` (Purok Mangga), `leader.marilou` (Nangka), `leader.crispin` (Saging), `leader.gemma` (Sambag) |
| Resident | `resident.maria`, `resident.pedro` (Mangga), `resident.juan` (Nangka), `resident.elena` (Saging) |
| Pending registration | `resident.josefa` — approve it as `leader.rolando` |

### Useful commands

| Folder | Command | What it does |
|---|---|---|
| backend | `npm run dev` | Start the API (port 4000, restarts on file changes) |
| backend | `npm run db:migrate` | Apply new migrations only (keeps data) |
| backend | `npm run db:seed:demo` | Load demo data into an **empty** database |
| backend | `npm run db:reset` | Development only: wipe, migrate and load demo data |
| backend | `npm run db:seed` | Real installation: settings + 7 puroks + first admin from `ADMIN_*` in `.env` |
| backend | `npm test` | API and permission tests (uses `MYSQL_DATABASE_TEST`, which is wiped) |
| backend / frontend | `npm run lint` | TypeScript type check |
| frontend | `npm run dev` | Start the website (port 5173) |
| frontend | `npm run build` | Production build into `frontend/dist` |

---

## 3. Deploy (Render + Vercel + Aiven MySQL)

1. **Aiven:** create a free MySQL service. Note host, port, user, password and database (`defaultdb`), and download the **CA certificate**.
2. **Backend on Render:** New → Web Service from your GitHub repo (or use `render.yaml` as a Blueprint).
   - Root directory: `backend` · Build command: `npm ci` · Start command: `npm start`
   - Environment: `NODE_ENV=production`, `TRUST_PROXY=1`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_SSL=true`, `MYSQL_SSL_CA` (paste the whole CA certificate text), `CORS_ORIGIN=https://your-site.vercel.app`, `APP_URL=https://your-site.vercel.app`.
   - Migrations run automatically on start.
3. **Frontend on Vercel:** import the repo, set **Root Directory** to `frontend` (framework: Vite).
   Edit `frontend/vercel.json` and replace `YOUR-BACKEND.onrender.com` with your Render address, so `/api/*` is forwarded to the backend.
   (Alternative: set `VITE_API_URL=https://your-backend.onrender.com/api` in Vercel and keep `CORS_ORIGIN` on Render pointing to your Vercel URL.)
4. Create the first admin once, from your computer with the Aiven values in `backend/.env`:
   ```bash
   # backend/.env: ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD (+ the Aiven MYSQL_* values)
   npm run db:seed
   ```
   Do **not** run `db:reset` or `db:seed:demo` against production data.
5. Optional: set the `SMTP_*` values so residents receive password-reset codes by email.

---

## 4. Project structure

```
backend/
  database/migrations/      Versioned SQL migrations (001_initial_schema.sql)
  src/
    index.ts                Starts the API server
    app.ts                  Express app, CORS, /api router
    config/env.ts           Reads backend/.env
    db/                     pool.ts (MySQL + transactions), migrate.ts, seed.ts
    middleware/             auth (sessions, roles), rate limit, errors, security headers
    modules/<feature>/      One router per feature: auth, users, households, puroks, schedules,
                            collections, disposal, payments, endorsements, announcements,
                            notifications, activity, settings, reports, profile, public
    utils/                  validation, audit log, notifications, CSV, dates, mailer, ids
  tests/                    Vitest + Supertest API and permission tests
frontend/
  index.html, vite.config.ts (proxies /api to the backend in development), vercel.json
  src/
    App.tsx                 Shell: landing page or role workspace
    config/navigation.ts    The menu for each role (single source of truth)
    components/             admin / collector / leader / resident / common / auth / public pages
    context/                Auth, Theme, Toast
    services/api.ts         API client
render.yaml                 Render blueprint for the backend
```

### API overview (all under `/api`)
`auth` (login, logout, register → register/verify → register/resend, forgot/reset password, me) · `profile` · `users` (+ approve/reject) · `puroks` · `households` ·
`schedules` · `collections` (start, update-progress, complete) · `disposal` (submit, submissions, verify) ·
`payments` (channels, submit, list, verify) · `scan` (lookup, disposal, payment, recent) · `map` (overview, ping) · `endorsements` (request, list, review) · `announcements` · `notifications` ·
`activity-logs` · `settings` · `reports` (dashboard-stats, export-csv) · `public` (schedules, announcements, verify-certificate) · `health`

---

## 5. Troubleshooting

| Problem | Fix |
|---|---|
| `Access denied for user …` | `MYSQL_USER` / `MYSQL_PASSWORD` in `backend/.env` are wrong. Use exactly what logs you in to MySQL Workbench. If you forgot the root password, reset it (see MySQL docs "How to Reset the Root Password"). |
| `MySQL is not running` | Windows: press Win+R → `services.msc` → find **MySQL84** (or MySQL80) → Start. |
| `Set SEED_PASSWORD in .env` | Add `SEED_PASSWORD=YourPass2026` (letters + numbers, 8+ characters) to `backend/.env`. |
| Website shows "Cannot reach the server" | The backend terminal is not running — start it with `npm run dev` inside `backend/`. |
| Port 4000 or 5173 already in use | Change `PORT` in `backend/.env`; for the frontend set `BACKEND_URL` in `frontend/.env` to match. |
| Forgot a password | Admin → Residents or Collectors & Leaders → key icon → Reset Password. |
| "Too many attempts" on login | Wait 15 minutes (login rate limit). |
| OTP email not received | Without SMTP the code is in the backend terminal (`DEV MAIL`). With Gmail, check the Spam folder and that `SMTP_PASSWORD` is the 16-letter **App Password**. The backend prints `[mail] SMTP login FAILED` if the login is wrong. |
| Camera does not open on the phone | Browsers allow the camera only on https:// or localhost. Use “Scan from photo”, type the household number, or use the deployed https site. |
| Map is grey / no streets | The map tiles come from OpenStreetMap, so the computer needs internet. |
