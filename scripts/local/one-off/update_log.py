import re

with open("LOCAL_UPDATES_LOG.md", "r", encoding="utf-8") as f:
    content = f.read()

search = "  3. 个人中心 (MeScreen) UI 优化：在用户名下方新增内敛风格的 UID 展示（使用官方品牌字体）。"
replace = """  3. 个人中心 (MeScreen) UI 优化：在用户名下方新增内敛风格的 UID 展示（使用官方 `JetBrainsMono` 品牌等宽字体）。

**【UID 架构与后期拓展查阅指南】**
- **服务器端 (发号器)**:
  - **路径**: `/home/qinghe/pixory-api/server.js` (运行于 20.78.128.220)
  - **管理**: 由 `pm2` 后台守护，进程名 `pixory-id`。开机自启。
  - **Nginx**: `/etc/nginx/sites-available/mist01.com` 配置了反向代理，将 `https://mist01.com/api/get_id` 代理至本地 `127.0.0.1:3001`。
  - **数据存储**: 根目录下的 `counter.txt` 保存了绝对自增的原始计数值，该值即为总发号量。
- **客户端 (App端)**:
  - **服务文件**: `src/services/uidService.ts`。取号、网络熔断、缓存逻辑均封装于此，无感挂载于 `App.tsx` 启动期。
  - **本地缓存**: 使用 `SecureStore` (随 App 卸载或清空数据而销毁)。
    - 键 `pixory.uid.current`: 保存格式化字符串 (如 `AAA-001`)，当前界面展示直接读取此键。
    - 键 `pixory.uid.raw`: 保存原生整数序号 (如 `1`)。
  - **后期拓展 (A/B 测试)**: 若需前端 A/B 测试或灰度发布，请直接读取 `pixory.uid.raw` 转换为整数后进行取模运算（如 `raw % 2 === 0`），无需与服务器交互即可实现持久化分组。
  - **强行换号机制**: 若未来需强推新账号体系，只需修改 `uidService.ts` 中的 `UID_KEY` 常量（改为如 `pixory.uid.v2`），全量用户更新后即会自动重新向服务器申请新号。"""

content = content.replace(search, replace)

with open("LOCAL_UPDATES_LOG.md", "w", encoding="utf-8") as f:
    f.write(content)