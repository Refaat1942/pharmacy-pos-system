# FPS Print Bridge

Small Windows helper that lets the FPS Pharmacy web app print labels **directly** to a
label printer (Xprinter, TSC, … — any printer that understands **TSPL**), with the exact
label size and gap sent in the commands. No Windows paper size, offsets or scaling to set.

- Listens on `http://127.0.0.1:17777` (this PC only).
- Accepts print jobs from `*.fratelanza.com` / localhost only.
- Starts with Windows (HKCU Run key) and adds a desktop shortcut **FPS Labels (offline)**.
- Offline: the web app can save the item list into the bridge
  (`%APPDATA%\FPSPrintBridge\catalog.json`); the offline page prints labels with no internet.

## Install (pharmacy PC)
FPS → Inventory → Barcode labels → **Download FPS Print Bridge** → run the downloaded
`FPS-Print-Bridge.exe` once. Re-open the Barcode labels window: it shows **Print now**.

## Build
The offline page uses the same label renderer as the web app (`frontend/src/lib/tsplLabel.ts`):

```
cd frontend
./node_modules/.bin/esbuild src/offline/bridgePage.ts --bundle --minify --format=iife \
  --target=es2019 --outfile=../tools/fps-print-bridge/web/app.js
cd ../tools/fps-print-bridge
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui -s -w" \
  -o ../../frontend/public/downloads/FPS-Print-Bridge.exe .
```

On Linux/macOS `go run .` works for testing; jobs are appended to `FPS_BRIDGE_DUMP`
(default `fps-bridge-jobs.bin`) instead of a printer.
