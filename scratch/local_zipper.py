import json
import re
import urllib.parse
import os
import shutil

TS_FILE = "src/config/petModels.ts"
OUTPUT_DIR = "live2d_zips"

os.makedirs(OUTPUT_DIR, exist_ok=True)

def extract_models():
    with open(TS_FILE, "r", encoding="utf-8") as f:
        content = f.read()
    
    models = []
    regex = re.compile(r"id:\s*'([^']+)',[\s\S]*?url:\s*'([^']+)'")
    for match in regex.finditer(content):
        models.append({"id": match.group(1), "url": match.group(2)})
    return models

def main():
    models = extract_models()
    for model in models:
        url = model['url']
        # e.g. https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/galgame%20live2d/...
        
        # parse repo and path
        match = re.match(r"https://cdn\.jsdelivr\.net/gh/([^/]+)/([^@/]+)@[^/]+/(.+)$", url)
        if not match:
            print(f"URL format not matched: {url}")
            continue
            
        owner = match.group(1)
        repo = match.group(2)
        path = match.group(3)
        
        path = urllib.parse.unquote(path)
        
        # The local repository dir should be cloned as `repo`
        repo_dir = repo
        
        # The file is at repo_dir/path
        file_path = os.path.join(repo_dir, path)
        model_dir = os.path.dirname(file_path)
        
        zip_path = os.path.join(OUTPUT_DIR, model['id'])
        
        if os.path.exists(model_dir):
            print(f"Zipping {model['id']} from {model_dir}")
            shutil.make_archive(zip_path, 'zip', model_dir)
        else:
            print(f"Model directory not found: {model_dir}")

if __name__ == '__main__':
    main()
