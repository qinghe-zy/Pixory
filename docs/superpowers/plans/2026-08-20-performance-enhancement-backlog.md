# Pixory 后续性能增强清单

日期：2026-08-20
状态：当前确定性性能问题修复后的后续清单
约束：清单项目尚未实现；每项仍需独立 Spec、RED 测试、模块 review 和常规回归。不得把“建议”写成“已完成”。

## 已优先完成

- [x] AI 会话历史：搜索、筛选和列表改为 SQLite keyset 分页，每页 40 条；页面使用 `FlatList`；旧筛选请求不能回灌新列表。
- [x] 启动关键路径：原生 Splash 受控交接、关键/延迟字体分层、目录与数据库并行、根页错峰预热、隐藏页动画停止。
- [x] 媒体大列表、AI 材料/收藏、备份/存储、导入批次和精确重复检测的已知无界路径完成本轮加固。

## P1：下一批最值得做

- [ ] AI 历史投影物化：当前分页结果已有界，但历史查询仍需从 adopted branch 的消息 CTE 计算最后可见消息。设计可事务维护的 `thread_history_projection`，并保留分支切换、编辑、删除、Personal 隔离和重建校验，目标是把列表页从“扫描消息投影”降为“扫描线程投影”。
- [ ] AI 历史全文检索：为标题和最后消息预览增加受控 FTS 索引；保留 `%`、`_`、反斜杠字面量语义、Personal 独立库、删除/重建和中文 tokenizer 的回退策略。
- [ ] 内心生活真正分页与虚拟化：当前已从“三类并发全读”收敛为“只读当前 tab”，但当前 tab 内仍可能全量 `flatMap/map`；为日记、梦境、独白分别增加 cursor 与 `FlatList/SectionList`。
- [ ] 角色库、知识库和 IP 选择器分页：`AiRoleLibraryScreen`、`AiKnowledgeBaseScreen`、`AiIpPickerScreen`、`AiMaterialImportScreen` 当前仍会读取或渲染完整集合；统一轻量投影、搜索下推、cursor 和虚拟列表。
- [ ] 记忆看板分页：active/stale 目前各固定读取 120 条；改为按当前分段惰性 keyset，避免静默截断并限制 React state。
- [ ] 全局 AI 用量聚合分页：当前服务存在 600 条上限读取；把按模型/线程/日期的统计下推 SQLite，详情再按 cursor 展开，避免扩大固定上限。

## P2：中期数据与 I/O 增强

- [ ] SQLite 一致性原生快照：仅在 Expo/原生桥提供可证明的 WAL 一致性 API 后，替换 `serializeAsync → Base64` 的 JS 峰值；没有一致性证明时不得直接复制活跃数据库文件。
- [ ] 备份进度与取消粒度：把数据库序列化、清单生成、文件哈希/复制分阶段上报；每个 worker 批次检查取消，失败仍按现有事务与临时目录规则清理。
- [ ] 感知重复候选索引：先用可证明不漏召回的多表 LSH/多位段 bucket 做候选，再算汉明距离；必须用边界 fixture 证明阈值内候选不会因分桶丢失。
- [ ] Provider/模型长列表虚拟化：远端或自定义网关返回大量模型时，搜索下推/分段缓存并使用虚拟列表；密钥和 Personal scope 不进入共享缓存键。
- [ ] 大型选择器统一基础组件：抽取支持 cursor、搜索代际隔离、空态和已选项置顶的 `VirtualizedPicker`，避免不同页面重复实现竞态修复。

## P3：设备证据和低收益微调

- [ ] 启动图无损构建优化：当前各 density 已按 Android 资源编译且视觉安全区合理，素材不是主要瓶颈。若继续做，只允许像素一致的 lossless PNG 优化，并比较 APK 体积、解码时间与首帧，不改图形尺寸/颜色。
- [ ] 真机性能门禁：冷启动、长聊天、reader、short-video feed 使用 Macrobenchmark/JankStats、Perfetto、PSS/native heap 建基线。用户本轮明确不做压力测试，因此本项只列计划、不计入当前完成门禁。
- [ ] 视频能力分档：收集低端机 codec 数、prepare 延迟和内存后，再决定是否把固定最多 3 路准备改为能力自适应或引入 Media3 preload manager。
- [ ] 聊天高度命中观测：记录动态消息高度缓存、re-measure 和 dropped frame；只有数据证明布局是主要瓶颈时才引入更复杂的高度持久化。

## 每项上线门禁

- [ ] 先写可复现 RED，修复后运行聚焦 GREEN。
- [ ] 每完成一个模块立即做代码 review，不跨模块累积 review 债务。
- [ ] 运行 `pnpm typecheck`、相关常规测试和 `git diff --check`。
- [ ] 更新 `docs/feature-matrix.md` 与对应 review；明确自动化已验、真机待验和未执行的压力测试。
- [ ] 不降低 Personal 隔离、原件安全、备份一致性、分支正确性或重复检测召回率换取速度。
