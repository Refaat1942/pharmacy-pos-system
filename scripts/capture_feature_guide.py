#!/usr/bin/env python3
"""Capture annotated screenshots for new barcode/PO/receipt features."""
from __future__ import annotations

import json
import math
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
OUT = Path("/opt/cursor/artifacts/screenshots")
OUT.mkdir(parents=True, exist_ok=True)


def login_payload() -> dict:
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/auth/login",
        data=json.dumps(
            {"tenant_slug": "fratelanza", "username": "admin", "password": "admin123"}
        ).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def inject_auth(page, data: dict) -> None:
    page.goto(f"{BASE}/login")
    page.evaluate(
        """(d) => {
          localStorage.setItem('pharma_token', d.token);
          localStorage.setItem('pharma_user', JSON.stringify(d.user));
          localStorage.setItem('pharma_tenant', JSON.stringify(d.tenant));
          localStorage.removeItem('pharma_locked');
        }""",
        data,
    )


def font(size: int = 16):
    for name in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        p = Path(name)
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def arrow(draw: ImageDraw.ImageDraw, x1, y1, x2, y2, color="#E11D48", width=4):
    draw.line((x1, y1, x2, y2), fill=color, width=width)
    ang = math.atan2(y2 - y1, x2 - x1)
    L = 14
    for a in (2.6, -2.6):
        ax = x2 + L * math.cos(ang + a)
        ay = y2 + L * math.sin(ang + a)
        draw.line((x2, y2, ax, ay), fill=color, width=width)


def label(draw, x, y, text, color="#E11D48"):
    f = font(15)
    pad = 6
    bbox = draw.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.rounded_rectangle(
        (x, y, x + tw + pad * 2, y + th + pad * 2),
        radius=6,
        fill="white",
        outline=color,
        width=2,
    )
    draw.text((x + pad, y + pad), text, fill=color, font=f)


def annotate(path: Path, specs: list[tuple]) -> Path:
    """specs: list of (arrow_x1,y1,x2,y2, label_x, label_y, label_text)"""
    img = Image.open(path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x1, y1, x2, y2, lx, ly, txt in specs:
        arrow(draw, x1, y1, x2, y2)
        label(draw, lx, ly, txt)
    out = path.with_name(path.stem + "-annotated.png")
    Image.alpha_composite(img, overlay).convert("RGB").save(out, quality=92)
    return out


def main():
    data = login_payload()
    raw: dict[str, Path] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        inject_auth(page, data)

        # 1 — Inventory tabs
        page.goto(f"{BASE}/inventory")
        page.wait_for_timeout(1200)
        p1 = OUT / "inventory-barcode-labels-tab.png"
        page.screenshot(path=str(p1), full_page=False)
        raw["tab"] = p1

        # 2 — Barcode Labels tab
        page.locator("div.flex.gap-2.mb-6 button", has_text="Barcode Labels").click()
        page.wait_for_timeout(800)
        p2 = OUT / "inventory-barcode-labels-panel.png"
        page.screenshot(path=str(p2), full_page=False)
        raw["panel"] = p2

        # 3 — Items tab + checkbox + button
        page.locator("div.flex.gap-2.mb-6 button", has_text="Items").click()
        page.wait_for_timeout(500)
        page.get_by_label("Show all items").check()
        page.wait_for_timeout(2000)
        rows = page.locator("tbody tr input[type=checkbox]")
        if rows.count() > 0:
            rows.first.check()
        page.wait_for_timeout(400)
        p3 = OUT / "inventory-items-barcode-btn.png"
        page.screenshot(path=str(p3), full_page=False)
        raw["items_btn"] = p3

        # 4 — Print dialog from Items tab (reliable item selection)
        page.locator("div.flex.gap-2.mb-6 button", has_text="Items").click()
        page.wait_for_timeout(500)
        page.get_by_label("Show all items").check()
        page.wait_for_timeout(2500)
        for i in range(min(20, page.locator("tbody tr").count())):
            row = page.locator("tbody tr").nth(i)
            bc = row.locator("td").nth(1).inner_text()
            if bc and bc.strip() != "—":
                row.locator('input[type="checkbox"]').check()
                break
        page.wait_for_timeout(400)
        page.locator("button", has_text="Barcode labels").filter(
            has=page.locator("svg")
        ).last.click()
        page.wait_for_timeout(1000)
        p4 = OUT / "barcode-print-dialog.png"
        page.screenshot(path=str(p4), full_page=False)
        raw["dialog"] = p4
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # 5 — Settings pharmacy
        page.goto(f"{BASE}/settings")
        page.wait_for_timeout(1000)
        page.get_by_role("button", name="Pharmacy").click()
        page.wait_for_timeout(1200)
        p5 = OUT / "settings-pharmacy-labels.png"
        page.screenshot(path=str(p5), full_page=True)
        raw["settings"] = p5

        # 6 — Purchases new PO
        page.goto(f"{BASE}/purchases")
        page.wait_for_timeout(1200)
        page.get_by_role("button", name="New PO").click()
        page.wait_for_timeout(1000)
        p6 = OUT / "purchases-save-receive.png"
        page.screenshot(path=str(p6), full_page=False)
        raw["purchases"] = p6

        browser.close()

    # Annotations tuned for 1440x900 viewport (full_page settings may differ)
    annotate(
        raw["tab"],
        [
            (520, 130, 380, 168, 530, 95, "NEW: Barcode Labels tab"),
        ],
    )
    annotate(
        raw["panel"],
        [
            (200, 280, 350, 220, 40, 175, "Help: thermal 38mm + PO link"),
            (700, 360, 620, 340, 720, 300, "Search products"),
            (1280, 360, 1180, 340, 1050, 300, "Print button"),
        ],
    )
    annotate(
        raw["items_btn"],
        [
            (1180, 295, 1080, 310, 900, 250, "Barcode labels button"),
            (80, 420, 55, 395, 20, 350, "Select items first"),
        ],
    )
    annotate(
        raw["dialog"],
        [
            (520, 255, 480, 280, 300, 210, "Thermal 38mm (default)"),
            (900, 330, 850, 350, 920, 280, "Pharmacy name on label"),
            (520, 200, 500, 230, 250, 165, "Thermal hint banner"),
            (1050, 330, 1000, 350, 1060, 280, "Show expiry"),
        ],
    )
    settings_img = Image.open(raw["settings"])
    sh = settings_img.height
    annotate(
        raw["settings"],
        [
            (400, int(sh * 0.22), 500, int(sh * 0.20), 520, int(sh * 0.16), "Pharmacy name (AR/EN)"),
            (900, int(sh * 0.55), 850, int(sh * 0.52), 920, int(sh * 0.48), "Name on barcode labels"),
            (500, int(sh * 0.55), 450, int(sh * 0.52), 200, int(sh * 0.48), "Name on receipt"),
        ],
    )
    annotate(
        raw["purchases"],
        [
            (700, 200, 650, 230, 720, 155, "Stock update hint"),
            (1180, 850, 1050, 830, 900, 780, "Save & Receive = stock IN"),
            (950, 850, 900, 830, 700, 780, "Draft = no stock change"),
        ],
    )

    print("Saved annotated screenshots:")
    for name in [
        "inventory-barcode-labels-tab-annotated.png",
        "inventory-barcode-labels-panel-annotated.png",
        "inventory-items-barcode-btn-annotated.png",
        "barcode-print-dialog-annotated.png",
        "settings-pharmacy-labels-annotated.png",
        "purchases-save-receive-annotated.png",
    ]:
        p = OUT / name
        print(f"  {p} ({p.stat().st_size // 1024} KB)" if p.exists() else f"  MISSING {p}")


if __name__ == "__main__":
    main()
