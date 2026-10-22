# CampusStay FPT — production runbook

Deployment target (ADR-16): the **web app on Vercel**, the **API and PostgreSQL on one Oracle Cloud Always Free VM** behind Caddy (HTTPS). The Android app calls the same API.

```
Browser ──► https://campusstay-fpt-ten.vercel.app    (Vercel: static build of web/)
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
2. The card is only verified, not charged. Oracle may reclaim an Always Free VM that stays idle for 7 days (95th-percentile CPU, network and, on A1, memory all under 20%), and a demo API is idle most of the time. Upgrading the account to **Pay As You Go** keeps Always Free resources free and makes capacity errors rarer; users report that it also stops idle reclaiming, although Oracle's page does not say so. After upgrading, anything beyond the Always Free limits is billed: add a budget alert of 1 USD under Billing → Budgets.

### 1.2 Create the VM
Compute → Instances → Create instance:
- Image: **Canonical Ubuntu 24.04** (aarch64). Shape: **VM.Standard.A1.Flex**, 2 OCPU, 12 GB memory: the whole Always Free A1 quota since Oracle's 2026 cut (2 OCPU / 12 GB per tenancy), so create no second A1 VM.
- Networking: a public subnet with a public IPv4 address. Boot volume: 50 GB.
- SSH keys: paste your own public key (this is your login, separate from the deploy key in 1.6).

Optional, after it starts: replace the VM's ephemeral public IP with a **reserved** one (instance → Attached VNICs → the VNIC → IPv4 addresses → Edit: first "No public IP", then "Reserved public IP" → create). The ephemeral address lives as long as the instance; a reserved one outlives it, so the DNS record stays valid if the VM is ever recreated. Do it before 1.5, because the address changes.

### 1.3 Open ports 80 and 443
1. Networking → Virtual cloud networks → the VM's subnet → Security list → Add ingress rules: source `0.0.0.0/0`, TCP 80; TCP 443; UDP 443 (HTTP/3, optional). Do **not** open 5432 or 8080.
2. On the VM, **before installing Docker** (Oracle's Ubuntu images reject everything except SSH in iptables, and a save after Docker would also store Docker's own rules). `sudo iptables -L INPUT -n --line-numbers` shows the final `REJECT`; insert the rules at its line number (6 on current images):
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
On the VM, create a key used only for deploys (no passphrase, so the workflow can use it) and allow it:
```bash
ssh-keygen -t ed25519 -N "" -C campusstay-deploy -f ~/.ssh/campusstay-deploy
cat ~/.ssh/campusstay-deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/campusstay-deploy        # copy the whole output, BEGIN and END lines included
```
GitHub → repository → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `VM_SSH_KEY` | the private key printed above |
| Variable | `VM_HOST` | `<API_DOMAIN>` or the reserved IP |
| Variable | `VM_USER` | `ubuntu` |
| Variable | `API_DOMAIN` | e.g. `campusstay-api.duckdns.org` (used for the health check) |

Then delete the private key from the VM: `rm ~/.ssh/campusstay-deploy` (the `.pub` line stays in `authorized_keys`).

### 1.8 First deploy
GitHub → Actions → **backend** → Run workflow (branch `main`). The run verifies, builds the arm64 image, copies `infra/prod/` to the VM, starts the stack and waits for `https://<API_DOMAIN>/api/actuator/health/readiness`. The first start takes a minute or two (Flyway migrations, certificate).

Check from anywhere: `curl https://<API_DOMAIN>/api/actuator/health` → `{"status":"UP"}`.

### 1.9 Base data (optional)
The base data (`db/seed`) adds 8 Blocks with their Rooms and Beds, the Room Types and Classes, the back-office accounts (`admin@fpt.edu.vn`, `manager.a` … `manager.h`, `staff.a1` … `staff.h2`) and 6,200 fictional students (`se190001@fpt.edu.vn` …). It has no Terms or history: the Admin confirms the fees and publishes the first Term. Without it the database has only the reference data and no account to sign in with.
1. Uncomment `SPRING_FLYWAY_LOCATIONS`, deploy (1.8) and wait for `UP`. Keep the line: the seed is idempotent, so a newer version only adds what is missing. (If you remove it later, uncomment `SPRING_FLYWAY_IGNOREMIGRATIONPATTERNS=repeatable:missing`.)
2. The seed addresses are fictional `@fpt.edu.vn` mailboxes: real email sent to them goes to FPT's mail server. Before testing password reset or Admin emails, give the accounts you use your own address, e.g. in psql `UPDATE auth_user SET email = '<you>@fpt.edu.vn' WHERE email = 'admin@fpt.edu.vn';`.
3. Every seed account has the password written in the repository, which is public. Replace it with your own demo password:
   ```bash
   docker run --rm httpd:2.4-alpine htpasswd -nbBC 10 "" '<new demo password>' | tr -d ':\n'; echo
   cd /opt/campusstay && docker compose exec db psql -U campusstay -d campusstay
   ```
   In psql (paste the hash between the quotes): `UPDATE auth_user SET password_hash = '<hash>';` then `\q`.

### 1.10 Backups
`mkdir -p /opt/campusstay/backups` (the cron line logs there), then `crontab -e` on the VM and add the line from the top of [`backup.sh`](backup.sh). It writes a database dump and an archive of the uploaded files (receipts, photos) and keeps the newest 14 of each on the VM. Copy them to your computer now and then:
`scp "ubuntu@<API_DOMAIN>:/opt/campusstay/backups/*-<stamp>*" .`

## 2. One-time setup: Vercel (web)
1. Done on 22/10/2026: project `campusstay-fpt` in the Vercel scope `tisou`, linked to `tisou47/CampusStay-FPT`, **Root Directory `web`**; framework, build command and output come from `web/vercel.json`. Production URL: `https://campusstay-fpt-ten.vercel.app` (`campusstay-fpt.vercel.app` was taken; another free `*.vercel.app` name or your own domain can be set under Settings → Domains, then update `WEB_BASE_URL`, `CORS_ALLOWED_ORIGINS` and the Google origin). Previews are `campusstay-<hash>-tisou.vercel.app` and need a Vercel sign-in (deployment protection).
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
4. Limit: a personal Gmail account sends about 500 emails a day. Admin emails to a large student group (the base data has 6,200 students, with fictional addresses, see 1.9) would exceed it and get the account blocked for a day: send campaigns to small groups only.

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
| API keeps restarting right after a deploy, log shows SQL errors from `R__dev_seed` | The base data does not fit rows changed by hand | Fix those rows, or remove `db/seed` from `SPRING_FLYWAY_LOCATIONS` and set the ignore pattern (1.9) |
| Emails never arrive | `SPRING_MAIL_*` not set (log says "written to the log"), wrong App Password, or the daily Gmail limit | §3.1; `docker compose logs api \| grep -i mail` |
| Payments stay Unpaid after a transfer | Webhook URL or key wrong in SePay, or the transfer content was changed by the payer | SePay → webhook history shows our answer; Staff confirm by hand meanwhile |
| API stops at start: "Cannot read the Firebase credentials file" | Wrong path or the file is not readable | §3.3 step 2 |
| Deploy job: `Permission denied (publickey)` | `VM_SSH_KEY` is not the pair of the key in `~/.ssh/authorized_keys` | Redo 1.7 |
| Out of capacity when creating the VM | No free Ampere hosts in the region right now | Retry later or another availability domain; Pay As You Go helps (1.1) |
