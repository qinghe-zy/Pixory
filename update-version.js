const fs = require('fs');
const files = [
  'package.json',
  'app.json',
  'src/services/updateCheckService.ts',
  'docs/update-version.json',
  'README.md',
  'docs/download.html',
  'docs/updates.html',
  'docs/sitemap.xml',
  'android/app/build.gradle'
];
const oldVer = '2.5.4';
const newVer = '2.5.5';
const oldCode = '254';
const newCode = '255';

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(new RegExp(oldVer.replace(/\./g, '\\.'), 'g'), newVer);
    if (file === 'app.json' || file === 'src/services/updateCheckService.ts' || file === 'android/app/build.gradle') {
      content = content.replace(new RegExp(oldCode, 'g'), newCode);
    }
    fs.writeFileSync(file, content);
    console.log('Updated ' + file);
  }
});
