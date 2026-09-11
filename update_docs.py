import re

# 更新 feature-matrix.md
with open("docs/feature-matrix.md", "r", encoding="utf-8") as f:
    fm_content = f.read()

search_fm = "| 用户系统 (UID) | 基于服务器端 (Node+PM2) 自增发号器，客户端 SecureStore 永久固化格式化字符串及原生整数 (raw ID) 用于纯离线 A/B 测试基建；支持弱网 3 秒熔断，无感挂载于 App 启动期。 | `src/services/uidService.ts`, `server.js` (服务器端) |"
replace_fm = "| 用户身份与发号系统 (UID) | 基于服务器端 (Node+PM2) 自增发号器，客户端 SecureStore 永久固化。支持基于原生整数 (raw ID) 的纯离线 A/B 测试基建；支持通过直接修改服务器端 `counter.txt` 游标实现“靓号锁仓”（如调至10即可雪藏前10号），并在客户端配合隐藏彩蛋强行覆写 SecureStore 实现定向发放；支持弱网 3 秒熔断，无感挂载于 App 启动期。 | `src/services/uidService.ts`, `server.js` (服务器端) |"

fm_content = fm_content.replace(search_fm, replace_fm)
with open("docs/feature-matrix.md", "w", encoding="utf-8") as f:
    f.write(fm_content)

# 更新 LOCAL_UPDATES_LOG.md
with open("LOCAL_UPDATES_LOG.md", "r", encoding="utf-8") as f:
    log_content = f.read()

search_log = "  - **强行换号机制**: 若未来需强推新账号体系，只需修改 `uidService.ts` 中的 `UID_KEY` 常量（改为如 `pixory.uid.v2`），全量用户更新后即会自动重新向服务器申请新号。"
replace_log = """  - **强行换号机制**: 若未来需强推新账号体系，只需修改 `uidService.ts` 中的 `UID_KEY` 常量（改为如 `pixory.uid.v2`），全量用户更新后即会自动重新向服务器申请新号。
  - **靓号锁仓与定向发放**: 若需保留早期号段（如前10号），直接登录服务器将 `counter.txt` 改为 10 即可；后续若要将保留号送人，由于发号系统认本地不认服务端，只需在 App 前端编写一个隐藏入口（如兑换码），强行覆写该用户的 `SecureStore` 对应键值对（`pixory.uid.current` 和 `raw`），重启生效。"""

log_content = log_content.replace(search_log, replace_log)
with open("LOCAL_UPDATES_LOG.md", "w", encoding="utf-8") as f:
    f.write(log_content)