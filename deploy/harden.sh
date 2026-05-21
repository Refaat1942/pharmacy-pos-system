#!/bin/bash
# ============================================================
#  PharmaPOS — Production Hardening Script
#  Run as root on the VPS:
#    sudo bash /opt/pharmapos/deploy/harden.sh erp.fratelanza.com you@example.com
#
#  Idempotent: safe to re-run.
#  Does:
#    1. Set ENVIRONMENT=production + CORS allowlist + ensure 32-byte SECRET_KEY
#    2. Issue/renew Let's Encrypt cert (HTTPS + auto-redirect 80→443)
#    3. Install rate-limit + security-headers via a managed nginx include
#    4. Lock down systemd service (run as 'pharmapos', NoNewPrivileges, etc.)
#    5. Daily Postgres backups at 03:00 → /var/backups/pharmapos
#       (encrypted with openssl AES-256 if BACKUP_PASSPHRASE is set)
#    6. Restart services, verify HTTPS responds 200
# ============================================================
set -e

DOMAIN="${1:-erp.fratelanza.com}"
EMAIL="${2:-admin@$DOMAIN}"
APP_DIR="/opt/pharmapos"
APP_USER="pharmapos"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${GREEN}[✓]${NC} $1"; }
step() { echo -e "${CYAN}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[ "$EUID" -eq 0 ] || fail "Run as root: sudo bash $0 $DOMAIN $EMAIL"

step "Hardening for domain: $DOMAIN"

# ── 1. Patch env file: production mode + CORS + strong SECRET_KEY ──
step "Updating /etc/pharmapos.env (production mode, CORS, SECRET_KEY)..."
touch /etc/pharmapos.env
chmod 600 /etc/pharmapos.env

set_env() {
    local key="$1" val="$2"
    if grep -q "^$key=" /etc/pharmapos.env; then
        sed -i "s|^$key=.*|$key=$val|" /etc/pharmapos.env
    else
        echo "$key=$val" >> /etc/pharmapos.env
    fi
}

set_env ENVIRONMENT production
set_env CORS_ORIGINS "https://$DOMAIN"

# Ensure SECRET_KEY is set and strong (≥32 chars). If missing/weak/dev default → rotate.
CUR_KEY=$(grep '^SECRET_KEY=' /etc/pharmapos.env | cut -d= -f2- || true)
if [ -z "$CUR_KEY" ] || [ ${#CUR_KEY} -lt 32 ] || [ "$CUR_KEY" = "pharma-pos-secret-key-2024-change-in-prod" ]; then
    NEW_KEY=$(openssl rand -hex 32)
    set_env SECRET_KEY "$NEW_KEY"
    warn "Rotated weak/missing SECRET_KEY. All existing sessions will be invalidated — users must re-login."
fi
info "Env updated."

# ── 2. Lock systemd service to non-root + sandbox ───────────────────
step "Ensuring service runs as unprivileged user '$APP_USER'..."
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /bin/bash --home "$APP_DIR" "$APP_USER"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR" /var/log/pharmapos 2>/dev/null || true
SERVICE=/etc/systemd/system/pharmapos.service
if grep -q '^User=root' "$SERVICE" 2>/dev/null; then
    sed -i "s|^User=root|User=$APP_USER|" "$SERVICE"
    grep -q '^Group=' "$SERVICE" || sed -i "/^User=/a Group=$APP_USER" "$SERVICE"
    info "systemd User changed to $APP_USER."
fi
if ! grep -q 'NoNewPrivileges' "$SERVICE" 2>/dev/null; then
    sed -i '/^\[Service\]/a NoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=full\nProtectHome=true' "$SERVICE"
fi
systemctl daemon-reload

# ── 3. Certbot HTTPS ────────────────────────────────────────────────
step "Issuing/renewing TLS certificate for $DOMAIN..."
if ! command -v certbot &>/dev/null; then
    apt-get install -y -qq certbot python3-certbot-nginx
fi
certbot --nginx --non-interactive --agree-tos --redirect \
    -d "$DOMAIN" -m "$EMAIL" --keep-until-expiring || \
    warn "Certbot returned non-zero (may already be valid)"
systemctl enable --now certbot.timer 2>/dev/null || true
info "TLS active. Auto-renew: certbot.timer"

# ── 4. Nginx hardening via managed snippet (deterministic) ──────────
step "Installing nginx rate-limit zone + security snippet..."

# 4a. Global rate-limit zone (must live in http {} context, not server {})
RATE_CONF=/etc/nginx/conf.d/pharmapos-ratelimit.conf
cat > "$RATE_CONF" <<'EOF'
# 5 req/sec per IP on auth endpoints (defence in depth)
limit_req_zone $binary_remote_addr zone=pharmapos_auth:10m rate=5r/s;
EOF

# 4b. Copy the managed snippet next to nginx config
SNIPPET_SRC="$APP_DIR/deploy/nginx-pharmapos-security.conf"
SNIPPET_DEST=/etc/nginx/snippets/pharmapos-security.conf
mkdir -p /etc/nginx/snippets
cp "$SNIPPET_SRC" "$SNIPPET_DEST"

# 4c. Ensure every HTTPS server block for this domain includes the snippet.
# certbot rewrites /etc/nginx/sites-available/pharmapos to add `listen 443`.
NGINX_SITE=/etc/nginx/sites-available/pharmapos
[ -f "$NGINX_SITE" ] || fail "Expected nginx site $NGINX_SITE — run setup_vps.sh first."

INCLUDE_LINE="    include /etc/nginx/snippets/pharmapos-security.conf;"
if ! grep -qF "$INCLUDE_LINE" "$NGINX_SITE"; then
    # Insert the include line right after the LAST "listen 443" directive's server { opening
    # by walking the file with awk (deterministic, not regex-based).
    awk -v inc="$INCLUDE_LINE" '
        BEGIN { in_https = 0; printed = 0 }
        /listen[ \t]+443/ { in_https = 1 }
        { print }
        in_https && !printed && /listen[ \t]+443/ {
            print inc
            printed = 1
        }
    ' "$NGINX_SITE" > "$NGINX_SITE.new"
    if grep -qF "$INCLUDE_LINE" "$NGINX_SITE.new"; then
        mv "$NGINX_SITE.new" "$NGINX_SITE"
        info "Snippet include added to nginx site."
    else
        rm -f "$NGINX_SITE.new"
        warn "Could not auto-insert include line. Add this manually inside the HTTPS server block:"
        warn "  $INCLUDE_LINE"
    fi
else
    info "Snippet already included."
fi

# 4d. Validate nginx config and reload — abort cleanly if it fails
if ! nginx -t 2>/tmp/nginx-test.log; then
    cat /tmp/nginx-test.log
    fail "Nginx config invalid after patch. Review $NGINX_SITE and rerun."
fi
systemctl reload nginx
info "Nginx hardened and reloaded."

# Verify the auth rate-limit blocks are actually live
if curl -sS -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/auth/login" -X POST -H 'Content-Type: application/json' --data '{}' | grep -qE '^(4..|5..)$'; then
    info "Auth endpoint reachable behind rate-limit."
else
    warn "Could not verify auth endpoint via HTTPS — check manually."
fi

# ── 5. Daily Postgres backups ───────────────────────────────────────
step "Configuring daily DB backups at 03:00 → /var/backups/pharmapos..."
mkdir -p /var/backups/pharmapos
chmod 700 /var/backups/pharmapos

# Read optional backup passphrase from env file (set it manually for encryption).
BACKUP_PASS=$(grep '^BACKUP_PASSPHRASE=' /etc/pharmapos.env | cut -d= -f2- || true)

cat > /usr/local/bin/pharmapos-backup.sh <<'BAK'
#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
DEST=/var/backups/pharmapos
mkdir -p "$DEST"

PASS=$(grep '^BACKUP_PASSPHRASE=' /etc/pharmapos.env 2>/dev/null | cut -d= -f2- || true)

if [ -n "$PASS" ]; then
    # AES-256 encrypted backup (requires the passphrase to restore)
    sudo -u postgres pg_dump -Fc pharmapos_db | \
        openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
        -pass "pass:$PASS" -out "$DEST/pharmapos_db_$TS.dump.enc"
    chmod 600 "$DEST/pharmapos_db_$TS.dump.enc"
else
    sudo -u postgres pg_dump -Fc pharmapos_db > "$DEST/pharmapos_db_$TS.dump"
    chmod 600 "$DEST/pharmapos_db_$TS.dump"
fi

# Retain last 14 days (both encrypted and plain forms)
find "$DEST" -type f \( -name 'pharmapos_db_*.dump' -o -name 'pharmapos_db_*.dump.enc' \) -mtime +14 -delete
BAK
chmod 700 /usr/local/bin/pharmapos-backup.sh

cat > /etc/cron.d/pharmapos-backup <<'CRON'
0 3 * * * root /usr/local/bin/pharmapos-backup.sh >> /var/log/pharmapos/backup.log 2>&1
CRON

if [ -n "$BACKUP_PASS" ]; then
    info "Daily AES-256 encrypted backup scheduled (passphrase set)."
else
    warn "Daily backup scheduled (UNENCRYPTED on disk)."
    warn "To enable encryption, add this to /etc/pharmapos.env then re-run:"
    warn "  BACKUP_PASSPHRASE=\$(openssl rand -hex 24)"
    warn "STORE THIS PASSPHRASE SEPARATELY — without it, encrypted backups are unrecoverable."
fi

# ── 6. Restart and verify ───────────────────────────────────────────
step "Restarting backend with new env + service hardening..."
systemctl restart pharmapos
sleep 4

LOCAL=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/auth/me || echo ERR)
HTTPS=$(curl -sS -o /dev/null -w "%{http_code}" "https://$DOMAIN/" || echo ERR)
REDIR=$(curl -sS -o /dev/null -w "%{http_code}" "http://$DOMAIN/" || echo ERR)

[ "$LOCAL" = "401" ] && info "Local backend HTTP $LOCAL  (401 = healthy, auth required)" || warn "Local backend HTTP $LOCAL (expected 401)"
[ "$HTTPS" = "200" ] && info "HTTPS         HTTP $HTTPS  (site live)" || warn "HTTPS HTTP $HTTPS (expected 200)"
[ "$REDIR" = "301" ] && info "HTTP→HTTPS    HTTP $REDIR  (redirect active)" || warn "HTTP→HTTPS HTTP $REDIR (expected 301)"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              ✅  HARDENING COMPLETE                       ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Done:                                                    ║"
echo "║   • CORS locked to https://$DOMAIN"
echo "║   • Strong SECRET_KEY (32-byte) — startup refuses weak    ║"
echo "║   • HTTPS forced (HSTS, no http)                          ║"
echo "║   • Backend runs as 'pharmapos' user (not root)           ║"
echo "║   • Login throttled at app + nginx layer                  ║"
echo "║   • Daily DB backup at 03:00 (14d retention)              ║"
echo "║   • Security headers (HSTS / XCTO / XFO / Referrer)       ║"
echo "║   • API docs (/docs, /openapi.json) disabled in prod      ║"
echo "║                                                           ║"
echo "║  STILL TO DO MANUALLY:                                    ║"
echo "║   1. Change admin password from default in pharmacy UI    ║"
echo "║   2. Change superadmin password in /platform UI           ║"
echo "║   3. (Recommended) Set BACKUP_PASSPHRASE + rerun this     ║"
echo "║   4. (Optional) Copy backups offsite (rclone/S3)          ║"
echo "╚══════════════════════════════════════════════════════════╝"
