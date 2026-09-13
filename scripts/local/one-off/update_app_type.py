import re

with open("App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(
    r"\| \{ name: 'settings'; space: PixorySpace \}",
    r"| { name: 'settings'; space: PixorySpace }\n  | { name: 'advanced-settings'; space: PixorySpace }",
    content
)

with open("App.tsx", "w", encoding="utf-8") as f:
    f.write(content)