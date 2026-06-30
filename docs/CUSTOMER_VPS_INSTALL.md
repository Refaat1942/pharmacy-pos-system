# Customer VPS Install Guide

Step-by-step guide for installing **Pharmacy POS (Fratelanza ERP)** on a **customer-owned VPS**.

Use the stable **`main`** branch unless you have explicitly sold and tested a feature on another branch (e.g. ETA).

---

## Who does what

| Role | Responsibility |
|------|----------------|
| **Customer** | VPS account, domain name, DNS, paying the host |
| **You (vendor)** | Run installer, HTTPS, first setup, training, support |
| **Pharmacy staff** | Daily use with **pharmacy admin** login only |

**Important:** The customer does **not** need super-admin. Super-admin is for **you** when managing multiple pharmacies on one server. On a dedicated customer VPS, hand over **pharmacy admin** only.

---

## What the customer must give you before you start

- [ ] VPS with **Ubuntu 22.04 or 24.04** (minimum **2 GB RAM**, **20 GB** disk)
- [ ] **Root SSH access** (or sudo user) — IP + password or SSH key
- [ ] **Domain** they control, e.g. `erp.pharmacyname.com`
- [ ] DNS **A record** pointing that domain → VPS IP (can be done while you install)
- [ ] Optional: pharmacy name, branch name, list of user accounts to create

---

## Scenario A — New pharmacy (empty system)

### Step 1 — Connect to the VPS

```bash
ssh root@CUSTOMER_VPS_IP
```

### Step 2 — Run the one-shot installer

Replace `erp.pharmacyname.com` with the customer domain (or use the VPS IP if DNS is not ready yet).

```bash
bash <(curl -s https://raw.githubusercontent.com/Refaat1942/pharmacy-pos-system/main/deploy/setup_vps.sh) erp.pharmacyname.com
```

**Wait 15–25 minutes.** The script automatically:

- Installs PostgreSQL, Node.js, Nginx, Python
- Clones the app to `/opt/pharmapos`
- Creates database `pharmapos_db`
- Runs schema + sample seed
- Builds the frontend
- Starts the backend service

### Step 3 — HTTPS + hardening + daily backups (recommended)

After DNS points to the VPS:

```bash
sudo bash /opt/pharmapos/deploy/harden.sh erp.pharmacyname.com admin@pharmacyname.com
```

This sets production mode, HTTPS (Let’s Encrypt), security headers, and a daily backup cron.

**Alternative (manual HTTPS only):**

```bash
sudo certbot --nginx -d erp.pharmacyname.com
```

### Step 4 — Verify the app works

Open in browser:

```
https://erp.pharmacyname.com
```

**Login screen:**

| Field | Value (fresh install) |
|-------|------------------------|
| **Tenant / Pharmacy code** | `fratelanza` (default — see note below) |
| **Username** | `admin` |
| **Password** | `admin123` |

> **Tenant code:** A fresh install creates one default tenant with code **`fratelanza`**. The customer types this on the login page. You can rename it later via the control platform if needed; until then, tell them to use **`fratelanza`**.

Run a quick smoke test:

- [ ] Login works
- [ ] Open POS → add item → complete a **cash sale**
- [ ] Receipt opens / prints
- [ ] Settings → pharmacy name updated to customer name

### Step 5 — Change all default passwords (mandatory)

In **Settings → Users**, change passwords for:

| User | Default password | Action |
|------|------------------|--------|
| `admin` | `admin123` | **Change immediately** |
| `pharmacist1` | `pharm123` | Change or delete if unused |
| Other seeded users | see seed | Change or delete |

Do **not** give the customer default passwords in writing — set new ones with them on site or on a call.

### Step 6 — Customize for the customer

Using **pharmacy admin** (not super-admin):

1. **Settings → Pharmacy** — name, address, phone, tax ID, receipt text  
2. **Settings → Branches** — rename “Main Branch”, add branches if needed  
3. **Settings → Users** — create real staff accounts; disable unused demo users  
4. **Inventory** — delete demo products or import their real catalog  
5. **Optional:** delete demo customers from seed data  

### Step 7 — Handover to the customer

Give them:

| Item | Example |
|------|---------|
| **URL** | `https://erp.pharmacyname.com` |
| **Tenant code** | `fratelanza` (unless you renamed it) |
| **Admin username** | `admin` (or the account you created) |
| **Password** | The new password you set together |
| **Support contact** | Your phone / email / WhatsApp |

**Do not hand over:**

- Super-admin login (`superadmin` — vendor only)
- `/etc/pharmapos.env` contents (database password, SECRET_KEY)
- Root SSH password (unless contract says they manage the server themselves)

Store server credentials in **your** password manager for support visits.

### Step 8 — Confirm backups

```bash
sudo bash /opt/pharmapos/deploy/backup.sh
ls -lh /var/backups/pharmapos/
```

You should see `.sql.gz` files. If you used `harden.sh`, daily backups at 03:00 are already scheduled.

---

## Scenario B — Move existing data from your server to customer VPS

Use this when the pharmacy already runs on **your** VPS and is moving to **theirs**.

### On your (old) server

```bash
sudo bash /opt/pharmapos/deploy/backup.sh
ls -lh /var/backups/pharmapos/
```

Note the newest file, e.g. `pharmapos_db_20260623_030000.sql.gz`.

### Copy backup to customer VPS

From your laptop (or server-to-server):

```bash
scp root@OLD_VPS:/var/backups/pharmapos/pharmapos_db_LATEST.sql.gz root@CUSTOMER_VPS:/var/backups/pharmapos/
```

Create the folder on the new server if needed:

```bash
ssh root@CUSTOMER_VPS "mkdir -p /var/backups/pharmapos"
```

### On customer VPS

1. Run **setup_vps.sh** (Step A.2) if the server is fresh.  
2. **Restore** over the empty database:

```bash
sudo bash /opt/pharmapos/deploy/restore.sh pharmapos_db /var/backups/pharmapos/pharmapos_db_LATEST.sql.gz
```

Type `pharmapos_db` when prompted to confirm.

3. Run **harden.sh** with their domain (Step A.3).  
4. Point **their DNS** to the new VPS.  
5. Verify: recent invoices, stock, and users match the old system.  
6. Keep the old server running **7+ days** before shutdown; take one final backup.

---

## Applying updates later

When you release fixes on GitHub `main`:

```bash
ssh root@CUSTOMER_VPS_IP
sudo bash /opt/pharmapos/deploy/update.sh
```

This pulls code, runs database migrations (safe/idempotent), rebuilds frontend, restarts the backend.

---

## Useful commands (support)

| Task | Command |
|------|---------|
| Restart app | `sudo systemctl restart pharmapos` |
| App status | `sudo systemctl status pharmapos` |
| Backend log | `sudo journalctl -u pharmapos -f` |
| Manual backup | `sudo bash /opt/pharmapos/deploy/backup.sh` |
| List backups | `ls -lh /var/backups/pharmapos/` |
| Env file (secrets) | `/etc/pharmapos.env` |
| App directory | `/opt/pharmapos` |

---

## Super-admin — when YOU use it (optional)

URL: `https://erp.pharmacyname.com/platform`

Default (first boot only — **change immediately**):

- Username: `superadmin` (or `PLATFORM_ADMIN_USERNAME` in env)
- Password: `super123` (or `PLATFORM_ADMIN_PASSWORD` in env)

Use super-admin only to:

- Enable/disable modules (insurance, HR, reports, etc.) for that tenant  
- Create a **second** pharmacy company on the **same** VPS (rare on dedicated servers)

**The customer’s daily work uses pharmacy admin at the normal login page — not super-admin.**

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| Site does not open | DNS propagated? `dig erp.pharmacyname.com` → correct IP? |
| 502 / blank page | `sudo systemctl status pharmapos` — restart if down |
| Login fails | Tenant code `fratelanza` + correct username/password |
| HTTPS error | Run `harden.sh` or `certbot --nginx` again |
| After update, old UI | Hard refresh browser (Ctrl+F5) or clear cache |

---

## Pre-handover checklist (print this)

**New install**

- [ ] `setup_vps.sh` completed without errors  
- [ ] Domain + HTTPS working  
- [ ] Backup script tested  
- [ ] Default passwords changed  
- [ ] Pharmacy name / branch configured  
- [ ] Demo data removed or replaced  
- [ ] Test sale completed  
- [ ] Customer received URL + tenant code + admin login  
- [ ] Super-admin credentials **not** given to customer  

**Migration**

- [ ] Backup taken on old server  
- [ ] Restore verified on new server  
- [ ] DNS switched  
- [ ] 7-day overlap before old server shutdown  

---

## One-page summary (for you)

1. Customer gives VPS + domain + DNS.  
2. You run `setup_vps.sh` with their domain.  
3. You run `harden.sh` for HTTPS + backups.  
4. Login: tenant **`fratelanza`**, user **`admin`**, change password.  
5. Configure pharmacy name, users, inventory.  
6. Hand customer URL + admin login only.  
7. Keep root/super-admin/env secrets for yourself.

---

*Last updated: 2026-06-20 — matches deploy scripts in `deploy/setup_vps.sh`, `deploy/harden.sh`, `deploy/update.sh`, `deploy/backup.sh`, `deploy/restore.sh`.*
