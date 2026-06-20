"""
Generate Playwright storage_state.json for Facebook session.

Usage (local machine — recommended):
  python generate_session.py

Usage (VPS — use when 2FA blocks local session):
  # First, install dependencies on VPS:
  apt install xvfb x11vnc
  # Then run:
  python generate_session.py --vps
  # Connect to VPS with VNC viewer (port 5900) and log in to Facebook
  # Return to SSH terminal and press Enter

Opens a browser window. Log in to Facebook, then press Enter in the terminal.
The storage_state.json file will be saved in the current directory.
Upload this file via Admin > Facebook > Configuracion > Subir sesion.
"""
import json
import os
import subprocess
import sys
from playwright.sync_api import sync_playwright

SESSION_PATH = "storage_state.json"


def run_vps_mode():
    """Run browser with Xvfb virtual display so user can VNC in."""
    display = ":99"

    # Start Xvfb
    xvfb = subprocess.Popen(
        ["Xvfb", display, "-screen", "0", "1280x720x24"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    print(f"[VPS] Xvfb started on display {display}")

    # Start x11vnc
    vnc = subprocess.Popen(
        ["x11vnc", "-display", display, "-forever", "-nopw", "-quiet"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    print("[VPS] x11vnc started on port 5900 (no password)")
    print(f"[VPS] Connect with VNC viewer to {os.uname().nodename}:5900")
    print()

    os.environ["DISPLAY"] = display
    return xvfb, vnc


def main():
    vps_mode = "--vps" in sys.argv

    xvfb_proc = vnc_proc = None
    if vps_mode:
        xvfb_proc, vnc_proc = run_vps_mode()

    p = sync_playwright().start()
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()

    page.goto("https://www.facebook.com/")

    print("=" * 60)
    print("INSTRUCCIONES:")
    print("1. Inicia sesion en Facebook en la ventana que se abrio")
    if vps_mode:
        print("   (conectate con VNC viewer para ver la ventana)")
    print("2. Asegurate de llegar al feed principal (inicio)")
    print("3. Vuelve a esta terminal y presiona ENTER")
    print("=" * 60)
    input()

    state = context.storage_state()
    with open(SESSION_PATH, "w") as f:
        json.dump(state, f, indent=2)

    cookies_count = len(state.get("cookies", []))
    origins_count = len(state.get("origins", []))
    print(f"\nSesion guardada en {SESSION_PATH}")
    print(f"  Cookies: {cookies_count}")
    print(f"  Origenes con localStorage: {origins_count}")

    if cookies_count == 0:
        print("WARNING: No se encontraron cookies. Asegurate de haber iniciado sesion.")

    context.close()
    browser.close()
    p.stop()

    if xvfb_proc:
        xvfb_proc.terminate()
        vnc_proc.terminate()
        print("[VPS] Xvfb y x11vnc detenidos")

    print("Listo.")


if __name__ == "__main__":
    main()
