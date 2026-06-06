#!/usr/bin/env python3
"""Render the bilingual Arabic POS customer demo video.

The script uses the checked-in HTML slide deck, headless Chrome for screenshots,
and ffmpeg for the final MP4. It intentionally uses only local tooling.
"""

from __future__ import annotations

import argparse
import os
import pathlib
import signal
import shutil
import subprocess
import sys
import tempfile
import time


ROOT = pathlib.Path(__file__).resolve().parent
SLIDES_HTML = ROOT / "slides.html"
FRAMES_DIR = ROOT / "frames"
OUTPUT = ROOT / "pos_customer_demo_ar_en.mp4"
SLIDE_COUNT = 15
SECONDS_PER_SLIDE = 7
WIDTH = 1280
HEIGHT = 720


def run(cmd: list[str], timeout: int | None = None) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True, timeout=timeout)


def chrome_screenshot(cmd: list[str], out: pathlib.Path) -> None:
    """Capture a screenshot, then stop Chrome after the PNG is fully written."""
    print("+", " ".join(cmd))
    proc = subprocess.Popen(cmd, start_new_session=True)
    deadline = time.monotonic() + 45
    last_size = -1
    stable_count = 0
    try:
        while time.monotonic() < deadline:
            if out.exists():
                size = out.stat().st_size
                if size > 0 and size == last_size:
                    stable_count += 1
                    if stable_count >= 3:
                        return
                else:
                    stable_count = 0
                    last_size = size
            if proc.poll() is not None:
                if proc.returncode != 0:
                    raise subprocess.CalledProcessError(proc.returncode, cmd)
                if out.exists() and out.stat().st_size > 0:
                    return
            time.sleep(0.25)
        raise TimeoutError(f"Timed out waiting for screenshot: {out}")
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)


def find_chrome() -> str:
    for name in ("google-chrome", "chromium", "chromium-browser"):
      path = shutil.which(name)
      if path:
          return path
    raise SystemExit("Chrome or Chromium is required to render screenshots.")


def find_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise SystemExit("ffmpeg is required to generate the video.")
    return path


def render_frames(chrome: str) -> None:
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    for old in FRAMES_DIR.glob("slide_*.png"):
        old.unlink()

    base_url = SLIDES_HTML.resolve().as_uri()
    for idx in range(SLIDE_COUNT):
        out = FRAMES_DIR / f"slide_{idx:02d}.png"
        url = f"{base_url}?slide={idx}"
        with tempfile.TemporaryDirectory(prefix=f"pos-demo-chrome-{idx:02d}-") as user_data_dir:
            chrome_screenshot([
                chrome,
                "--headless=new",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-background-networking",
                "--disable-sync",
                "--hide-scrollbars",
                f"--user-data-dir={user_data_dir}",
                f"--window-size={WIDTH},{HEIGHT}",
                f"--screenshot={out}",
                url,
            ], out)


def write_concat_file() -> pathlib.Path:
    concat = FRAMES_DIR / "concat.txt"
    lines: list[str] = []
    for idx in range(SLIDE_COUNT):
        frame = (FRAMES_DIR / f"slide_{idx:02d}.png").resolve()
        lines.append(f"file '{frame}'")
        lines.append(f"duration {SECONDS_PER_SLIDE}")
    lines.append(f"file '{(FRAMES_DIR / f'slide_{SLIDE_COUNT - 1:02d}.png').resolve()}'")
    concat.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return concat


def render_video(ffmpeg: str, concat: pathlib.Path) -> None:
    if OUTPUT.exists():
        OUTPUT.unlink()
    run([
        ffmpeg,
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat),
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-shortest",
        "-vf",
        "fps=30,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        str(OUTPUT),
    ])


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the Arabic/English POS customer demo MP4.")
    parser.add_argument("--frames-only", action="store_true", help="Render PNG frames without creating the MP4.")
    args = parser.parse_args()

    if not SLIDES_HTML.exists():
        raise SystemExit(f"Missing slide deck: {SLIDES_HTML}")

    chrome = find_chrome()
    ffmpeg = find_ffmpeg()
    render_frames(chrome)
    if not args.frames_only:
        render_video(ffmpeg, write_concat_file())
        print(f"Generated {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
