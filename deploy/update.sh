#!/bin/bash
# ============================================================
#  PharmaPOS — Update Script (run on VPS to apply code changes)
#  Usage: bash update.sh
# ============================================================
set -e

APP_DIR="/opt/pharmapos"
GREEN='\033[0;32m'; NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC}  $1"; }

info "Cleaning stale build artifacts before pull..."
rm -rf "$APP_DIR/frontend/dist"

# After harden.sh, $APP_DIR is owned by the 'pharmapos' user, not root.
# Whitelist it so git doesn't refuse with "dubious ownership".
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

git -C "$APP_DIR" checkout -- . 2>/dev/null || true

info "Pulling latest code..."
git -C "$APP_DIR" pull --rebase --autostash || git -C "$APP_DIR" pull

info "Deployed commit: $(git -C "$APP_DIR" rev-parse --short HEAD) — $(git -C "$APP_DIR" log -1 --pretty=%s)"

# Restore ownership in case git/npm/pip wrote files as root.
chown -R pharmapos:pharmapos "$APP_DIR" 2>/dev/null || true

info "Installing Python dependencies..."
source "$APP_DIR/venv/bin/activate"
pip install -q -r "$APP_DIR/backend/requirements.txt" 2>/dev/null || true

info "Applying database schema migrations..."
cd "$APP_DIR/backend"
python init_db.py

info "Building frontend..."
cd "$APP_DIR/frontend"
npm install --legacy-peer-deps -q
npm run build

if [ -f "$APP_DIR/frontend/dist/index.html" ]; then
  DEPLOY_REV="$(git -C "$APP_DIR" rev-parse --short HEAD)"
  echo "$DEPLOY_REV" > "$APP_DIR/frontend/dist/build.txt"
  info "Frontend bundle: $(grep -o 'index-[^.]*\\.js' "$APP_DIR/frontend/dist/index.html" | head -1 || echo 'unknown') (verify: /build.txt → $DEPLOY_REV)"
else
  echo "ERROR: frontend/dist/index.html missing — build failed?" >&2
  exit 1
fi

info "Restarting backend service..."
if [ -f "$APP_DIR/deploy/pharmapos.service" ]; then
  cp "$APP_DIR/deploy/pharmapos.service" /etc/systemd/system/pharmapos.service
  systemctl daemon-reload
fi
if [ -f "$APP_DIR/deploy/nginx-pharmapos-security.conf" ] && [ -d /etc/nginx/snippets ]; then
  cp "$APP_DIR/deploy/nginx-pharmapos-security.conf" /etc/nginx/snippets/pharmapos-security.conf
fi
NGINX_SITE=/etc/nginx/sites-available/pharmapos
if [ -f "$NGINX_SITE" ]; then
  sed -i 's/proxy_read_timeout 90;/proxy_read_timeout 300;/g' "$NGINX_SITE"
  sed -i 's/proxy_read_timeout 90/proxy_read_timeout 300/g' "$NGINX_SITE"
  if ! grep -q 'client_max_body_size 50M' "$NGINX_SITE"; then
    sed -i '/location \/api\//,/proxy_pass/ {
      /proxy_pass/i\        client_max_body_size 50M;\
        proxy_connect_timeout 300;\
        proxy_send_timeout 300;
    }' "$NGINX_SITE" 2>/dev/null || true
  fi
  nginx -t && systemctl reload nginx || echo "WARN: nginx config test failed — check $NGINX_SITE manually"
fi
systemctl restart pharmapos
systemctl reload nginx 2>/dev/null || true

echo ""
echo "✅ Update complete!"
systemctl status pharmapos --no-pager -l
