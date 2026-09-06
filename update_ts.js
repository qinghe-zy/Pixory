const fs = require('fs');
const file = 'src/content/productManualMarkdown.ts';
if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('114MB', '98MB');
  fs.writeFileSync(file, content);
}
