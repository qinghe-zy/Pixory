const fs = require('fs');
let content = fs.readFileSync('src/database/schema.ts', 'utf8');

content = content.replace(
  /export const MIGRATION_STATEMENTS_V65 = \\([^]*?)\\;/g,
  "export const MIGRATION_STATEMENTS_V65 = \\\;"
);

fs.writeFileSync('src/database/schema.ts', content, 'utf8');
