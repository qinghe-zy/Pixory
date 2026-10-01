const fs = require('fs');
const b64 = fs.readFileSync('assets/ai_system_avatar_128.png').toString('base64');
fs.writeFileSync('src/utils/aiSystemAvatarBase64.ts', 'export const AI_SYSTEM_AVATAR_B64 = "data:image/png;base64,' + b64 + '";\n');
console.log('Base64 generated.');
