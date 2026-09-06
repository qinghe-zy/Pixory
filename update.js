const fs = require('fs');

const files = [
  'docs/index.html',
  'docs/m.html',
  'README.md',
  'docs/sitemap.xml'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/2\.8\.1/g, '2.8.2');
  fs.writeFileSync(file, content);
}
