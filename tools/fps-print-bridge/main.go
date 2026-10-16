// FPS Print Bridge — sends label printer commands (TSPL) from the FPS Pharmacy
// web app straight to a Windows printer, bypassing the driver's page settings.
//
// The browser cannot write raw bytes to a USB printer, so this tiny helper listens
// on 127.0.0.1:17777 and forwards the data to the Windows spooler as a RAW job.
//
//	GET  /status   → {"ok":true,"version":"…","printers":[…],"default":"…"}
//	POST /print    {"printer":"Xprinter XP-246B","data":"<base64>"} → {"ok":true}
//	POST /catalog  item list pushed by the web app while online (for offline use)
//	GET  /catalog  that saved list
//	GET  /         offline label page (works with no internet)
//
// Cross-site requests are only accepted from the FPS web app (Origin
// *.fratelanza.com or localhost). On first run it registers itself to start with
// Windows (HKCU Run key) and puts an "FPS Labels (offline)" shortcut on the desktop.
//
// Build (from Linux or Windows):
//
//	GOOS=windows GOARCH=amd64 go build -ldflags "-H windowsgui -s -w" -o FPS-Print-Bridge.exe
package main

import (
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFS embed.FS

const (
	version = "1.0.0"
	listen  = "127.0.0.1:17777"
	maxJob  = 8 << 20  // 8 MB per print job
	maxCat  = 64 << 20 // item list for offline printing
)

var catMu sync.Mutex

func dataDir() string {
	base, err := os.UserConfigDir() // %APPDATA% on Windows
	if err != nil {
		base = "."
	}
	d := filepath.Join(base, "FPSPrintBridge")
	_ = os.MkdirAll(d, 0o755)
	return d
}

func originAllowed(origin string) bool {
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	h := strings.ToLower(u.Hostname())
	if h == "localhost" || h == "127.0.0.1" {
		return true
	}
	if h == "fratelanza.com" || strings.HasSuffix(h, ".fratelanza.com") {
		return true
	}
	for _, extra := range strings.Split(os.Getenv("FPS_BRIDGE_ORIGINS"), ",") {
		if e := strings.TrimSpace(strings.ToLower(extra)); e != "" && (h == e || strings.HasSuffix(h, "."+e)) {
			return true
		}
	}
	return false
}

// cors applies CORS + Private Network Access headers. Returns false when the
// request must not be served.
func cors(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	// Same-origin page (the offline page served by this bridge) or a non-browser client.
	if origin == "" || origin == "http://"+listen || origin == "http://localhost:17777" {
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return false
		}
		return true
	}
	if !originAllowed(origin) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		return false
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", origin)
	h.Set("Vary", "Origin")
	h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Content-Type")
	// Chrome Private Network Access: an https site calling 127.0.0.1.
	h.Set("Access-Control-Allow-Private-Network", "true")
	h.Set("Access-Control-Max-Age", "600")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	if !cors(w, r) {
		return
	}
	printers, err := listPrinters()
	resp := map[string]any{"ok": err == nil, "version": version, "printers": printers, "default": defaultPrinter()}
	if err != nil {
		resp["error"] = err.Error()
	}
	writeJSON(w, http.StatusOK, resp)
}

type printReq struct {
	Printer string `json:"printer"`
	Data    string `json:"data"`
	Name    string `json:"name"`
}

func handlePrint(w http.ResponseWriter, r *http.Request) {
	if !cors(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "POST only"})
		return
	}
	var req printReq
	if err := json.NewDecoder(io.LimitReader(r.Body, maxJob*2)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "bad json"})
		return
	}
	data, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil || len(data) == 0 || len(data) > maxJob {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "bad data"})
		return
	}
	printer := strings.TrimSpace(req.Printer)
	if printer == "" {
		printer = defaultPrinter()
	}
	if printer == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "no printer"})
		return
	}
	name := req.Name
	if name == "" {
		name = "FPS labels"
	}
	if err := rawPrint(printer, name, data); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "printer": printer, "bytes": len(data)})
}

func handleCatalog(w http.ResponseWriter, r *http.Request) {
	if !cors(w, r) {
		return
	}
	path := filepath.Join(dataDir(), "catalog.json")
	catMu.Lock()
	defer catMu.Unlock()
	switch r.Method {
	case http.MethodGet:
		b, err := os.ReadFile(path)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"items": []any{}, "savedAt": nil})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(b)
	case http.MethodPost:
		b, err := io.ReadAll(io.LimitReader(r.Body, maxCat))
		if err != nil || !json.Valid(b) {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "bad json"})
			return
		}
		tmp := path + ".tmp"
		if err := os.WriteFile(tmp, b, 0o644); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		_ = os.Rename(tmp, path)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "bytes": len(b)})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false})
	}
}

// createDesktopShortcut drops an internet shortcut to the offline label page.
func createDesktopShortcut() {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	for _, desk := range []string{filepath.Join(home, "Desktop"), filepath.Join(home, "OneDrive", "Desktop")} {
		if st, err := os.Stat(desk); err == nil && st.IsDir() {
			p := filepath.Join(desk, "FPS Labels (offline).url")
			if _, err := os.Stat(p); err == nil {
				return
			}
			_ = os.WriteFile(p, []byte("[InternetShortcut]\r\nURL=http://"+listen+"/\r\n"), 0o644)
			return
		}
	}
}

// registerAutostart makes the bridge start with Windows for this user.
func registerAutostart() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	_ = exec.Command("reg", "add", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
		"/v", "FPSPrintBridge", "/t", "REG_SZ", "/d", `"`+exe+`"`, "/f").Run()
}

func main() {
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		// Already running (port taken) — nothing to do.
		fmt.Fprintln(os.Stderr, "FPS Print Bridge already running:", err)
		return
	}
	registerAutostart()
	createDesktopShortcut()
	mux := http.NewServeMux()
	mux.HandleFunc("/status", handleStatus)
	mux.HandleFunc("/print", handlePrint)
	mux.HandleFunc("/catalog", handleCatalog)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name == "" {
			name = "index.html"
		}
		b, err := webFS.ReadFile("web/" + name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		switch {
		case strings.HasSuffix(name, ".html"):
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		case strings.HasSuffix(name, ".js"):
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		}
		_, _ = w.Write(b)
	})
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, err)
	}
}
