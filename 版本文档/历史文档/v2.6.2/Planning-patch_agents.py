import re

with open('AGENTS.md', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "- Expo `runtimeVersion` and Android `expo_runtime_version`",
    "- Expo `runtimeVersion` and Android `expo_runtime_version` (CRITICAL: Update `<string name=\"expo_runtime_version\">` in `android/app/src/main/res/values/strings.xml`)"
)

content = content.replace(
    "- `.\\gradlew.bat assembleRelease`",
    "- CRITICAL: MUST run `.\\gradlew.bat clean` first to avoid old JS bundles and cached `app.json` being bundled into the new APK, which causes OTA downgrade loops.\n     - `.\\gradlew.bat assembleRelease`"
)

with open('AGENTS.md', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated AGENTS.md")
