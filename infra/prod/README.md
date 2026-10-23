# CampusStay FPT — production runbook

Deployment target (ADR-16): the **web app on Vercel**, the **API and PostgreSQL on one Ubuntu VPS** (any provider, x86-64) behind Caddy (HTTPS). On Azure for Students the database can be a managed Azure Database for PostgreSQL instead ([appendix A](#appendix-a-azure-for-students)). The Android app calls the same API.

```
Browser ──► https://campusstay-fpt-ten.vercel.app    (Vercel: static build of web/)
Browser, Android, SePay ──► https://<API_DOMAIN>/api ──► Caddy :443 ──► api :8080 ──► db :5432   (VPS, Docker Compose)
```

| What | Where | Deployed by |
|---|---|---|
| Web | Vercel project, Root Directory `web/` (`web/vercel.json`) | Vercel Git integration: every push to `main` (production) and every pull request (preview) |
| API + Postgres + Caddy | `/opt/campusstay` on the VPS (`infra/prod/`) | `.github/workflows/backend.yml`: push to `main` touching `backend/` or `infra/prod/` |
| Image | `ghcr.io/<owner>/campusstay-backend:<commit sha>` and `:latest` (linux/amd64) | same workflow |

## 1. One-time setup: the VPS

### 1.1 Choose the VPS
| | Recommended | Minimum |
|---|---|---|
| CPU | 2 vCPU | 1 vCPU (starts in about a minute) |
| Memory | **4 GB** | 2 GB, with swap (1.4) and `API_MEMORY=1g` |
| Disk | 40 GB SSD/NVMe | 25 GB |
| System | Ubuntu 24.04 LTS, x86-64 | Ubuntu 22.04 LTS |
| Network | one static public IPv4, a few GB of traffic a month | |

Why: the API container gets `API_MEMORY` (2 GB by default; the JVM uses 75 % of it as heap), Postgres needs about 300 MB, Caddy 50 MB and Ubuntu with Docker about 500 MB; the image is built on GitHub, never on the VPS. The database with the base data is under 1 GB; uploads, 14 days of backups and the capped logs fit easily in 40 GB.

Check before paying (the provider's sales page or support):
- **KVM** (a full virtual machine). OpenVZ/LXC "VPS" plans often cannot run Docker.
- Root SSH access and an Ubuntu image; inbound TCP 80 and 443 allowed.
- **Outbound SMTP port 587** allowed (Gmail, §3.1). Some providers block it against spam and open it on request.
- Monthly billing without a long contract, and snapshots if offered.
- A data centre in Vietnam or Singapore keeps the latency low for students. Vietnamese providers take bank transfers or VietQR, so no international card is needed.

The provider's welcome email gives the public IPv4 address and the root password or key.

### 1.2 First login, a deploy user, updates
Everything below runs as `deploy`, never as root. As root (first login from your computer: `ssh root@<IP>`):
```bash
adduser deploy                      # choose a password: sudo asks for it
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys     # paste your own public key (~/.ssh/id_ed25519.pub on your computer)
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
```
In a **second** terminal check `ssh deploy@<IP>` and `sudo true`. Only then turn off root and password logins:
```bash
printf 'PermitRootLogin no\nPasswordAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/99-campusstay.conf
sudo systemctl reload ssh
sudo apt update && sudo apt full-upgrade -y && sudo apt install -y unattended-upgrades
```
Ubuntu then installs security updates by itself. Reboot now and then (`sudo reboot`); the containers come back on their own (`restart: unless-stopped`). Keep the clock in UTC; the API converts to campus time itself.

### 1.3 Firewall
```bash
sudo ufw allow OpenSSH        # if the provider runs SSH on another port: sudo ufw allow <port>/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp        # HTTP/3, optional
sudo ufw enable
```
Never open 5432 or 8080: only Caddy publishes ports (Docker's published ports bypass ufw, so the database and the API stay private because they publish none). If the provider also has a cloud firewall or security group, open the same ports there.

### 1.4 Swap
Needed on 2 GB, useful on 4 GB. If `free -h` shows no swap yet:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl --system
```

### 1.5 Docker and the stack folder
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy          # then log out and in again
sudo mkdir -p /opt/campusstay && sudo chown deploy:deploy /opt/campusstay
docker run --rm hello-world             # Docker works
nc -vz smtp.gmail.com 587               # "succeeded": Gmail is reachable (1.1)
```

### 1.6 DNS name for the API
Caddy needs a name that points at the VPS before it can get the certificate.
- **Free `.id.vn` domain:** Vietnamese citizens aged 18–23 can register one free of charge through an accredited `.vn` registrar (identity check with the citizen ID card). Then, in the registrar's DNS panel, add an `A` record `api` → the VPS's IPv4: `API_DOMAIN=api.<name>.id.vn`.
- Any other domain you own works the same way (`api.<domain>`), and so does a free DuckDNS subdomain (`<name>.duckdns.org`, IP set to the VPS).
- If the DNS is on Cloudflare, keep the record **DNS only** (grey cloud) so Caddy gets the certificate itself. Add no `AAAA` record unless the VPS answers on that IPv6 address.

Check: `nslookup <API_DOMAIN>` answers the VPS's IP.

### 1.7 Settings file
Copy [`.env.example`](.env.example) to `/opt/campusstay/.env` on the VPS, fill it in, then `chmod 600 /opt/campusstay/.env`. The workflow never overwrites `.env`. Also `mkdir -p /opt/campusstay/secrets` (the Firebase key goes there, §3.3).
- `API_DOMAIN`: the name from 1.6.
- `DB_PASSWORD` and `FILES_LINK_SECRET`: one `openssl rand -hex 32` each.
- Database: keep `COMPOSE_PROFILES=local-db` (Postgres in the stack). A managed database (Azure, appendix A) uses `DB_URL` instead.
- `WEB_BASE_URL` and `CORS_ALLOWED_ORIGINS`: the Vercel production URL (§2).
- `API_MEMORY=1g` on a 2 GB VPS.
- Gmail, VietQR/SePay, Firebase, Google: §3. Each one can be added later; the API starts without them.
- Base data: decide **before the first start** (1.10).

### 1.8 GitHub Actions access
On the VPS, as `deploy`, create a key used only for deploys (no passphrase, so the workflow can use it) and allow it:
```bash
ssh-keygen -t ed25519 -N "" -C campusstay-deploy -f ~/.ssh/campusstay-deploy
cat ~/.ssh/campusstay-deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/campusstay-deploy        # copy the whole output, BEGIN and END lines included
```
GitHub → repository → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `VM_SSH_KEY` | the private key printed above |
| Variable | `VM_HOST` | `<API_DOMAIN>` or the VPS's IP |
| Variable | `VM_USER` | `deploy` |
| Variable | `API_DOMAIN` | e.g. `api.campusstay.id.vn` (used for the health check) |
| Variable (optional) | `VM_SSH_PORT` | the SSH port, when it is not 22 |
| Variable (optional) | `IMAGE_PLATFORM` | `linux/arm64` only for an ARM VPS; leave it unset for x86 |

Then delete the private key from the VPS: `rm ~/.ssh/campusstay-deploy` (the `.pub` line stays in `authorized_keys`).

### 1.9 First deploy
GitHub → Actions → **backend** → Run workflow (branch `main`). The run verifies, builds the image, copies `infra/prod/` to the VPS, starts the stack and waits for `https://<API_DOMAIN>/api/actuator/health/readiness`. The first start takes a minute or two (Flyway migrations, base data, certificate).

Check from anywhere: `curl https://<API_DOMAIN>/api/actuator/health` → `{"status":"UP"}`.

### 1.10 Base data (optional)
The base data (`db/seed`) adds 8 Blocks with their Rooms and Beds, the Room Types and Classes, the back-office accounts (`admin@fpt.edu.vn`, `manager.a` … `manager.h`, `staff.a1` … `staff.h2`) and 6,200 fictional students (`se190001@fpt.edu.vn` …). It has no Terms or history: the Admin confirms the fees and publishes the first Term. Without it the database has only the reference data and no account to sign in with.
1. Uncomment `SPRING_FLYWAY_LOCATIONS`, deploy (1.9) and wait for `UP`. Keep the line: the seed is idempotent, so a newer version only adds what is missing. (If you remove it later, uncomment `SPRING_FLYWAY_IGNOREMIGRATIONPATTERNS=repeatable:missing`.)
2. The seed addresses are fictional `@fpt.edu.vn` mailboxes: real email sent to them goes to FPT's mail server. Before testing password reset or Admin emails, give the accounts you use your own address, e.g. in psql `UPDATE auth_user SET email = '<you>@fpt.edu.vn' WHERE email = 'admin@fpt.edu.vn';`.
3. Every seed account has the password written in the repository, which is public. Replace it with your own demo password:
   ```bash
   docker run --rm httpd:2.4-alpine htpasswd -nbBC 10 "" '<new demo password>' | tr -d ':\n'; echo
   cd /opt/campusstay && docker compose exec db psql -U campusstay -d campusstay
   ```
   In psql (paste the hash between the quotes): `UPDATE auth_user SET password_hash = '<hash>';` then `\q`.

### 1.11 Backups
`mkdir -p /opt/campusstay/backups` (the cron line logs there), then `crontab -e` as `deploy` and add the line from the top of [`backup.sh`](backup.sh). It writes a database dump and an archive of the uploaded files (receipts, photos) and keeps the newest 14 of each on the VPS. A backup on the same machine does not survive losing it: copy them to your computer now and then, and take a provider snapshot before risky changes:
`scp "deploy@<API_DOMAIN>:/opt/campusstay/backups/*-<stamp>*" .`

## 2. One-time setup: Vercel (web)
1. Done on 22/10/2026: project `campusstay-fpt` in the Vercel scope `tisou`, linked to `tisou47/CampusStay-FPT`, **Root Directory `web`**; framework, build command and output come from `web/vercel.json`. Production URL: `https://campusstay-fpt-ten.vercel.app` (`campusstay-fpt.vercel.app` was taken; another free `*.vercel.app` name or your own domain can be set under Settings → Domains, then update `WEB_BASE_URL`, `CORS_ALLOWED_ORIGINS` and the Google origin). Previews are `campusstay-<hash>-tisou.vercel.app` and need a Vercel sign-in (deployment protection).
2. Environment Variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://<API_DOMAIN>/api` |
   | `VITE_GOOGLE_CLIENT_ID` | the Web OAuth client id (optional) |

   `VITE_*` values are baked in at build time: after changing one, redeploy.
3. Deploy, then put the final production URL into `WEB_BASE_URL` and `CORS_ALLOWED_ORIGINS` in the VPS's `.env` and run `docker compose up -d` in `/opt/campusstay`.
4. `web/vercel.json` skips a **preview** build when nothing under `web/` changed since the last deployment (production always builds, so a redeploy after changing a `VITE_*` variable takes effect), rewrites every path to `index.html` (client-side routes) and caches `/assets/*` for a year.

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
3. **Demo server:** also set `MAIL_REDIRECT_TO` to the team's mailbox (for example the same Gmail address). Every email then goes there with `[to <real recipient>]` in front of the subject, so the seed accounts' fictional addresses never receive mail and the whole demo can be followed in one inbox. Leave it blank only when real students use the system.
4. `docker compose up -d`, then test: "Forgot password" on the web for any account; the email arrives in the redirect mailbox (or, without the redirect, at an account whose email you can read).
5. Limit: a personal Gmail account sends about 500 emails a day. Admin emails to a large student group (the base data has 6,200 students) would exceed it and get the account blocked for a day: send campaigns to small groups only, even with the redirect.

### 3.2 VietQR and SePay (ADR-08)
The payment page shows a VietQR image from SePay's free image service (`qr.sepay.vn`) for the account in `PAYMENT_*` (default: a fictional demo account), with the Invoice's transfer content (`CSTAY` + number). The SePay webhook reports each incoming transfer; an exact amount marks the Invoice Paid, any other amount waits for Staff.

**Demo without a bank (the current setup):** `PAYMENT_SIMULATOR=true` in `.env` and `VITE_PAYMENT_SIMULATOR=true` on Vercel (redeploy) add a "Simulate bank transfer" button to the payment page; it pays the Invoice as if SePay had reported the exact transfer (only the Invoice's student or an Admin). Staff › Payments manual confirmation works as well. SePay is not needed; keep the demo account in `PAYMENT_*` so nobody scans a real account.

**Real transfers with SePay** (optional, OI-13):
1. Register at sepay.vn and link the receiving bank account (OI-13). Put the same account in `PAYMENT_BANK_NAME`, `PAYMENT_BANK_CODE` (SePay's short name, e.g. `MBBank`), `PAYMENT_ACCOUNT_NUMBER`, `PAYMENT_ACCOUNT_NAME`.
2. SePay → company settings → payment code structure: prefix **`CSTAY`** followed by digits (it must equal `campusstay.payment.transfer-prefix`).
3. SePay → Webhooks → add: URL `https://<API_DOMAIN>/api/webhooks/sepay`, event incoming money, authentication **API Key** with a value from `openssl rand -hex 24`. Put the same value in `SEPAY_WEBHOOK_API_KEY`.
4. Test with a real transfer. Invoice amounts come from the Admin configuration: for a live demo, give the demo Term a small Deposit so the transfer costs little. A refused webhook (wrong key) is written to the Audit Log.

### 3.3 Firebase Cloud Messaging (Android push)
1. console.firebase.google.com → create a project (free Spark plan) → Project settings → Service accounts → **Generate new private key**.
2. Copy the JSON to the VPS: `scp key.json deploy@<API_DOMAIN>:/opt/campusstay/secrets/firebase.json`, then on the VPS `chmod 644 /opt/campusstay/secrets/firebase.json` (the API runs as an unprivileged user inside the container). Never commit it.
3. In `.env`: `FIREBASE_CREDENTIALS_FILE=/app/secrets/firebase.json`. The log line "push notifications are skipped" disappears.
4. The Android app registers its FCM token with the API; add the Android app to the same Firebase project (package name) and put its `google-services.json` in the Flutter project.

### 3.4 Google sign-in (ADR-14)
1. Google Cloud Console (the Firebase project can be reused) → OAuth consent screen: user type External, scopes `openid`, `email`, `profile` only, then **Publish app**. In "Testing" status only the test users you list can sign in.
2. Credentials → OAuth client ID, type Web application → Authorized JavaScript origins: the Vercel production URL. Google accepts no wildcards, so preview deployments sign in with email and password only.
3. Client id and secret into the VPS's `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), client id into Vercel (`VITE_GOOGLE_CLIENT_ID`), then redeploy the web.
4. Only `@fpt.edu.vn` accounts that already exist in CampusStay can sign in: give a test account your FPT email (backend/README.md). Android needs its own OAuth client of type Android (package name + SHA-1 of the release key).

## 4. Operations (on the VPS, as `deploy`, in `/opt/campusstay`)

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| API logs | `docker compose logs -f --tail 200 api` |
| Restart the API after editing `.env` | `docker compose up -d` |
| Roll back to an older build | `API_TAG=<commit sha> docker compose up -d api` (the next push to `main` deploys the newest build again) |
| psql | `docker compose exec db psql -U campusstay -d campusstay` (managed database: appendix A.4) |
| Restore a dump | `docker compose stop api` → `docker compose exec -T db pg_restore -U campusstay -d campusstay --clean --if-exists < backups/<file>.dump` → `docker compose start api` |
| Restore the files | `docker compose run --rm --no-deps -T --entrypoint tar api -C /app/data -xzf - < backups/files-<stamp>.tgz` |
| Disk usage | `df -h /` and `docker system df` |

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser: "Cannot reach the CampusStay server" | `VITE_API_BASE_URL` wrong or not redeployed; API down | Open `https://<API_DOMAIN>/api/actuator/health`; check the Vercel variable and redeploy |
| `403` on every call from the web | The page's origin is missing from `CORS_ALLOWED_ORIGINS` | Add it (exact URL or a `*` pattern), `docker compose up -d` |
| Caddy log: certificate errors | DNS not pointing at the VPS yet (1.6), or port 80 closed (1.3, and the provider's firewall) | Fix DNS or the rules, then `docker compose restart caddy` |
| API keeps restarting, log says "Detected applied migration not resolved locally" | The seed was loaded and `SPRING_FLYWAY_LOCATIONS` removed without the ignore pattern | Set `SPRING_FLYWAY_IGNOREMIGRATIONPATTERNS=repeatable:missing` (1.10) |
| API keeps restarting right after a deploy, log shows SQL errors from `R__dev_seed` | The base data does not fit rows changed by hand | Fix those rows, or remove `db/seed` from `SPRING_FLYWAY_LOCATIONS` and set the ignore pattern (1.10) |
| Emails never arrive | `SPRING_MAIL_*` not set (log says "emails are not sent"), wrong App Password, the daily Gmail limit, or the provider blocks port 587 | §3.1; `docker compose logs api \| grep -i mail`; `nc -vz smtp.gmail.com 587` on the VPS, else ask the provider to open it |
| Payments stay Unpaid after a transfer | Webhook URL or key wrong in SePay, or the transfer content was changed by the payer | SePay → webhook history shows our answer; Staff confirm by hand meanwhile |
| API stops at start: "Cannot read the Firebase credentials file" | Wrong path or the file is not readable | §3.3 step 2 |
| Deploy job: `Permission denied (publickey)` or a timeout | `VM_SSH_KEY` is not the pair of the key in `~/.ssh/authorized_keys`, `VM_USER` is not `deploy`, or SSH runs on another port | Redo 1.8; set `VM_SSH_PORT` |
| Deploy job: `no matching manifest for linux/arm64` (or amd64) on pull | The image was built for the other CPU | Set or clear `IMAGE_PLATFORM` (1.8) and run the workflow again |
| `api` restarts with exit code 137 (`docker compose ps`), "Killed" in the log | Out of memory | `API_MEMORY=1g` and swap on a 2 GB VPS (1.4), or a 4 GB plan |
| `docker run hello-world` fails on a new VPS | OpenVZ/LXC plan without the kernel features Docker needs | Ask for a KVM plan (1.1) |
| API log: `Connection to db:5432 refused` or `UnknownHostException: db` | `COMPOSE_PROFILES=local-db` missing from `.env` while `DB_URL` is not set | Put the line back (1.7), or set `DB_URL` for a managed database (appendix A) |
| API log: timeout or `no pg_hba.conf entry` for the Azure database | The server's firewall lacks the VM's public IP, or `sslmode=require` is missing | A.2 networking rule; the `DB_URL` of A.3 |

## 6. Continuous deployment and monitoring

### 6.1 How a change reaches production
Nothing is deployed by hand: merging into `main` is the deploy.

| Change pushed to `main` | What runs | Where to watch |
|---|---|---|
| `backend/**`, `infra/prod/` stack files or the workflow | `.github/workflows/backend.yml`: `mvn verify` → image → copy the stack to the server → `docker compose up -d` → readiness check | GitHub → Actions → backend |
| Anything (production) or `web/**` (previews) | Vercel builds `web/` with its environment variables | Vercel → Deployments |
| A new Flyway migration | Applied by the API when the new image starts | API log: "Successfully applied" |
| A setting (`.env` on the server) | Not in Git: edit `/opt/campusstay/.env`, then `docker compose up -d` | `docker compose ps` |
| A Vercel variable (`VITE_*`) | Baked in at build time: redeploy the production deployment | Vercel → Deployments |

A failing `mvn verify` stops the run before the image, so the running version stays. Roll back with §4 (`API_TAG=<older sha>`) or Vercel → Deployments → an older one → Promote.

### 6.2 What to check, and how often
| When | What | How |
|---|---|---|
| After every push | Actions run green, Vercel deployment Ready, health UP | GitHub Actions; Vercel; `curl https://<API_DOMAIN>/api/actuator/health` |
| All the time (free) | Uptime with an email alert | An external monitor (e.g. UptimeRobot or Better Stack free plan) on `https://<API_DOMAIN>/api/actuator/health` every 5 minutes |
| Weekly | Disk, memory, swap, containers | `df -h /`, `free -h`, `docker stats --no-stream`, `docker compose ps` |
| Weekly | Errors in the API log | `docker compose logs --since 168h api \| grep -E "ERROR\|WARN"` |
| Weekly | Cost and credit | Azure → Cost Management (budget `campusstay`, emails at 80 %) and Education hub (credit left) |
| Weekly | Database (appendix A) | Azure → the PostgreSQL server → Metrics: storage used (32 GB in the free amount), CPU credits; Backup and restore: the latest restore point |
| Monthly | VM CPU credits (B-series) | Azure → the VM → Metrics → *CPU Credits Remaining*: at 0 the VM is throttled (long assignment runs or exports use credits) |
| Automatic, check monthly | HTTPS certificate | Caddy renews it; `echo \| openssl s_client -connect <API_DOMAIN>:443 2>/dev/null \| openssl x509 -noout -enddate` |
| Before each review or the defense | Backups and a test restore | §1.11 cron (uploaded files), a one-off database dump (A.4) copied to your computer |

## Appendix A. Azure for Students
The stack runs on an Azure VM like on any VPS. Two layouts:

| | A. Free VM + managed database (recommended) | B. One 4 GB VM |
|---|---|---|
| VM | **B2ats v2** (x64) or **B2pts v2** (Arm64): 2 vCPU, 1 GB, inside the student free hours | e.g. **B2s** or **B2as v2** (2 vCPU, 4 GB), paid from the $100 credit (check the price in the portal) |
| Database | **Azure Database for PostgreSQL – Flexible Server**, Burstable **B1ms**, 32 GB, inside the 12 free months; Azure backs it up | Postgres in the stack (`COMPOSE_PROFILES=local-db`), backed up by `backup.sh` |
| Settings | `.env` without `COMPOSE_PROFILES`, with `DB_URL`; `API_MEMORY=700m`; swap 2 GB | the VPS defaults (§1) |

Free amounts, allowed regions and VM sizes depend on the subscription: the portal marks eligible sizes as free-services eligible. Small items outside them (for example the public IP) are taken from the credit, so set a budget first: Cost Management → Budgets → 5 USD with an email alert.

### A.1 The VM
Portal → Virtual machines → Create:
- Resource group `campusstay`; region: the nearest one the subscription allows (Southeast Asia if possible).
- Image **Ubuntu Server 24.04 LTS** (x64 for B2ats v2 or B2s, Arm64 for B2pts v2); size as in the table.
- Authentication: SSH public key, username **`deploy`**, paste your own public key (`~/.ssh/id_ed25519.pub`). Azure creates the user with sudo and turns password login off, so skip the root steps of 1.2.
- Inbound ports: SSH (22). Disk: Standard SSD (64 GB is enough). Management: leave auto-shutdown **off** (the API must run all the time).

After it starts:
1. Its **Public IP address** resource → Configuration: assignment **Static**, and a **DNS name label**, e.g. `campusstay-api`. The API's name is then `campusstay-api.<region>.cloudapp.azure.com`: use it as `API_DOMAIN` (no domain to buy; an own domain or `.id.vn` from 1.6 works too).
2. The VM → Networking → Add inbound port rule: TCP 80 and TCP 443 (and UDP 443, optional) from Any. Keep 5432 and 8080 closed. Optionally limit SSH to your own IP.
3. Then, as `deploy`: updates (end of 1.2), 1.3 (`ufw` is optional behind the Azure rules, but open SSH first if you enable it), 1.4 (swap: needed on 1 GB), 1.5 (Docker). Outbound port 587 for Gmail is open on Azure.

### A.2 The database (layout A)
Portal → Azure Database for PostgreSQL flexible servers → Create:
- Same resource group and region as the VM; server name e.g. `campusstay-db`; PostgreSQL **17**; workload *Development*, then Compute + storage → **Burstable B1ms**, 32 GB; high availability off; backup retention 7 days.
- Authentication: PostgreSQL authentication only; admin user `campusstay` (not `postgres` or `admin`) and a password from `openssl rand -hex 24`.
- Networking: **Public access**, add a firewall rule with the VM's public IP (and *Add current client IP* if you want psql from your computer); leave "Allow public access from any Azure service" unchecked. SSL is required by default; keep it.

After it is created: Databases → Add → `campusstay`. No extension is needed.

### A.3 Settings and deploy
In `/opt/campusstay/.env` (1.7), for layout A:
```
API_DOMAIN=campusstay-api.<region>.cloudapp.azure.com
# COMPOSE_PROFILES=local-db        ← deleted: no Postgres container
DB_URL=jdbc:postgresql://campusstay-db.postgres.database.azure.com:5432/campusstay?sslmode=require
DB_USER=campusstay
DB_PASSWORD=<the server's admin password>
API_MEMORY=700m
```
Layout B keeps the defaults of `.env.example` (`COMPOSE_PROFILES=local-db`, a generated `DB_PASSWORD`).

GitHub (1.8): `VM_HOST` = the DNS name, `VM_USER` = `deploy`, `API_DOMAIN` = the DNS name, and **`IMAGE_PLATFORM=linux/arm64` for B2pts v2** (leave it unset for x64 sizes). Then the first deploy (1.9) and the base data (1.10).

### A.4 Operations with the managed database
| Task | How |
|---|---|
| psql | `docker run --rm -it postgres:17-alpine psql "host=campusstay-db.postgres.database.azure.com dbname=campusstay user=campusstay sslmode=require"` |
| Backups | Azure keeps 7 days with point-in-time restore (server → Backup and restore → Restore creates a new server; point `DB_URL` at it). `backup.sh` still archives the uploaded files |
| One-off dump | `docker run --rm -e PGPASSWORD="$(grep ^DB_PASSWORD= .env \| cut -d= -f2-)" postgres:17-alpine pg_dump -Fc "host=campusstay-db.postgres.database.azure.com dbname=campusstay user=campusstay sslmode=require" > backups/manual.dump` (the password stays out of the shell history) |
| Stop paying | Delete the resource group `campusstay` (VM, IP, disk and database together) |
