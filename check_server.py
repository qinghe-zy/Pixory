import json
import urllib.request
import re

# Read PET_MODELS from petModels.ts
with open('src/config/petModels.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract zipUrls using regex
# Example: zipUrl: 'https://mist01.com/live2d/live2d-nahida@main.zip'
urls = re.findall(r"zipUrl:\s*'([^']+)'", content)

print(f"Found {len(urls)} model URLs.")

success_count = 0
fail_count = 0

for url in urls:
    req = urllib.request.Request(url, method='HEAD')
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                size = response.getheader('Content-Length')
                size_mb = int(size) / (1024 * 1024) if size else 0
                print(f"[OK] {url.split('/')[-1]} - {size_mb:.2f} MB")
                success_count += 1
            else:
                print(f"[ERROR {response.status}] {url}")
                fail_count += 1
    except Exception as e:
        print(f"[FAILED] {url} - {e}")
        fail_count += 1

print(f"\nVerification complete: {success_count} OK, {fail_count} FAILED.")
