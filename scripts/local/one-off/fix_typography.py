import re

def fix_typography(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    content = content.replace("...typography.body,", "...typography.textStyles.body,")
    content = content.replace("...typography.caption,", "...typography.textStyles.caption,")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

fix_typography("src/screens/AdvancedSettingsScreen.tsx")
fix_typography("src/screens/SettingsScreen.tsx")