const fs = require('fs');
const files = ['docs/index.html', 'docs/m.html'];
const oldHash = '76ab5ba76ca910d233e67bb82feeebeee592edf183e5611d048065a3bb0e9903';
const newHash = 'a640e0a7b8aa57f79f4584d5e1f8c77c98e1c4748c5a09a00d0072c9ca7604f4';
const oldSize = '96.9MB';
const newSize = '98.1MB';

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(oldHash, newHash);
    content = content.replace(oldSize, newSize);
    fs.writeFileSync(file, content);
  }
}
