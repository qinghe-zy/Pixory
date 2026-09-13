import re

with open("App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(
    r"import \{ SettingsScreen \} from '\./src/screens/SettingsScreen';",
    r"import { SettingsScreen } from './src/screens/SettingsScreen';\nimport { AdvancedSettingsScreen } from './src/screens/AdvancedSettingsScreen';",
    content
)

with open("App.tsx", "w", encoding="utf-8") as f:
    f.write(content)