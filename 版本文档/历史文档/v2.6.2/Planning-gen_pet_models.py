import re
import urllib.parse

md_file = "scratch/50_models_utf8.md"
ts_file = "src/config/petModels.ts"

with open(md_file, "r", encoding="utf-8") as f:
    lines = f.read().strip().split("\n")

models = []
for i in range(0, len(lines), 2):
    if not lines[i].strip(): continue
    title_line = lines[i].strip()
    url_line = lines[i+1].strip()
    
    # parse "- **Category**: name"
    m = re.match(r'- \*\*(.*?)\*\*: (.*)', title_line)
    if not m: continue
    category = m.group(1)
    name = m.group(2).replace(".model.json", "").replace(".model3.json", "").strip()
    
    # derive ID from url
    url_parts = url_line.split("/")
    model_id = url_parts[-2].replace("%20", "_").replace(" ", "_").lower()
    
    # ensure unique id
    base_id = model_id
    counter = 1
    while any(m['id'] == model_id for m in models):
        model_id = f"{base_id}_{counter}"
        counter += 1
        
    models.append({
        "id": model_id,
        "category": category,
        "name": name,
        "url": url_line,
        "zipUrl": f"https://mist01.com/live2d/{model_id}.zip"
    })

# Format to TS
ts_content = "export interface PetModel {\n"
ts_content += "  id: string;\n"
ts_content += "  name: string;\n"
ts_content += "  url: string;\n"
ts_content += "  zipUrl?: string;\n"
ts_content += "  motions?: string[];\n"
ts_content += "  category?: string;\n"
ts_content += "  semantic?: { tap?: string };\n"
ts_content += "  hitAreas?: string[];\n"
ts_content += "}\n\n"

ts_content += "export const PET_MODELS: PetModel[] = [\n"
for m in models:
    ts_content += "  {\n"
    ts_content += f"    id: '{m['id']}',\n"
    ts_content += f"    category: '{m['category']}',\n"
    ts_content += f"    name: '{m['name'].replace(chr(39), chr(92)+chr(39))}',\n"
    ts_content += f"    url: '{m['url']}',\n"
    ts_content += f"    zipUrl: '{m['zipUrl']}'\n"
    ts_content += "  },\n"
ts_content += "];\n"

with open(ts_file, "w", encoding="utf-8") as f:
    f.write(ts_content)

print(f"Written {len(models)} models to {ts_file}")
