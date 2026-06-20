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


def run_vps_mode():
    """Run browser with Xvfb virtual display so user can VNC in."""
    display = ":99"
    xvfb = subprocess.Popen(
        ["Xvfb", display, "-screen", "0", "1280x720x24"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    print(f"[VPS] Xvfb started on display {display}")
    vnc = subprocess.Popen(
        ["x11vnc", "-display", display, "-forever", "-nopw", "-quiet"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    print("[VPS] x11vnc started on port 5900 (no password)")
    print(f"[VPS] Connect with VNC viewer to VPS_IP:5900")
    print()
    os.environ["DISPLAY"] = display
    return xvfb, vnc


def detect_auth_page(page):
    """Detect if Facebook is showing an auth/2FA/checkpoint page. Returns True if auth detected."""
    auth_url_patterns = ["two_step", "checkpoint", "review", "confirm", "identify"]
    # Check URL
    url = page.url.lower()
    for p in auth_url_patterns:
        if p in url:
            print(f"  Detectado '{p}' en la URL")
            return True
    # Check DOM for 2FA-related elements
    selectors = [
        "input[name='approvals_code']",
        "input#approvals_code",
        "input[name='code']",
        "//div[contains(text(),'codigo de autenticacion')]",
        "//div[contains(text(),'authentication code')]",
        "//div[contains(text(),'codigo de inicio de sesion')]",
        "//div[contains(text(),'login code')]",
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
    print("Facebook pide verificacion en dos pasos (2FA)")
    print("Revisa tu app de autenticacion (Google Authenticator, etc.)")
    code = input("Ingresa el codigo 2FA (6 digitos): ").strip()
    print("=" * 60)
    print()
    try:
        input_field = page.locator("input[name='approvals_code'], input#approvals_code, input[name='code']").first
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

    xvfb_proc = vnc_proc = None
    if vps_mode:
        xvfb_proc, vnc_proc = run_vps_mode()

    p = sync_playwright().start()
    browser = p.chromium.launch(headless=not vps_mode)

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

    if xvfb_proc:
        xvfb_proc.terminate()
        vnc_proc.terminate()
        print("[VPS] Xvfb y x11vnc detenidos")

    print("Listo.")


if __name__ == "__main__":
    main()
