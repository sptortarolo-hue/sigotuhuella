"""
Generate Playwright storage_state.json for Facebook session.

Usage (local machine):
  python generate_session.py

Usage (VPS, when 2FA blocks local session):
  python generate_session.py --2fa
  1. Tene tu celular a mano (el codigo 2FA se envia a tu app de autenticacion)
  2. El script carga la sesion existente, detecta la pantalla 2FA, te pide el codigo
  3. Ingresa el codigo, el script lo completa y guarda la nueva sesion (desde IP del VPS)

Usage (VPS, with VNC):
  apt install xvfb x11vnc
  python generate_session.py --vps

Opens a browser window. Log in to Facebook, then press Enter in the terminal.
The storage_state.json file will be saved in the current directory.
Upload this file via Admin > Facebook > Configuracion > Subir sesion.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

SESSION_PATH = "storage_state.json"
AUTH_PATTERNS = ["two_step_verification", "checkpoint", "login"]
XVFB_PROC = None


def ensure_display():
    """Start Xvfb if no DISPLAY is set, so headed browser works."""
    global XVFB_PROC
    if "DISPLAY" in os.environ and os.environ["DISPLAY"]:
        return
    try:
        display = ":99"
        XVFB_PROC = subprocess.Popen(
            ["Xvfb", display, "-screen", "0", "1280x720x24"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        os.environ["DISPLAY"] = display
        print(f"[Xvfb] Started on display {display}")
    except FileNotFoundError:
        print("[Xvfb] WARNING: Xvfb no instalado. Ejecuta: apt install -y xvfb")
        print("[Xvfb] Se continua en modo headless (sin pantalla)")
    except Exception as e:
        print(f"[Xvfb] Error: {e}")


def run_vps_mode():
    """Run browser with Xvfb virtual display so user can VNC in."""
    ensure_display()
    try:
        vnc = subprocess.Popen(
            ["x11vnc", "-display", os.environ["DISPLAY"], "-forever", "-nopw", "-quiet"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        print("[VNC] x11vnc started on port 5900 (no password)")
        print("[VNC] Connect with VNC viewer to VPS_IP:5900")
        print()
        return vnc
    except FileNotFoundError:
        print("[VNC] WARNING: x11vnc no instalado. Ejecuta: apt install -y x11vnc")
        return None


def detect_auth_page(page):
    """Detect if Facebook is showing an auth/2FA/checkpoint page. Returns True if auth detected."""
    auth_url_patterns = ["two_step", "checkpoint", "review", "confirm", "identify", "/pin/"]
    # Check URL
    url = page.url.lower()
    for p in auth_url_patterns:
        if p in url:
            print(f"  Detectado '{p}' en la URL")
            return True
    # Check DOM for auth/PIN/2FA-related elements
    selectors = [
        "input[name='approvals_code']",
        "input#approvals_code",
        "input[name='code']",
        "input[name='pin']",
        "input#pin",
        "//div[contains(text(),'codigo de autenticacion')]",
        "//div[contains(text(),'authentication code')]",
        "//div[contains(text(),'codigo de inicio de sesion')]",
        "//div[contains(text(),'login code')]",
        "//div[contains(text(),'introduce tu pin')]",
        "//div[contains(text(),'enter your pin')]",
        "//div[contains(text(),'ingresa tu pin')]",
        "//input[contains(@placeholder,'PIN')]",
        "//input[contains(@placeholder,'pin')]",
        "//input[contains(@placeholder,'codigo')]",
    ]
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if el.count() > 0:
                print(f"  Detectado elemento 2FA en DOM: {sel}")
                return True
        except:
            continue
    return False


def handle_2fa(page):
    """Detect if 2FA page is shown and prompt for code."""
    print(f"\nURL actual: {page.url}")
    print("Buscando pagina de autenticacion...")

    # Wait up to 15s for auth redirects
    for i in range(15):
        page.wait_for_timeout(1000)
        if detect_auth_page(page):
            break
        if i == 0 or i == 4 or i == 9 or i == 14:
            print(f"  Esperando... ({i+1}s) URL: {page.url[:100]}")

    if not detect_auth_page(page):
        print("No se detecto pagina de autenticacion. La sesion puede ser valida.")
        return True

    print()
    print("=" * 60)
    print("Facebook pide verificacion (2FA / PIN / checkpoint)")
    print(f"URL: {page.url[:100]}")
    code = input("Ingresa el codigo (2FA o PIN): ").strip()
    print("=" * 60)
    print()
    try:
        input_field = page.locator("input[name='approvals_code'], input#approvals_code, input[name='code'], input[name='pin'], input#pin").first
        input_field.wait_for(timeout=5000)
        input_field.fill(code)
        page.wait_for_timeout(500)
        # Click Continue / Submit
        for btn_sel in [
            "button[type='submit']",
            "//div[@role='button' and contains(text(),'Continue')]",
            "//div[@role='button' and contains(text(),'Continuar')]",
            "//div[@role='button' and contains(text(),'Enviar')]",
            "//div[@role='button' and contains(text(),'Send')]",
        ]:
            try:
                btn = page.locator(btn_sel).first
                if btn.count() > 0:
                    btn.click()
                    break
            except:
                continue
        page.wait_for_timeout(5000)
        if not detect_auth_page(page):
            print("2FA completado correctamente.")
            return True
        print("WARNING: El 2FA no se completo. Revisa el codigo e intenta de nuevo.")
        return False
    except PlaywrightTimeout:
        print("WARNING: No se encontro el campo de codigo 2FA en la pagina.")
        # Print page text for debugging
        try:
            text = page.inner_text("body")[:300]
            print(f"  Texto visible: {text}")
        except:
            pass
        return False


def save_session(context):
    state = context.storage_state()
    with open(SESSION_PATH, "w") as f:
        json.dump(state, f, indent=2)
    cookies_count = len(state.get("cookies", []))
    origins_count = len(state.get("origins", []))
    print(f"\nSesion guardada en {SESSION_PATH}")
    print(f"  Cookies: {cookies_count}")
    print(f"  Origenes con localStorage: {origins_count}")
    if cookies_count == 0:
        print("WARNING: No se encontraron cookies.")


def main():
    twofa_mode = "--2fa" in sys.argv
    vps_mode = "--vps" in sys.argv

    vnc_proc = None
    if vps_mode:
        vnc_proc = run_vps_mode()
    elif twofa_mode:
        ensure_display()

    p = sync_playwright().start()
    browser = p.chromium.launch(headless=not (vps_mode or twofa_mode))

    # Load existing storage_state if present (for 2FA mode)
    storage_path = Path(SESSION_PATH)
    kwargs = {}
    if storage_path.exists():
        kwargs["storage_state"] = str(storage_path)
    context = browser.new_context(**kwargs)
    page = context.new_page()

    page.goto("https://www.facebook.com/", timeout=30000, wait_until="domcontentloaded")

    # Handle 2FA if present (VPS mode)
    if twofa_mode:
        handle_2fa(page)
    else:
        page.wait_for_timeout(3000)

    if not twofa_mode:
        print("=" * 60)
        print("INSTRUCCIONES:")
        print("1. Inicia sesion en Facebook en la ventana que se abrio")
        if vps_mode:
            print("   (conectate con VNC viewer para ver la ventana)")
        print("2. Asegurate de llegar al feed principal (inicio)")
        print("3. Vuelve a esta terminal y presiona ENTER")
        print("=" * 60)
        input()

    # Wait for feed to be ready (up to 40s total)
    for i in range(8):
        if not detect_auth_page(page):
            try:
                page.wait_for_selector(
                    "div[role='feed'], a[aria-label='Home'], div[aria-label='Home']",
                    timeout=5000,
                )
                print("Feed cargado correctamente.")
                break
            except PlaywrightTimeout:
                pass
        print(f"  Esperando feed... ({i+1}/8)")
        page.wait_for_timeout(2000)
    else:
        print(f"URL final: {page.url[:120]}")
        print("WARNING: No se detecto el feed, pero se guarda la sesion igual.")

    save_session(context)
    context.close()
    browser.close()
    p.stop()

    if XVFB_PROC:
        XVFB_PROC.terminate()
        print("[Xvfb] Detenido")
    if vnc_proc:
        vnc_proc.terminate()
        print("[VNC] Detenido")

    print("Listo.")


if __name__ == "__main__":
    main()
