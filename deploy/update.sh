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
git -C "$APP_DIR" checkout -- . 2>/dev/null || true

info "Pulling latest code..."
git -C "$APP_DIR" pull --rebase --autostash || git -C "$APP_DIR" pull

info "Installing Python dependencies..."
source "$APP_DIR/venv/bin/activate"
pip install -q -r "$APP_DIR/backend/requirements.txt" 2>/dev/null || true

info "Applying database schema migrations..."
cd "$APP_DIR/backend"
python init_db.py || true

info "Building frontend..."
cd "$APP_DIR/frontend"
npm install --legacy-peer-deps -q
npm run build

info "Restarting backend service..."
systemctl restart pharmapos
systemctl reload nginx

echo ""
echo "✅ Update complete!"
systemctl status pharmapos --no-pager -l
