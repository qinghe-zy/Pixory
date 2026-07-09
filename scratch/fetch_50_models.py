import urllib.request
import json
import random

def fetch_tree(repo):
    url = f"https://api.github.com/repos/{repo}/git/trees/master?recursive=1"
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'Mozilla/5.0')
    try:
        response = urllib.request.urlopen(req).read()
        return json.loads(response).get('tree', [])
    except:
        # Some use main instead of master
        url = f"https://api.github.com/repos/{repo}/git/trees/main?recursive=1"
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0')
        try:
            response = urllib.request.urlopen(req).read()
            return json.loads(response).get('tree', [])
        except:
            return []

repos = [
    ("Eikanya/Live2d-model", "master"),
    ("guyutongxue/Live2DModel", "master"),
    ("whatqiu/Live2d-nahida", "main"),
    ("zeankundev/HuTao-Live2D", "main")
]

models = []

for repo, branch in repos:
    tree = fetch_tree(repo)
    for item in tree:
        path = item['path']
        if path.endswith('.model.json') or path.endswith('.model3.json'):
            # Filter out some garbage or system files
            if ".github" in path or "test" in path.lower():
                continue
            url = f"https://cdn.jsdelivr.net/gh/{repo}@{branch}/{urllib.parse.quote(path)}"
            models.append((repo, path, url))

# Categorize them
categories = {
    "Genshin / Honkai (原神 / 崩坏)": [],
    "Yuzusoft (柚子社)": [],
    "Girls Frontline (少女前线)": [],
    "Azur Lane (碧蓝航线)": [],
    "Date A Live (约会大作战)": [],
    "Galgame / Visual Novel (视觉小说)": [],
    "Anime / Others (知名动漫)": []
}

for repo, path, url in models:
    path_lower = path.lower()
    if repo == "whatqiu/Live2d-nahida" or repo == "zeankundev/HuTao-Live2D" or "genshin" in path_lower or "honkai" in path_lower or "houkai" in path_lower:
        categories["Genshin / Honkai (原神 / 崩坏)"].append((path, url))
    elif "yu/" in path_lower or "mako/" in path_lower or "yuzusoft" in path_lower or "senren" in path_lower or "riddle" in path_lower:
        categories["Yuzusoft (柚子社)"].append((path, url))
    elif "frontline" in path_lower or "少女前线" in path_lower:
        categories["Girls Frontline (少女前线)"].append((path, url))
    elif "azur lane" in path_lower or "碧蓝航线" in path_lower:
        categories["Azur Lane (碧蓝航线)"].append((path, url))
    elif "date a live" in path_lower or "约会大作战" in path_lower:
        categories["Date A Live (约会大作战)"].append((path, url))
    elif "galgame" in path_lower or repo == "guyutongxue/Live2DModel":
        categories["Galgame / Visual Novel (视觉小说)"].append((path, url))
    else:
        categories["Anime / Others (知名动漫)"].append((path, url))

selected_urls = []
# Pick 50 distributed among categories
target_counts = {
    "Genshin / Honkai (原神 / 崩坏)": 5,
    "Yuzusoft (柚子社)": 5,
    "Girls Frontline (少女前线)": 10,
    "Azur Lane (碧蓝航线)": 10,
    "Date A Live (约会大作战)": 5,
    "Galgame / Visual Novel (视觉小说)": 10,
    "Anime / Others (知名动漫)": 5
}

for cat, lst in categories.items():
    cnt = min(target_counts[cat], len(lst))
    chosen = random.sample(lst, cnt)
    for path, url in chosen:
        selected_urls.append(f"- **{cat}**: {path.split('/')[-1]} \n  {url}")

# Fill up to 50 if lacking
while len(selected_urls) < 50:
    for cat, lst in categories.items():
        if len(selected_urls) >= 50:
            break
        # pick a random one that is not in selected
        if len(lst) > 0:
            candidate = random.choice(lst)
            formatted = f"- **{cat}**: {candidate[0].split('/')[-1]} \n  {candidate[1]}"
            if formatted not in selected_urls:
                selected_urls.append(formatted)

print(f"Total found: {len(selected_urls)}")
for s in selected_urls[:50]:
    print(s)
