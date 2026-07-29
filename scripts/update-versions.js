const fs = require('fs');
const oldVersion = '2.6.10';
const newVersion = '2.7.1';
const oldVersionCode = '272';
const newVersionCode = '273';

const filesToUpdate = [
  'package.json',
  'app.json',
  'src/services/updateCheckService.ts',
  'src/screens/AboutScreen.tsx',
  'docs/update-version.json',
  'README.md',
  'docs/download.html',
  'docs/updates.html',
  'docs/sitemap.xml',
  'android/app/src/main/res/values/strings.xml',
  'tests/website-flow-policy.test.cjs',
  'android/app/build.gradle'
];

for (const file of filesToUpdate) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(new RegExp(oldVersion.replace(/\./g, '\\.'), 'g'), newVersion);
    
    // Specially handle versionCode in app.json and build.gradle
    if (file === 'app.json' || file === 'android/app/build.gradle') {
        content = content.replace(new RegExp('versionCode ' + oldVersionCode, 'g'), 'versionCode ' + newVersionCode);
        content = content.replace(new RegExp('\"versionCode\": ' + oldVersionCode, 'g'), '\"versionCode\": ' + newVersionCode);
    }
    
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated ' + file);
  } else {
    console.log('Not found: ' + file);
  }
}
