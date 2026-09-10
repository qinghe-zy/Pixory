const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const COUNTER_FILE = path.join(__dirname, 'counter.txt');

const server = http.createServer((req, res) => {
  // CORS headers
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

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, id: new_id }));
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
