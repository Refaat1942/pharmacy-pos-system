# POS Demo Video — pharmacy code `test`

Record a full Arabic POS walkthrough (no superadmin) for customer demos.

## Prerequisites

1. PostgreSQL running with `PGPASSWORD=postgres`
2. Backend: `cd backend && uvicorn main:app --host 127.0.0.1 --port 8000`
3. Frontend: `cd frontend && npm run dev`

## Setup demo tenant

```bash
export PGPASSWORD=postgres
python3 scripts/setup_demo_tenant_test.py
```

| Field | Value |
|---|---|
| Pharmacy code | `test` |
| Display name | `test` |
| Admin | `admin` / `test123` |
| Cashier | `cashier1` / `cash123` |

## Bilingual narration script

Full scene-by-scene script (Arabic + English, ~38 min):

`docs/POS_CUSTOMER_DEMO_VIDEO_TEST.md`

## Automated screen recording

```bash
cd scripts
npm install
npx playwright install chromium
node record_pos_demo.mjs
```

Output:
- `scripts/output/test_pos_demo.webm`
- Convert to MP4: `ffmpeg -i scripts/output/test_pos_demo.webm -c:v libx264 scripts/output/test_pos_demo.mp4`

Set `DEMO_PAUSE_MS=4000` for longer pauses per screen. Set `DEMO_URL` if not using `http://localhost:5000`.

## Manual recording tips

1. Switch UI to **عربي** before recording
2. Use pharmacy code **test** only — no other customer names on screen
3. Do **not** open `/platform` (superadmin)
4. Follow scenes in `docs/POS_CUSTOMER_DEMO_VIDEO_TEST.md`
5. Open a cash shift before POS demos; close with Z report at the end
