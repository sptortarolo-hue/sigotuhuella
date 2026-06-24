import requests

urls = [
    "https://m.facebook.com/groups/5626757847352252/",
    "https://m.facebook.com/",
    "https://facebook.com/",
]

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}

for url in urls:
    try:
        r = requests.get(url, headers=headers, timeout=15)
        print(f"[{r.status_code}] {url}  ({len(r.text)} bytes)")
        if "login" in r.text.lower()[:2000]:
            print("  → Pide login (grupo privado o necesita cookies)")
    except Exception as e:
        print(f"[ERR] {url}: {e}")
