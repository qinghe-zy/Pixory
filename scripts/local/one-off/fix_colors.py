import re

path = 'src/components/ai/Live2DPetManagerModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("aiLightColors.background", "aiLightColors.canvas")
content = content.replace("aiLightColors.border", "aiLightColors.muted")
content = content.replace("aiLightColors.textSecondary", "aiLightColors.muted")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed colors.")
