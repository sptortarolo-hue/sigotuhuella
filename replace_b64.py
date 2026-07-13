import base64
with open('external/scraper_v2/scraper.py', 'rb') as f:
    new_b64 = base64.b64encode(f.read()).decode('ascii')
with open('server/routes/facebook.js', 'r', encoding='utf-8') as f:
    content = f.read()
# Find the opening quote position
prefix = "const SCRAPER_SCRIPT_B64 = '"
idx = content.find(prefix)
if idx == -1:
    print('ERROR: prefix not found')
    exit(1)
open_quote = idx + len(prefix) - 1  # position of the opening '
# Find "export default" to determine where the string should end
end_marker = "\nexport default router;"
end_idx = content.find(end_marker, open_quote)
if end_idx == -1:
    print('ERROR: end marker not found')
    exit(1)
# Build new content: everything up to and including the open quote +
# new base64 + closing quote + newline + end marker + rest
rest_after_close = content[end_idx:]  # includes \nexport default...
new_content = content[:open_quote+1] + new_b64 + "';\n" + rest_after_close.lstrip('\n')
with open('server/routes/facebook.js', 'w', encoding='utf-8') as f:
    f.write(new_content)
print(f'OK: replaced with {len(new_b64)} chars')
