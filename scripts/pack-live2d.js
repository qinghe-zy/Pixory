const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const archiver = require('archiver');

// Simple regex to parse ts file and extract PET_MODELS
const TS_FILE = path.join(__dirname, '../src/config/petModels.ts');
const OUTPUT_DIR = path.join(__dirname, 'output', 'live2d');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // encode URI in case of spaces
    const encodedUrl = encodeURI(decodeURI(url));
    const lib = encodedUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    lib.get(encodedUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
         // handle redirect
         return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function extractModels() {
  const content = fs.readFileSync(TS_FILE, 'utf8');
  const regex = /id:\s*'([^']+)',[\s\S]*?url:\s*'([^']+)'/g;
  let match;
  const models = [];
  while ((match = regex.exec(content)) !== null) {
    models.push({ id: match[1], url: match[2] });
  }
  return models;
}

async function processModel(model) {
  const zipPath = path.join(OUTPUT_DIR, `${model.id}.zip`);
  if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 100) {
    return;
  }
  console.log(`\nProcessing ${model.id}...`);
  const modelDir = path.join(OUTPUT_DIR, model.id);
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

  const model3JsonName = model.url.split('/').pop();
  const baseUrl = model.url.substring(0, model.url.lastIndexOf('/'));
  
  // 1. Download model3.json
  const model3JsonPath = path.join(modelDir, model3JsonName);
  await downloadFile(model.url, model3JsonPath);
  
  let jsonText = fs.readFileSync(model3JsonPath, 'utf8');
  jsonText = jsonText.replace(/^\uFEFF/, '');
  let model3Json;
  try {
    model3Json = JSON.parse(jsonText);
  } catch(e) {
    console.error(`Failed to parse model3.json for ${model.id}`);
    return;
  }

  // Collect all files to download
  const filesToDownload = [];
  
  // Cubism 3/4
  const refs = model3Json.FileReferences || {};
  if (refs.Moc) filesToDownload.push(refs.Moc);
  if (refs.Textures) filesToDownload.push(...refs.Textures);
  if (refs.Physics) filesToDownload.push(refs.Physics);
  if (refs.Pose) filesToDownload.push(refs.Pose);
  if (refs.UserData) filesToDownload.push(refs.UserData);
  
  if (refs.Motions) {
    for (const group in refs.Motions) {
      refs.Motions[group].forEach(m => {
        if (m.File) filesToDownload.push(m.File);
        if (m.Sound) filesToDownload.push(m.Sound);
      });
    }
  }

  if (refs.Expressions) {
    refs.Expressions.forEach(e => {
      if (e.File) filesToDownload.push(e.File);
    });
  }

  // Cubism 2
  if (model3Json.model) filesToDownload.push(model3Json.model);
  if (model3Json.pose) filesToDownload.push(model3Json.pose);
  if (model3Json.physics) filesToDownload.push(model3Json.physics);
  if (model3Json.textures) filesToDownload.push(...model3Json.textures);
  
  if (model3Json.motions) {
    for (const group in model3Json.motions) {
      model3Json.motions[group].forEach(m => {
        if (m.file) filesToDownload.push(m.file);
        if (m.sound) filesToDownload.push(m.sound);
      });
    }
  }
  
  if (model3Json.expressions) {
    model3Json.expressions.forEach(e => {
      if (e.file) filesToDownload.push(e.file);
    });
  }

  // 2. Download all files
  for (const file of filesToDownload) {
    const fileUrl = `${baseUrl}/${file}`;
    const filePath = path.join(modelDir, file);
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
    
    try {
      await downloadFile(fileUrl, filePath);
      console.log(`  Downloaded ${file}`);
    } catch (e) {
      console.log(`  [FAILED] ${file}`);
    }
  }

  // 3. Zip it
  console.log(`Zipping ${model.id}...`);
  // zipPath already declared above
  const output = fs.createWriteStream(zipPath);
  const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`=> Created ${model.id}.zip (${archive.pointer()} total bytes)`);
      // Cleanup folder
      fs.rmSync(modelDir, { recursive: true, force: true });
      resolve();
    });
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(modelDir, false);
    archive.finalize();
  });
}

async function main() {
  const models = await extractModels();
  console.log(`Found ${models.length} models.`);
  for (const model of models) {
    try {
      await processModel(model);
    } catch (e) {
      console.error(`Error processing ${model.id}:`, e);
    }
  }
  console.log('\nAll done! You can upload the output/live2d folder to your server.');
}

main();
