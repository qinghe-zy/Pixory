# Pixory 性能加固补强设计

**状态：** A–D 已按顺序实现并逐模块 review；host 门禁完成，Android 设备门禁待设备
**日期：** 2026-08-20
**前置文档：** [全面性能加固与代码 Review 记录](../../reviews/2026-08-20-performance-hardening-review.md)

## 1. 目标与完成定义

修复全面 review 后仍可由源码确定的四类风险：

1. normal/personal 媒体 mutation epoch 相互污染。
2. 混合图片/视频导入的实际提交字节分账，导致跨类型总量可能漏算。
3. Android 内存压力没有驱动图片 reader 释放 decoded ref，超长图预解码缺少高度边界。
4. 聊天 around-anchor 在同一 SQLite 连接并发三条 statement，且缺少 6000+ 消息 repository 查询基准。

完成必须同时满足：每项先有可复现失败测试；实现后聚焦测试、TypeScript、全量测试和 diff 通过；原件安全、Personal 隔离和现有 UI 行为不退化；文档与功能矩阵同步。Android 无设备时只允许声明原生编译/契约通过，不得声明帧率、声学或厂商行为通过。

## 2. 模块 A：按空间隔离媒体 epoch

- `dataEpochService` 支持 `global | normal | personal` scope。`getDataEpoch(domain, space)` 返回 global 与指定空间 epoch 的组合值；未知数据库句柄的写入退化为 global bump，确保 fail-safe 地同时失效两空间。
- 新增 SQLite 句柄到 `PixorySpace` 的 WeakMap registry。数据库打开后立即登记；repository 不从文件名或全局当前空间猜测。
- `imageRepository` 每个结构写在成功后按数据库句柄对应空间 bump；last-view 合并写仍不 bump。
- `ImageViewerScreen` 按 `context.space` 读取 epoch。

验收：normal bump 不改变 personal epoch；personal bump 不改变 normal；global bump 同时影响两者；结构写按句柄 scope；未知句柄 fail-safe。

## 3. 模块 B：混合导入共享实际字节账本

- `ImportImagesScreen` 在混合预检后只创建一个 `MediaImportCommitBudget`，顺序传给图片和视频导入服务。
- `importImagesToIp` / `importVideosToIp` 接受可选外部 budget；独立入口仍自动创建自己的 budget，保持兼容。
- 成功完成素材记录、标签和回滚边界后才更新共享 budget。实际大小变化与每 16 项复查逻辑保留。

验收：图片成功提交的字节对随后视频可见；任一失败项不记账；独立导入无需调用方创建 budget；1000/32GB/剩余 512MB 等原有限制不放宽。

## 4. 模块 C：图片像素预算与 Android memory trim

- 原生媒体模块实现 `ComponentCallbacks2`，把 `onTrimMemory` / `onLowMemory` 转为 `PixoryMediaMemoryPressure` 事件；模块销毁时注销 callback。
- JS native wrapper 暴露 typed listener；非 Android/原生模块缺失时安全返回空 subscription。
- reader 监听高压力事件并把当前 prefetch target 切到 `memoryPressure: high`；coordinator 立即清空 decode queue、释放已持有 decoded refs，只保留有界 encoded 预取。当前 reader 卸载后自然恢复 normal，避免永久全局降级。
- `ExpoImage.loadAsync` 同时传 `maxWidth` 与 `maxHeight`，以设备像素下的 reader viewport 限制超长图/超宽图预解码尺寸。当前项正常 Image 渲染路径不受限制，原图不改写。

验收：high pressure 后 decoded count 归零且不启动新 decode；encoded window 收缩为 8/4；原生 callback 生命周期无泄漏；TypeScript/native Kotlin 编译通过。

## 5. 模块 D：聊天单 statement 锚点读取与 6000+ 基准

- `listMessagesBaseAroundAnchor` 改为一条 CTE/UNION SQL，同时返回 latest、anchor、before、after 并按 `(createdAt,id)` 稳定排序；anchor 不存在时自然只返回 latest。
- 不在同一 Expo SQLite 连接使用 `Promise.all` 并发 statement。
- 新增 deterministic host benchmark：种入至少 6000 条同线程消息，测 latest 60、before 60、around-anchor 窗口和 100 页 keyset traversal，断言结果不重不漏并记录 query plan。
- benchmark 只使用内存数据库，不写用户数据；Node SQLite 数据仅作为回归基线，不代表 Android SLA。

验收：相同时间戳依靠 id tie-breaker；anchor 首/中/尾与缺失均正确；查询命中 thread/created/id index；遍历 6000 条无 OFFSET。

## 6. 明确不伪修的设备门禁

- 真实 60/90/120Hz 帧时间、PSS/native heap、codec 实例数。
- 0.5×–3× 语音/音乐在扬声器、耳机、蓝牙上的主观与基频测量。
- OEM DocumentProvider/MediaStore URI、系统低存储抢占和取消 native copy 的时延。

这些必须在 ADB 设备可用时执行，不以静态测试替代。若真机证据显示 Expo/Media3 保音高或五播放器池不达标，再单独设计 DSP/Media3 preload bridge；本轮不预先堆叠未证实的原生架构。

## 7. 自审结论

- 四项均来自已记录的确定性代码路径，不包含无证据的视觉重写或依赖升级。
- 每项都有独立 RED/GREEN 和 rollback 边界；模块 A/B/C/D 可分别回退。
- 新 API 保持现有调用兼容；未知 DB scope 采用 global fail-safe，不允许 stale cache。
- 不压缩、覆盖、重编码或删除原始媒体；Personal 缓存仍只驻留内存。
- 决定：可以开始按 A→B→C→D 顺序执行，每模块完成后立即 review。

## 8. 实施结果

- Module A：media epoch 已按 normal/personal 隔离，并保留 unknown-handle global fail-safe。
- Module B：混合图片/视频预检和实际提交共同复用一个字节账本。
- Module C：Android memory trim 已接到 reader encoded-only 收缩，预解码同时限制宽高像素。
- Module D：around-anchor 已合并为单条 CTE statement；6000 消息/100 页 repository benchmark 不重不漏并命中复合索引。
- 逐项证据、验证数值和剩余设备边界见[全面 Review](../../reviews/2026-08-20-performance-hardening-review.md)与[补强 Plan](../plans/2026-08-20-performance-hardening-followup.md)。
