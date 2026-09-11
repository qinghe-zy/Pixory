import re

with open('src/screens/AllImagesScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract from `const expandedHeaderHeight` to end of `animatedOverlay`
match = re.search(r'(  const expandedHeaderHeight =.*?\n  \);\n\n  const animatedOverlay = .*?\n  \);\n)', content, flags=re.DOTALL)
if match:
    overlay_code = match.group(1)
    # Remove it
    content = content.replace(overlay_code, '')
    # Insert it right before `return (`
    content = content.replace('  return (\n    <View style={styles.host}', overlay_code + '\n  return (\n    <View style={styles.host}')

with open('src/screens/AllImagesScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
