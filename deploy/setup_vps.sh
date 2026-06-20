#!/bin/bash
# ============================================================
#  PharmaPOS — VPS Setup Script (GitHub deploy)
#  Run as root on a fresh Ubuntu 24.04 VPS:
#
#    bash <(curl -s https://raw.githubusercontent.com/Refaat1942/pharmacy-pos-system/main/deploy/setup_vps.sh) 187.124.15.14
#
#  Or after cloning:
#    bash /opt/pharmapos/deploy/setup_vps.sh 187.124.15.14
# ============================================================
set -e

REPO="https://github.com/Refaat1942/pharmacy-pos-system.git"
APP_DIR="/opt/pharmapos"
APP_USER="pharmapos"
DB_NAME="pharmapos_db"
DB_USER="pharmapos_user"
DB_PASS="$(openssl rand -hex 16)"
SECRET_KEY="$(openssl rand -hex 32)"
SERVER_NAME="${1:-187.124.15.14}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
step()  { echo -e "${CYAN}[→]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   PharmaPOS — VPS Auto-Setup from GitHub  ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
info "Server: $SERVER_NAME"
info "Repo:   $REPO"
echo ""

# ── 1. System update ────────────────────────────────────────
step "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl wget git unzip build-essential libpq-dev python3 python3-pip python3-dev python3-venv

# ── 2. Node.js 20 ───────────────────────────────────────────
step "Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ $(node --version | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
    apt-get install -y -qq nodejs
fi
info "Node.js: $(node --version)"

# ── 3. PostgreSQL ────────────────────────────────────────────
step "Installing PostgreSQL..."
apt-get install -y -qq postgresql postgresql-contrib
systemctl start postgresql && systemctl enable postgresql

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL 2>/dev/null
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';
  END IF;
END\$\$;
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='$DB_NAME') \gexec
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER DATABASE $DB_NAME OWNER TO $DB_USER;
SQL
info "Database '$DB_NAME' ready."

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

# ── 4. Nginx ────────────────────────────────────────────────
step "Installing Nginx..."
apt-get install -y -qq nginx certbot python3-certbot-nginx
systemctl enable nginx

# ── 5. Clone project from GitHub ────────────────────────────
step "Cloning from GitHub..."
if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" pull origin main
    info "Repo updated."
else
    rm -rf "$APP_DIR"
    git clone "$REPO" "$APP_DIR"
    info "Repo cloned."
fi

# ── 6. App system user ──────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /bin/bash --home "$APP_DIR" "$APP_USER"
fi

# ── 7. Python virtualenv ─────────────────────────────────────
step "Setting up Python environment..."
python3 -m venv "$APP_DIR/venv"
source "$APP_DIR/venv/bin/activate"
pip install -q --upgrade pip
pip install -q fastapi "uvicorn[standard]" gunicorn psycopg2-binary \
    "bcrypt>=4.0,<5.0" "python-jose[cryptography]" python-multipart
info "Python packages installed."

# ── 8. Environment file ──────────────────────────────────────
step "Writing environment config..."
cat > /etc/pharmapos.env <<ENV
DATABASE_URL=$DATABASE_URL
SECRET_KEY=$SECRET_KEY
ENVIRONMENT=production
ENV
chmod 600 /etc/pharmapos.env

# ── 9. Init DB schema + Seed ─────────────────────────────────
step "Creating database tables..."
cd "$APP_DIR/backend"
DATABASE_URL="$DATABASE_URL" "$APP_DIR/venv/bin/python" init_db.py

step "Seeding sample data..."
DATABASE_URL="$DATABASE_URL" "$APP_DIR/venv/bin/python" seed.py || warn "Seed skipped (data may already exist)"

# ── 10. Build frontend ───────────────────────────────────────
step "Installing npm packages..."
cd "$APP_DIR/frontend"
npm install --legacy-peer-deps -q

step "Building React frontend..."
npm run build
info "Frontend built → $APP_DIR/frontend/dist"

# ── 11. Systemd service ──────────────────────────────────────
step "Creating systemd service..."
mkdir -p /var/log/pharmapos
cat > /etc/systemd/system/pharmapos.service <<SERVICE
[Unit]
Description=PharmaPOS FastAPI Backend
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=exec
User=root
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=/etc/pharmapos.env
ExecStart=$APP_DIR/venv/bin/gunicorn main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --access-logfile /var/log/pharmapos/access.log \
    --error-logfile /var/log/pharmapos/error.log \
    --timeout 60
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable pharmapos
systemctl start pharmapos
info "Backend service started."

# ── 12. Nginx config ─────────────────────────────────────────
step "Configuring Nginx..."
cat > /etc/nginx/sites-available/pharmapos <<NGINX
server {
    listen 80;
    server_name $SERVER_NAME;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml text/javascript;

    root $APP_DIR/frontend/dist;
    index index.html;

    location /api/ {
        client_max_body_size 50M;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
NGINX

ln -sf /etc/nginx/sites-available/pharmapos /etc/nginx/sites-enabled/pharmapos
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
info "Nginx configured."

# ── 13. SSH deploy key for GitHub Actions ────────────────────
step "Generating SSH deploy key for GitHub Actions..."
mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [ ! -f /root/.ssh/pharmapos_deploy ]; then
    ssh-keygen -t ed25519 -C "pharmapos-github-actions" -f /root/.ssh/pharmapos_deploy -N ""
    cat /root/.ssh/pharmapos_deploy.pub >> /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
fi

# ── 14. Firewall ─────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    ufw allow 22/tcp   2>/dev/null || true
    ufw allow 80/tcp   2>/dev/null || true
    ufw allow 443/tcp  2>/dev/null || true
    ufw --force enable 2>/dev/null || true
    info "Firewall configured."
fi

# ── Done! ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              ✅  PHARMAPOS IS LIVE!                      ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  Open in browser:  http://%-31s║\n" "$SERVER_NAME"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Default logins:                                         ║"
echo "║    admin / admin123   •   pharmacist1 / pharm123         ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Auto-deploy setup (GitHub Actions):                     ║"
echo "║  Add these 3 secrets to your GitHub repo:                ║"
echo "║    Settings → Secrets → Actions → New secret             ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  VPS_HOST  =  %-43s║\n" "$SERVER_NAME"
printf "║  VPS_USER  =  root%-40s║\n" ""
echo "║  VPS_SSH_KEY = (see private key printed below)           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "══════════ VPS_SSH_KEY (copy everything below) ════════════"
cat /root/.ssh/pharmapos_deploy
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Once secrets are added, every git push → auto-deploys here."
echo ""
