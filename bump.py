import os, json, re

VERSION = '2.8.3'

# package.json
with open('package.json', 'r', encoding='utf-8') as f: data = json.load(f)
data['version'] = VERSION
with open('package.json', 'w', encoding='utf-8') as f: json.dump(data, f, indent=2)

# app.json
with open('app.json', 'r', encoding='utf-8') as f: data = json.load(f)
data['expo']['version'] = VERSION
data['expo']['runtimeVersion'] = VERSION
with open('app.json', 'w', encoding='utf-8') as f: json.dump(data, f, indent=2)

# updateCheckService.ts
with open('src/services/updateCheckService.ts', 'r', encoding='utf-8') as f: content = f.read()
content = re.sub(r'const CURRENT_VERSION = \'[0-9\.]+\';', f'const CURRENT_VERSION = \'{VERSION}\';', content)
with open('src/services/updateCheckService.ts', 'w', encoding='utf-8') as f: f.write(content)

# AboutScreen.tsx
with open('src/screens/AboutScreen.tsx', 'r', encoding='utf-8') as f: content = f.read()
content = re.sub(r'Version [0-9\.]+', f'Version {VERSION}', content)
with open('src/screens/AboutScreen.tsx', 'w', encoding='utf-8') as f: f.write(content)

# docs/update-version.json
with open('docs/update-version.json', 'r', encoding='utf-8') as f: data = json.load(f)
data['latestVersion'] = VERSION
data['downloadUrl'] = f'https://mist01.com/downloads/Pixory-v{VERSION}.apk'
data['releaseNotes'] = '修复了 Android 端因 expo-keep-awake 原生模块版本过高导致的启动闪退问题。'
with open('docs/update-version.json', 'w', encoding='utf-8') as f: json.dump(data, f, indent=2, ensure_ascii=False)

# README.md
with open('README.md', 'r', encoding='utf-8') as f: content = f.read()
content = re.sub(r'\[v[0-9\.]+\]', f'[v{VERSION}]', content)
content = re.sub(r'当前版本：v[0-9\.]+', f'当前版本：v{VERSION}', content)
content = re.sub(r'Pixory-v[0-9\.]+\.apk', f'Pixory-v{VERSION}.apk', content)
with open('README.md', 'w', encoding='utf-8') as f: f.write(content)

# android/app/build.gradle
with open('android/app/build.gradle', 'r', encoding='utf-8') as f: content = f.read()
content = re.sub(r'versionName \"[0-9\.]+\"', f'versionName \"{VERSION}\"', content)
content = re.sub(r'outputFileName = \"Pixory-v[0-9\.]+\.apk\"', f'outputFileName = \"Pixory-v{VERSION}.apk\"', content)
with open('android/app/build.gradle', 'w', encoding='utf-8') as f: f.write(content)

# android/app/src/main/res/values/strings.xml
with open('android/app/src/main/res/values/strings.xml', 'r', encoding='utf-8') as f: content = f.read()
content = re.sub(r'<string name=\"expo_runtime_version\">[0-9\.]+</string>', f'<string name=\"expo_runtime_version\">{VERSION}</string>', content)
with open('android/app/src/main/res/values/strings.xml', 'w', encoding='utf-8') as f: f.write(content)

# m.html, index.html
for file in ['docs/m.html', 'docs/index.html']:
    with open(file, 'r', encoding='utf-8') as f: content = f.read()
    content = re.sub(r'Pixory-v[0-9\.]+\.apk', f'Pixory-v{VERSION}.apk', content)
    content = re.sub(r'当前版本：[0-9\.]+', f'当前版本：{VERSION}', content)
    with open(file, 'w', encoding='utf-8') as f: f.write(content)

# announcement.json
with open('docs/announcement.json', 'r', encoding='utf-8') as f: data = json.load(f)
data['title'] = f'Pixory v{VERSION} 紧急修复'
data['content'] = '修复了 2.8.2 及 2.8.1 版本中因 expo-keep-awake 原生模块版本过高（SDK 57）导致的 Android 启动闪退问题 (AnyTypeCache ClassNotFound)。'
data['version'] = VERSION
with open('docs/announcement.json', 'w', encoding='utf-8') as f: json.dump(data, f, indent=2, ensure_ascii=False)
