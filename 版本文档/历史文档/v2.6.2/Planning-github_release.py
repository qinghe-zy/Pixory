import urllib.request
import json
import os

token = os.environ.get('GITHUB_TOKEN')
if not token:
    print("No GITHUB_TOKEN provided. Please set it or run this script with it.")
    exit(1)

apk_path = 'output/release/Pixory-v2.6.1.apk'
if not os.path.exists(apk_path):
    print("APK not found.")
    exit(1)

release_data = {
    "tag_name": "v2.6.1",
    "name": "Pixory 2.6.1",
    "body": "Pixory 2.6.1 发布。全面优化了桌面宠物的交互体验，引入智能待机散步机制、底层原生视线追踪，以及多层级触摸反馈降级策略，大幅提升不同精度 Live2D 模型的通用性和趣味性。\n\n### 更新内容\n- ✨ 智能待机散步：长时间无操作自动限制范围内巡逻，支持打断\n- ✨ 视线追踪引擎：越过 WebView 层级向底层注入绝对坐标，眼球灵动跟随\n- ✨ 触碰降级系统：无视模型碰撞盒质量强行几何推断，任意模型皆可互动\n- 🐛 问题修复：修复部分边界交互和动画抢占的锁死隐患，彻底解决热更新被缓存降级导致功能消失和老布局覆盖的构建层严重 Bug。\n\n*请注意：如果从低于 2.6.1 版本直接通过应用内更新，由于历史打包系统底层标记残留，首次可能会短暂回退至 2.6.0，随后会自动二次静默更新至 2.6.1 的热更内容。为最稳定体验，建议直接下载本站 2.6.1 原生安装包覆盖安装。*",
    "draft": False,
    "prerelease": False
}

req = urllib.request.Request(
    'https://api.github.com/repos/qinghe-zy/Pixory/releases',
    data=json.dumps(release_data).encode('utf-8'),
    headers={
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    },
    method='POST'
)

try:
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode('utf-8'))
        upload_url = res['upload_url'].split('{')[0]
        print(f"Created release {res['id']}")
        
        # Upload APK
        with open(apk_path, 'rb') as f:
            apk_data = f.read()
        
        upload_req = urllib.request.Request(
            f"{upload_url}?name=Pixory-v2.6.1.apk",
            data=apk_data,
            headers={
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/vnd.android.package-archive'
            },
            method='POST'
        )
        with urllib.request.urlopen(upload_req) as upload_response:
            print("Uploaded APK successfully!")
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'read'):
        print(e.read().decode('utf-8'))
