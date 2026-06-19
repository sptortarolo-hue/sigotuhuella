"""
Generate Playwright storage_state.json for Facebook session.

Usage:
  python generate_session.py

Opens a browser window. Log in to Facebook, then press Enter in the terminal.
The storage_state.json file will be saved in the current directory.
Upload this file via Admin > Facebook > Configuracion > Subir sesion.
"""
import json
from playwright.sync_api import sync_playwright

SESSION_PATH = "storage_state.json"

def main():
    p = sync_playwright().start()
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()

    page.goto("https://www.facebook.com/")

    print("=" * 60)
    print("INSTRUCCIONES:")
    print("1. Inicia sesion en Facebook en la ventana que se abrio")
    print("2. Asegurate de llegar al feed principal (inicio)")
    print("3. Vuelve a esta terminal y presiona ENTER")
    print("=" * 60)
    input()

    state = context.storage_state()
    with open(SESSION_PATH, "w") as f:
        json.dump(state, f)

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
    print("Listo.")

if __name__ == "__main__":
    main()
