import os
import json
import urllib.request
import urllib.parse
import shutil
import re

TS_FILE = "src/config/petModels.ts"
OUTPUT_DIR = "scripts/output/live2d"

os.makedirs(OUTPUT_DIR, exist_ok=True)

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        response = urllib.request.urlopen(req, timeout=30).read()
        return json.loads(response.decode('utf-8-sig')) # Handle BOM just in case
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def download_file(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response, open(dest, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
        return True
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        return False

def extract_models():
    with open(TS_FILE, "r", encoding="utf-8") as f:
        content = f.read()
    
    models = []
    # Regex to find id and url
    regex = re.compile(r"id:\s*'([^']+)',[\s\S]*?url:\s*'([^']+)'")
    for match in regex.finditer(content):
        models.append({"id": match.group(1), "url": match.group(2)})
    return models

def process_model(model):
    zip_path = os.path.join(OUTPUT_DIR, model['id'] + '.zip')
    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 100:
        return

    print(f"\nProcessing {model['id']}...")
    model_dir = os.path.join(OUTPUT_DIR, model['id'])
    os.makedirs(model_dir, exist_ok=True)
    
    url = model['url']
    url = url.replace('https://cdn.jsdelivr.net/gh/', 'https://raw.githubusercontent.com/')
    url = url.replace('@master/', '/master/')
    url = url.replace('@main/', '/main/')
    
    base_url = url.rsplit('/', 1)[0]
    model_json_name = url.rsplit('/', 1)[1]
    
    model_json_path = os.path.join(model_dir, urllib.parse.unquote(model_json_name))
    
    if not download_file(url, model_json_path):
        return
        
    try:
        with open(model_json_path, "r", encoding="utf-8-sig") as f:
            model_json = json.load(f)
    except Exception as e:
        print(f"Failed to parse json for {model['id']}: {e}")
        return
        
    files_to_download = []
    
    # Handle model.json (older) or model3.json (newer)
    if "FileReferences" in model_json:
        refs = model_json["FileReferences"]
        if "Moc" in refs: files_to_download.append(refs["Moc"])
        if "Textures" in refs: files_to_download.extend(refs["Textures"])
        if "Physics" in refs: files_to_download.append(refs["Physics"])
        if "Pose" in refs: files_to_download.append(refs["Pose"])
        if "UserData" in refs: files_to_download.append(refs["UserData"])
        if "Motions" in refs:
            for group in refs["Motions"].values():
                for m in group:
                    if "File" in m: files_to_download.append(m["File"])
                    if "Sound" in m: files_to_download.append(m["Sound"])
        if "Expressions" in refs:
            for e in refs["Expressions"]:
                if "File" in e: files_to_download.append(e["File"])
    elif "model" in model_json:
        # Older format model.json
        files_to_download.append(model_json["model"])
        if "textures" in model_json: files_to_download.extend(model_json["textures"])
        if "physics" in model_json: files_to_download.append(model_json["physics"])
        if "pose" in model_json: files_to_download.append(model_json["pose"])
        if "motions" in model_json:
            for group in model_json["motions"].values():
                for m in group:
                    if "file" in m: files_to_download.append(m["file"])
                    if "sound" in m: files_to_download.append(m["sound"])
        if "expressions" in model_json:
            for e in model_json["expressions"]:
                if "file" in e: files_to_download.append(e["file"])
    
    import concurrent.futures

    def download_wrapper(file_info):
        file, base_url, model_dir = file_info
        safe_file = urllib.parse.quote(file)
        file_url = f"{base_url}/{safe_file}"
        file_path = os.path.join(model_dir, file)
        if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
            return True
        return download_file(file_url, file_path)
        
    download_args = []
    for file in files_to_download:
        if not file: continue
        download_args.append((file, base_url, model_dir))
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        list(executor.map(download_wrapper, download_args))
            
    # Zip it
    print(f"Zipping {model['id']}...")
    zip_path = os.path.join(OUTPUT_DIR, model['id'])
    shutil.make_archive(zip_path, 'zip', model_dir)
    print(f"Created {model['id']}.zip")
    
    # Cleanup
    shutil.rmtree(model_dir)

def main():
    models = extract_models()
    print(f"Found {len(models)} models.")
    for model in models:
        process_model(model)
        
if __name__ == "__main__":
    main()
