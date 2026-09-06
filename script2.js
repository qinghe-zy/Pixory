const fs = require("fs");
const files = ["docs/index.html", "docs/m.html", "docs/sitemap.xml", "docs/download.html", "docs/updates.html"];
for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, "utf8");
    content = content.split("2.8.1").join("2.8.2");
    fs.writeFileSync(file, content);
  }
}

