import re
import glob

# Files to revert
files = [
    'package.json',
    'app.json',
    'src/services/updateCheckService.ts',
    'README.md',
    'android/app/src/main/res/values/strings.xml',
    'docs/update-version.json',
    'docs/download.html',
    'docs/updates.html'
]

for fpath in files:
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # We replace 2.6.2 with 2.6.1
        content = content.replace('2.6.2', '2.6.1')
        
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Reverted {fpath}")
    except Exception as e:
        print(f"Skipped {fpath}: {e}")

print("Reversion to 2.6.1 complete.")
