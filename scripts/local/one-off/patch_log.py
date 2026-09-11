import datetime

log_entry = f\"\"\"
- 【OTA热更新】 {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} (生产频道)
  - 修复：全部素材、批量管理等列表页面，右上角“最新导入”等排序下拉菜单被下方图片遮挡的问题。
  - 优化：整理页（全局分组、标签总览）首次进入时加入骨架屏动画过渡，消除文字与卡片的加载跳动。
\"\"\"

with open('LOCAL_UPDATES_LOG.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Insert after the title or at the top
if '# 本地更新日志' in content:
    content = content.replace('# 本地更新日志', '# 本地更新日志\n' + log_entry)
else:
    content = log_entry + content

with open('LOCAL_UPDATES_LOG.md', 'w', encoding='utf-8') as f:
    f.write(content)
