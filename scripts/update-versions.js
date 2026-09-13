const fs = require('fs');

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node update-versions.js <oldVersion> <newVersion>');
  console.error('Example: node update-versions.js 2.8.5 2.8.6');
  process.exit(1);
}

const oldVersion = args[0];
const newVersion = args[1];

function getVersionCode(version) {
  // e.g. "2.8.6" -> 286, or "2.10.1" -> 2101
  return version.replace(/\./g, '');
}

const oldVersionCode = getVersionCode(oldVersion);
const newVersionCode = getVersionCode(newVersion);

const filesToUpdate = [
  'package.json',
  'app.json',
  'src/services/updateCheckService.ts',
  'src/screens/AboutScreen.tsx',
  'docs/update-version.json',
  'README.md',
  'docs/index.html',
  'docs/updates.html',
  'docs/sitemap.xml',
  'docs/manual.html',
  'android/app/src/main/res/values/strings.xml',
  'tests/website-flow-policy.test.cjs',
  'android/app/build.gradle'
];

for (const file of filesToUpdate) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace standard version string globally
    content = content.replace(new RegExp(oldVersion.replace(/\./g, '\\\\.'), 'g'), newVersion);
    
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
console.log(Successfully bumped from  to  (Code  -> ));

