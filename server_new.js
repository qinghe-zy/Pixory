const http = require('http');
const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');

const PORT = 3001;
const COUNTER_FILE = path.join(__dirname, 'counter.txt');

// 专属的高阶防伪私钥 (只存活在服务器，千万不可泄露到客户端)
const SECRET_KEY_BASE64 = 'gnlyWOdAXkyEPkHHu1tDk5va01Lm2ALWcl/6I/OOuA1ytqLXzwxDrbwYTFJWM6FAa8Z0S46LAiS0wUKvC1x+nA==';
const secretKey = Buffer.from(SECRET_KEY_BASE64, 'base64');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.url === '/api/get_id') {
    try {
      let counter = 0;
      if (fs.existsSync(COUNTER_FILE)) {
        counter = parseInt(fs.readFileSync(COUNTER_FILE, 'utf8')) || 0;
      }
      counter += 1;
      fs.writeFileSync(COUNTER_FILE, counter.toString(), 'utf8');

      const num = counter % 1000;
      let alpha_val = Math.floor(counter / 1000);
      
      const c3 = String.fromCharCode(65 + (alpha_val % 26));
      alpha_val = Math.floor(alpha_val / 26);
      const c2 = String.fromCharCode(65 + (alpha_val % 26));
      alpha_val = Math.floor(alpha_val / 26);
      const c1 = String.fromCharCode(65 + (alpha_val % 26));

      const formattedNum = num.toString().padStart(3, '0');
      const new_id = `${c1}${c2}${c3}-${formattedNum}`;

      // 使用 nacl.sign 给 raw 盖章
      const message = Buffer.from(counter.toString(), 'utf8');
      const signatureUint8 = nacl.sign.detached(message, secretKey);
      const signatureBase64 = Buffer.from(signatureUint8).toString('base64');

      res.writeHead(200);
      res.end(JSON.stringify({ 
        success: true, 
        id: new_id, 
        raw: counter,
        signature: signatureBase64
      }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on port ${PORT}`);
});