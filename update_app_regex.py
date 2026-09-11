import re

with open("App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(
    r"onOpenPasswordSecurity=\{\(\) => pushRoute\(\{ name: '([a-zA-Z0-9\-]+)'(?:, space: currentRoute\.space)? \}\)\}\s*/>",
    r"onOpenPasswordSecurity={() => pushRoute({ name: '\1' })}\n          onOpenAdvancedSettings={() => pushRoute({ name: 'advanced-settings', space: currentRoute.space })}\n        />",
    content
)

content = re.sub(
    r"\} else if \(currentRoute\.name === 'settings'\) \{",
    r"} else if (currentRoute.name === 'advanced-settings') {\n      content = <AdvancedSettingsScreen space={currentRoute.space} onBack={popRoute} />;\n    } else if (currentRoute.name === 'settings') {",
    content
)

with open("App.tsx", "w", encoding="utf-8") as f:
    f.write(content)