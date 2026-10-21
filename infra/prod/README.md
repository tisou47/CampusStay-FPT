# CampusStay FPT — production runbook

Deployment target (ADR-16): the **web app on Vercel**, the **API and PostgreSQL on one Oracle Cloud Always Free VM** behind Caddy (HTTPS). The Android app calls the same API.

```
Browser ──► https://campusstay-fpt.vercel.app        (Vercel: static build of web/)
Browser, Android, SePay ──► https://<API_DOMAIN>/api ──► Caddy :443 ──► api :8080 ──► db :5432   (Oracle VM, Docker Compose)
```

| What | Where | Deployed by |
|---|---|---|
| Web | Vercel project, Root Directory `web/` (`web/vercel.json`) | Vercel Git integration: every push to `main` (production) and every pull request (preview) |
| API + Postgres + Caddy | `/opt/campusstay` on the VM (`infra/prod/`) | `.github/workflows/backend.yml`: push to `main` touching `backend/` or `infra/prod/` |
| Image | `ghcr.io/<owner>/campusstay-backend:<commit sha>` and `:latest` (linux/arm64) | same workflow |

## 1. One-time setup: the VM

### 1.1 Oracle Cloud account
1. Sign up at cloud.oracle.com. The **home region** cannot be changed later and Always Free Ampere VMs exist only there: pick the region closest to the users (Singapore) or, if it keeps saying "out of capacity", another Asian region.
2. The card is only verified, not charged. Optional but recommended: upgrade the account to **Pay As You Go**. Always Free resources stay free, capacity errors become rarer, and idle Always Free VMs are no longer reclaimed (a demo API is idle most of the time). Then add a budget alert of 1 USD under Billing → Budgets.

### 1.2 Create the VM
Compute → Instances → Create instance:
- Image: **Canonical Ubuntu 24.04** (aarch64). Shape: **VM.Standard.A1.Flex**, 2 OCPU, 12 GB memory (half of the free quota).
- Networking: a public subnet with a public IPv4 address. Boot volume: 50 GB.
- SSH keys: paste your own public key (this is your login, separate from the deploy key in 1.6).

After it starts: Networking → IP management → **Reserved public IPs**, and turn the VM's ephemeral IP into a reserved one, so the address survives a stop/start.

### 1.3 Open ports 80 and 443
1. Networking → Virtual cloud networks → the VM's subnet → Security list → Add ingress rules: source `0.0.0.0/0`, TCP 80; TCP 443; UDP 443 (HTTP/3, optional). Do **not** open 5432 or 8080.
2. On the VM (Oracle's Ubuntu images reject everything except SSH in iptables):
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

### 1.4 Docker and the stack folder
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu          # then log out and in again
sudo mkdir -p /opt/campusstay && sudo chown ubuntu:ubuntu /opt/campusstay
```
Ubuntu installs security updates by itself (unattended-upgrades). Reboot now and then: `sudo reboot`; the containers come back on their own (`restart: unless-stopped`).

### 1.5 DNS name for the API
Either a free subdomain from duckdns.org (sign in, create e.g. `campusstay-api`, set its IP to the reserved IP) or an `A` record on a domain you own (`api.<domain>` → reserved IP). Check: `nslookup <API_DOMAIN>` answers the VM's IP. Caddy needs this before it can get the certificate.

### 1.6 Settings file
Copy [`.env.example`](.env.example) to `/opt/campusstay/.env` on the VM, fill it in, then `chmod 600 /opt/campusstay/.env`. The workflow never overwrites `.env`. Also `mkdir -p /opt/campusstay/secrets` (the Firebase key goes there, §3.3).
- `DB_PASSWORD` and `FILES_LINK_SECRET`: one `openssl rand -hex 32` each.
- `WEB_BASE_URL` and `CORS_ALLOWED_ORIGINS`: the Vercel production URL from step 2 (fix them after the Vercel project exists).
- Gmail, VietQR/SePay, Firebase, Google: §3. Each one can be added later; the API starts without them.
- Demo data: decide **before the first start** (1.9).

### 1.7 GitHub Actions access
On your own computer, create a key used only for deploys and allow it on the VM:
```bash
ssh-keygen -t ed25519 -N "" -C campusstay-deploy -f campusstay-deploy
cat campusstay-deploy.pub | ssh ubuntu@<API_DOMAIN> "cat >> ~/.ssh/authorized_keys"
```
GitHub → repository → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `VM_SSH_KEY` | content of the private key file `campusstay-deploy` |
| Variable | `VM_HOST` | `<API_DOMAIN>` or the reserved IP |
| Variable | `VM_USER` | `ubuntu` |
| Variable | `API_DOMAIN` | e.g. `campusstay-api.duckdns.org` (used for the health check) |

Then delete the private key file from your computer, or keep it in a password manager.

### 1.8 First deploy
GitHub → Actions → **backend** → Run workflow (branch `main`). The run verifies, builds the arm64 image, copies `infra/prod/` to the VM, starts the stack and waits for `https://<API_DOMAIN>/api/actuator/health/readiness`. The first start takes a minute or two (Flyway migrations, certificate).

Check from anywhere: `curl https://<API_DOMAIN>/api/actuator/health` → `{"status":"UP"}`.

### 1.9 Demo data (optional)
The demo seed (`db/seed`) fills an **empty** database with a fictional campus: 8 Blocks, 6,200 students and four years of Terms, Invoices, requests and reports. Without it the database has only the reference data and no account to sign in with.
1. Before the first start, uncomment `SPRING_FLYWAY_LOCATIONS` (and `SEED_MAILBOX` if the seed accounts' emails should reach your Gmail). Deploy (1.8) and wait for `UP`; loading takes a few minutes.
2. Then comment `SPRING_FLYWAY_LOCATIONS` out again, uncomment `SPRING_FLYWAY_IGNOREMIGRATIONPATTERNS=repeatable:missing` and run `docker compose up -d`. The seed is never run again, even when its file changes in a later commit (it only works on an empty database).
3. Every seed account has the password written in the repository, which is public. Replace it with your own demo password:
   ```bash
   docker run --rm httpd:2.4-alpine htpasswd -nbBC 10 "" '<new demo password>' | tr -d ':\n'; echo
   cd /opt/campusstay && docker compose exec db psql -U campusstay -d campusstay
   ```
   In psql (paste the hash between the quotes): `UPDATE auth_user SET password_hash = '<hash>';` then `\q`.

### 1.10 Backups
`crontab -e` on the VM and add the line from the top of [`backup.sh`](backup.sh). It writes a database dump and an archive of the uploaded files (receipts, photos) and keeps the newest 14 of each on the VM. Copy them to your computer now and then:
`scp "ubuntu@<API_DOMAIN>:/opt/campusstay/backups/*-<stamp>*" .`

## 2. One-time setup: Vercel (web)
1. vercel.com → Add New → Project → import `tisou47/CampusStay-FPT`. **Root Directory: `web`**; framework, build command and output come from `web/vercel.json`. Project name `campusstay-fpt` gives `https://campusstay-fpt.vercel.app` if the name is free.
2. Environment Variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://<API_DOMAIN>/api` |
   | `VITE_GOOGLE_CLIENT_ID` | the Web OAuth client id (optional) |

   `VITE_*` values are baked in at build time: after changing one, redeploy.
3. Deploy, then put the final production URL into `WEB_BASE_URL` and `CORS_ALLOWED_ORIGINS` in the VM's `.env` and run `docker compose up -d` in `/opt/campusstay`.
4. `web/vercel.json` skips a build when nothing under `web/` changed since the last deployment, rewrites every path to `index.html` (client-side routes) and caches `/assets/*` for a year.

## 3. Third-party services
Each service is optional: without it the API starts and the feature falls back as listed. After editing `.env`, run `docker compose up -d` in `/opt/campusstay`.

| Service | Without it | Settings |
|---|---|---|
| Gmail SMTP | Emails are written to the API log only | `SPRING_MAIL_*`, `MAIL_FROM` |
| SePay + VietQR | QR still shown; Staff confirm payments by hand | `PAYMENT_*`, `SEPAY_WEBHOOK_API_KEY` |
| Firebase (FCM) | In-app notifications only, no Android push | `FIREBASE_CREDENTIALS_FILE` |
| Google sign-in | Email and password only | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, Vercel `VITE_GOOGLE_CLIENT_ID` |

### 3.1 Gmail (ADR-09)
1. Use a Gmail account made for the project, not a personal one. Turn on 2-Step Verification, then Google Account → Security → **App passwords** → create one named CampusStay.
2. In `.env`: uncomment the `SPRING_MAIL_*` lines, `SPRING_MAIL_USERNAME` = the address, `SPRING_MAIL_PASSWORD` = the 16 characters without spaces, `MAIL_FROM` with the same address (Gmail replaces any other sender).
3. Test: "Forgot password" on the web for an account whose email you can read.
4. Limit: a personal Gmail account sends about 500 emails a day. Admin emails to a large student group (the demo seed has 6,200 students) would exceed it and get the account blocked for a day: send campaigns to small groups only.

### 3.2 VietQR and SePay (ADR-08)
The payment page shows a VietQR image from SePay's free image service (`qr.sepay.vn`) for the account in `PAYMENT_*`, with the Invoice's transfer content (`CSTAY` + number). The SePay webhook reports each incoming transfer; an exact amount marks the Invoice Paid, any other amount waits for Staff.
1. Register at sepay.vn and link the receiving bank account (OI-13). Put the same account in `PAYMENT_BANK_NAME`, `PAYMENT_BANK_CODE` (SePay's short name, e.g. `MBBank`), `PAYMENT_ACCOUNT_NUMBER`, `PAYMENT_ACCOUNT_NAME`.
2. SePay → company settings → payment code structure: prefix **`CSTAY`** followed by digits (it must equal `campusstay.payment.transfer-prefix`).
3. SePay → Webhooks → add: URL `https://<API_DOMAIN>/api/webhooks/sepay`, event incoming money, authentication **API Key** with a value from `openssl rand -hex 24`. Put the same value in `SEPAY_WEBHOOK_API_KEY`.
4. Test with a real transfer. Invoice amounts come from the Admin configuration: for a live demo, give the demo Term a small Deposit so the transfer costs little. A refused webhook (wrong key) is written to the Audit Log.

### 3.3 Firebase Cloud Messaging (Android push)
1. console.firebase.google.com → create a project (free Spark plan) → Project settings → Service accounts → **Generate new private key**.
2. Copy the JSON to the VM: `scp key.json ubuntu@<API_DOMAIN>:/opt/campusstay/secrets/firebase.json`, then on the VM `chmod 644 /opt/campusstay/secrets/firebase.json` (the API runs as an unprivileged user inside the container). Never commit it.
3. In `.env`: `FIREBASE_CREDENTIALS_FILE=/app/secrets/firebase.json`. The log line "push notifications are skipped" disappears.
4. The Android app registers its FCM token with the API; add the Android app to the same Firebase project (package name) and put its `google-services.json` in the Flutter project.

### 3.4 Google sign-in (ADR-14)
1. Google Cloud Console (the Firebase project can be reused) → OAuth consent screen: user type External, scopes `openid`, `email`, `profile` only, then **Publish app**. In "Testing" status only the test users you list can sign in.
2. Credentials → OAuth client ID, type Web application → Authorized JavaScript origins: the Vercel production URL. Google accepts no wildcards, so preview deployments sign in with email and password only.
3. Client id and secret into the VM's `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), client id into Vercel (`VITE_GOOGLE_CLIENT_ID`), then redeploy the web.
4. Only `@fpt.edu.vn` accounts that already exist in CampusStay can sign in: give a test account your FPT email (backend/README.md). Android needs its own OAuth client of type Android (package name + SHA-1 of the release key).

## 4. Operations (on the VM, in `/opt/campusstay`)

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| API logs | `docker compose logs -f --tail 200 api` |
| Restart the API after editing `.env` | `docker compose up -d` |
| Roll back to an older build | `API_TAG=<commit sha> docker compose up -d api` (the next push to `main` deploys the newest build again) |
| psql | `docker compose exec db psql -U campusstay -d campusstay` |
| Restore a dump | `docker compose stop api` → `docker compose exec -T db pg_restore -U campusstay -d campusstay --clean --if-exists < backups/<file>.dump` → `docker compose start api` |
| Restore the files | `docker compose run --rm --no-deps -T --entrypoint tar api -C /app/data -xzf - < backups/files-<stamp>.tgz` |
| Disk usage | `df -h /` and `docker system df` |

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser: "Cannot reach the CampusStay server" | `VITE_API_BASE_URL` wrong or not redeployed; API down | Open `https://<API_DOMAIN>/api/actuator/health`; check the Vercel variable and redeploy |
| `403` on every call from the web | The page's origin is missing from `CORS_ALLOWED_ORIGINS` | Add it (exact URL or a `*` pattern), `docker compose up -d` |
| Caddy log: certificate errors | DNS not pointing at the VM yet, or port 80 closed (1.3) | Fix DNS or the rules, then `docker compose restart caddy` |
| API keeps restarting, log says "Detected applied migration not resolved locally" | The seed was loaded and `SPRING_FLYWAY_LOCATIONS` removed without the ignore pattern | Set `SPRING_FLYWAY_IGNOREMIGRATIONPATTERNS=repeatable:missing` (1.9) |
| API keeps restarting right after a deploy, log shows SQL errors from `R__dev_seed` | `SPRING_FLYWAY_LOCATIONS` still includes the seed and the seed file changed | Do step 2 of 1.9 |
| Emails never arrive | `SPRING_MAIL_*` not set (log says "written to the log"), wrong App Password, or the daily Gmail limit | §3.1; `docker compose logs api \| grep -i mail` |
| Payments stay Unpaid after a transfer | Webhook URL or key wrong in SePay, or the transfer content was changed by the payer | SePay → webhook history shows our answer; Staff confirm by hand meanwhile |
| API stops at start: "Cannot read the Firebase credentials file" | Wrong path or the file is not readable | §3.3 step 2 |
| Deploy job: `Permission denied (publickey)` | `VM_SSH_KEY` is not the pair of the key in `~/.ssh/authorized_keys` | Redo 1.7 |
| Out of capacity when creating the VM | No free Ampere hosts in the region right now | Retry later or another availability domain; Pay As You Go helps (1.1) |
