# Pixory 媒体、聊天与数据库全面性能加固设计

**状态：** 模块 0–8 已顺序实施并完成逐模块 review；完整代码 review 已完成，Android 真机性能/音频门禁仍待设备验证

**日期：** 2026-08-20

**产品优先级：** 聊天连续性与可信度 > Personal 隔离 > 媒体切换流畅度 > 本地数据一致性 > 视觉精致度

## 1. 目标

在不更换 Expo / React Native / SQLite 主技术栈、不损坏原始媒体、不削弱 Personal 空间隔离的前提下，系统修复以下问题：

1. 首页初次进入只显示一个与真实 IP 卡片完全同尺寸的 skeleton，并叠加轻量 shimmer；不显示“正在读取本地资产库”等加载提示，也不发生布局跳动。
2. 大量 IP 卡片向上滚动时，第一张卡片的壳和文字不能晚于第二张出现，卡片回收后不能重新触发重型首项动画。
3. 图片阅读器能够承受连续高速横向或纵向翻动；预取不能固定为三页，也不能用无界全尺寸位图解码换命中率。
4. 视频上下切换具备短视频式跟手、可中断、连续体验；下一项封面在拖动期间已经可见，不能落位后才突然替换。
5. 视频倍速保持原始音高，消除当前明显的“花栗鼠音”；优先正确启用 Media3/Sonic 路径，原生 DSP 仅作为量化验证后的回退。
6. 聊天首次进入、超长轮次快速滚动、加载更早消息和流式回复保持稳定；普通进入不出现显示后的纠正闪烁，并利用应用初始化、路由意图与遮罩时间预热关键数据。
7. SQLite 查询、索引、游标分页、缓存和失效机制覆盖媒体与聊天热路径；退出再进入尽可能恢复会话，不进行无条件全量重载。
8. 缩略图、附件、图片/视频导入、缓存清理和极端低存储场景使用有界并发和背压，避免 OOM、ANR、闪退、重复占用和半完成数据。
9. 每完成一个模块立即测试并 review；模块未通过不得进入下一个模块。全程不使用子智能体。

## 2. 实施前已验证基线（历史记录）

本节保留动工前的失败证据，用于证明没有通过隐藏问题来“变绿”。其中 `fix_tests.js`、`CircularProgress`、`ImageViewerScreen` 和两项旧 policy 均已在实施后 review 中修复；最终新鲜结果以[全面 Review 记录](../../reviews/2026-08-20-performance-hardening-review.md)为准。

### 2.1 代码与测试

- 技术栈：Expo 54、React Native 0.81、React 19、TypeScript 5.9、Expo SQLite 16、Expo Image 3、Expo Video 3。
- 验证命令：`pnpm typecheck`、`pnpm test`、`pnpm bench:ai-chat`、`git diff --check`。
- 默认 `pnpm typecheck` 当前首先被根目录用户文件 `fix_tests.js` 的非法字符阻断。
- `pnpm exec tsc --noEmit --allowJs false` 当前报告：
  - `CircularProgress.tsx` 4 个用户现有 token 类型错误；
  - `ImageViewerScreen.tsx` 6 个本任务内声明顺序错误（两个标识符各自触发声明前使用与赋值前使用诊断）。
- 全量 `node:test` 当前有 2 个既有 policy 失败：Personal `SecureImage` 缓存策略断言、批量管理媒体类型断言。

这些失败是实施基线，不允许通过删除测试、放宽断言或覆盖用户代码来“变绿”。模块验收定义为：本模块新增与相关测试通过、应用 TypeScript 不新增错误、全量测试不增加基线外失败。

### 2.2 根因证据

- 首页 loading 使用结构不同的 `PageStateBlock`；真实卡片宽高比为 2.08，因此替换必然产生视觉跳动。
- 第一张 IP 卡片独有双传感器、嵌套 Pan 手势、超大 SVG/渐变高光，其他卡没有，导致第一项首帧成本更高并与列表滚动竞争。
- 图片阅读器整批查询上下文、先渲染再 `requestAnimationFrame + scrollToIndex` 定位、每次 active 变化立即写库并触发全局刷新。
- 视频播放器只有一个 player；旧画面退出完成后才设置下一封面并替换 source。
- 当前 Android Expo Video 初始化 `preservesPitch=false`，而 Pixory 五条倍速写入路径均未显式开启保音高。
- SQLite 已启用 WAL，但媒体常用查询仍有无界读取、OFFSET 深分页、相关子查询和缺少排序组合索引。
- 聊天已有 60 条 cursor page 和 route snapshot prefetch，不需要重写分页；普通首次进入仍有透明 reveal 与显示后的延迟纠正滚动风险。
- 附件/缓存清理存在无界 `Promise.all`，DocumentPicker 缓存副本与受管存储复制可能造成短时双占用。

## 3. 总体架构

采用四层性能模型：

```text
稳定 UI 壳层
  → 有界可见数据层
    → 方向/速度感知预热层
      → SQLite / 文件 / 解码资源层
```

核心原则：

- 列表窗口、数据窗口、文件预取窗口和已解码窗口分别管理，禁止用一个 `windowSize` 代替全部资源策略。
- 当前项优先、方向前方次之、反方向保留少量回退；方向改变时取消或降级过时任务。
- 所有缓存有容量、作用域、版本和清理时机；Personal 缓存绑定解锁会话。
- UI 壳先出现，媒体在壳内渐进填充；任何资源解码完成顺序都不能改变数据项出现顺序。
- 高频手势只更新 transform/opacity；数据库、React 列表重排、图片解码和播放器替换不进入逐帧路径。

## 4. 首页与 IP 卡片

### 4.1 共享几何

建立 `ipCardLayout` 共享常量：

```ts
export const IP_CARD_ASPECT_RATIO = 2.08;
export const IP_CARD_CONTENT_PADDING = spacing[4];
export const IP_CARD_SHIMMER_DURATION_MS = 1_200;
```

真实卡与 skeleton 均使用同一个卡片壳，外部宽度、aspect ratio、圆角、阴影占位和列表间距完全一致。

### 4.2 Loading / empty / error

- `FlatList` 从首帧开始挂载。
- `isLoading && items.length === 0` 时，`ListEmptyComponent` 只渲染一个 `IPCardSkeleton`。
- loading 时不显示标题、说明、插画、进度点或按钮。
- 查询完成且为空才显示真实 EmptyState；失败显示错误态与重试。
- skeleton 到真实卡片只替换内部内容，不改变外部 layout；首卡不淡入，后续内容可 120ms 淡入。
- shimmer 用 React Native `Animated` transform 和 native driver；卸载、数据完成和 Reduce Motion 时停止。

### 4.3 首卡顺序

- 从 `IPCard` 删除 `isFirst` 和列表内磁吸/陀螺仪分支。
- 所有卡片同步渲染壳、标题和元数据。
- 只有第一张封面优先级为 high 且 transition 为 0ms；其余卡片为 normal 并使用 120ms transition。图片解码只改变卡片内部图片层。
- 使用稳定 key、`recyclingKey`、固定 item layout 和一致的图片 transition。
- 首卡特色只保留静态高光，不在虚拟列表启动传感器。

## 5. 图片阅读器

### 5.1 分层自适应窗口

默认策略由纯函数 `resolveMediaPrefetchWindow` 生成：

| 滑动级别 | 编码文件前方 | 编码文件后方 | 已解码前方 | 已解码后方 |
|---|---:|---:|---:|---:|
| idle / slow | 8 | 4 | 3 | 2 |
| medium | 16 | 6 | 5 | 3 |
| fast / fling | 32 | 8 | 6 | 3 |

图片元数据窗口围绕锚点首载 81 项，active 距边界 10 项内时按 40 项游标页补充。以上 encoded/decode 窗口是上限初值，受内存压力、图片像素和 Personal 会话状态进一步收缩。

### 5.2 数据接口

定义稳定游标：

```ts
export interface MediaPageCursor {
  sortValue: string | number | null;
  id: number;
}

export interface MediaCursorPageRequest extends ImageListQueryOptions {
  limit?: number;
  direction: 'before' | 'after';
  cursor?: MediaPageCursor;
}

export interface MediaPageResult<T> {
  items: T[];
  olderCursor: MediaPageCursor | null;
  newerCursor: MediaPageCursor | null;
  hasOlder: boolean;
  hasNewer: boolean;
}
```

- repository 提供 around-anchor 与 before/after cursor 查询。
- 阅读器首批围绕 `imageId` 加载，不再整批查询后修正位置。
- `image-scope` 等显式 ID 范围保持调用方顺序；超过 SQLite bind limit 时分块。
- 列表使用真实 `initialScrollIndex` 和 `getItemLayout`。

### 5.3 预览、预取与内存

- 列表页与普通翻页优先使用现有 thumbnail/cover 或新增独立 reader preview；原图仅在当前项需要高精度/缩放时加载。
- 原始文件永不压缩、覆盖或替换；reader preview 是可重建派生文件。
- Expo Image `prefetch` 只承担编码资源预热；`loadAsync` 只用于最近邻且必须限制解码尺寸。
- 预取任务包含 generation id；跳转或方向改变后，旧 generation 结果不得写回当前窗口。
- 内存告警时先释放远端 decoded refs，再缩小编码窗口，最后仅保留当前项。

### 5.4 阅读会话恢复

缓存键：`space + contextSignature + dataEpoch`。

缓存内容：当前 media id、已加载轻量项、前后 cursor、reader mode、active index 和最近访问去重集合。Normal 使用有界 LRU；Personal 仅存内存并在锁定时清除。

`lastViewedAt` 只在项目稳定可见 300ms 后加入去重集合；每 2 秒或退出时批量写一次。不会因每页滑动触发全局 library refresh。

## 6. 视频短视频式切换

### 6.1 三槽与播放器池

三槽是视觉槽：previous / current / next。播放器资源分离：

- 资源池最多 5 个 player：1 个 current、方向前方 3 个、反向回退 1 个；
- 只有 current player 持有音频，其余均静音暂停；
- source/player 按优先序最多 3 路并行准备，方向变化后重新排序；
- previous/current/next 三个视觉槽始终使用对应封面跟随手势；
- 视频元数据窗口围绕锚点首载 61 项，靠近边界按 40 项游标页补充。

Expo 层先使用未挂载 `VideoPlayer` 预热。只有 Expo 实测无法满足首帧预算时，才增加 Android Media3 `DefaultPreloadManager` 桥接；不在第一轮引入 SoundTouch/Rubber Band。

### 6.2 手势状态机

```ts
type VideoSwipePhase = 'idle' | 'dragging' | 'settling' | 'activating';
```

- dragging：当前槽随手指移动，方向对应的下一封面已经位于相邻槽。
- release：距离或速度超过阈值则 settle 到下一槽，否则回弹。
- settling 可被新手势中断，并从当前 transform 重定向。
- activating：落点 player 已 prepared 时立即播放；否则保留正确封面，超过 120ms 才显示轻量加载反馈。
- 始终单一 audio owner；非 active player mute + pause。
- 默认不重叠两个 SurfaceView；需要双 VideoView 时仅在 textureView 验证通过后启用。

### 6.3 倍速保真

统一 API：

```ts
export function applyPitchPreservingRate(
  player: Pick<VideoPlayer, 'preservesPitch' | 'playbackRate'>,
  rate: number,
): void {
  player.preservesPitch = true;
  player.playbackRate = rate;
}
```

初始化、source replace、偏好变更、长按进入和长按退出全部调用该 API。0.5×–2× 是高保真验收范围；3× 保持音高但允许记录可感知伪影。只有真机 AB 仍不合格才评估 SoundTouch（语音/WSOLA）或 Rubber Band（音乐/相位声码器）。

## 7. 聊天性能

### 7.1 首次进入

- 应用启动遮罩期间完成 SQLite、迁移、索引与共享缓存初始化；当前应用没有可靠持久化“本次将进入的聊天线程”，因此不猜测目标、不预热全部线程。
- 一旦用户点击线程、搜索结果或历史记录，先立即调用已有 `prefetchThreadMessages`，再 push route；这段已知路由意图时间用于加载目标线程最后一页与关键头像。
- route snapshot 命中且 revision/lineage 有效时直接采用。
- 普通打开线程使用 inverted list offset 0，不先隐藏消息区再在 400/700ms 可见纠正。
- 搜索目标、分支目标和编辑定位保留独立、可取消的定位重试，不与普通进入共享。

### 7.2 超长线程

- 保留 60 条 keyset page。
- 旧页合并使用线性、稳定去重；禁止每页对全部累计历史重新 `sort()`。
- MessageRow 保持 memo；富 Markdown、WebView、图片、引用在临近可见时解析。
- streaming patch 合并为每 32–50ms 一批；不逐 token 驱动整个 screen。
- 保存 `messageId + relativeOffset` 锚点；内容高度变化后用锚点恢复而非绝对像素。
- 页面隐藏时停止 ParallaxLightSweep 和非必要无限动画。

### 7.3 附件

- 图片/文件附件限制数量、单项大小和总字节。
- Base64 转换使用有界并发，并只处理即将发送的允许项。
- 大文件走 URI/文件流能力；不把视频完整读入 JS 字符串。
- Personal 附件缓存与会话绑定，失败和取消后清理临时副本。

## 8. SQLite 与缓存

### 8.1 索引

不升级 schema version 59，以避免把纯索引优化和大量既有版本断言混在一起。新增幂等 `ensureMediaPerformanceIndexes`，每个 normal/personal DB 初始化时执行：

```sql
CREATE INDEX IF NOT EXISTS idx_image_assets_ip_media_live_created
ON image_assets(ipId, mediaType, deletedAt, createdAt DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_image_assets_media_live_viewed
ON image_assets(mediaType, deletedAt, lastViewedAt DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created_id
ON ai_messages(threadId, createdAt DESC, id DESC);
```

每个索引必须有 `EXPLAIN QUERY PLAN` 测试证明目标查询使用索引且不产生目标排序临时 B-tree；没有证据的索引不添加。

### 8.2 查询与缓存

- 深页统一 keyset；OFFSET 只保留在浅页管理列表，超过阈值不得用于阅读器/播放器/聊天。
- 热路径使用轻投影；标签、分组、版本等关系按可见 ID 批量 hydration。
- 建立容量受限 `ScopedLruCache`：键包含 space、查询签名和 epoch，支持 TTL、最大项数和显式 scope 清除。
- 数据 epoch 按域拆分：`ipLibrary`、`media`、`chatThread:<id>`；写操作只失效对应域。
- Personal 锁定时清除 Personal query cache、reader session、video preload 和 image memory refs。

## 9. 缩略图、导入与清理

- 可见缩略图优先，其次沿滑动方向前瞻，最后后台；文件 I/O 和解码均有并发上限。
- 导入前计算已知总大小、文件数和最低剩余空间；未知大小使用保守预算并在复制中持续检查。
- 默认上限复用 package import 已有策略：单任务文件数、单文件、总字节与最低剩余空间各自有明确错误提示；具体值集中于 `limits.ts`。
- 原图复制、元数据、派生预览、数据库写入使用状态机和事务边界；失败不得留下“记录存在但原图缺失”。
- DocumentPicker 缓存策略只在验证 URI 生命周期后按平台调整；不能直接关闭导致选择器 URI 失效。
- 递归目录统计和删除使用有界并发；同一目录最多 4 个 I/O 任务。

## 10. 错误、取消与回退

- 所有异步页面 load/preload 带 generation；旧结果静默丢弃，不覆盖新页面状态。
- 图片预取失败只降级到当前项按需加载，不退出阅读器。
- 视频 next prepare 失败时保留正确封面并允许重试/继续划过，不能回显上一视频。
- SQLite cursor 查询失败保留已有窗口并显示可恢复错误，不清空为“无内容”。
- 导入取消停止新任务，等待已启动文件操作收敛，然后清理本次临时文件。
- 任何模块性能候选若未改善目标指标或破坏正确性，回退该模块，不保留半套状态机。

## 11. 性能与体验门禁

### 首页

- loading 只出现 1 个 skeleton；不含旧加载文案。
- skeleton 与真实卡片 layout bounds 差为 0px。
- 第一张卡壳/标题不得晚于第二张出现。

### 图片

- 中端 Android 连续 fling 30 项：无整页空白、无卡在中间；UI frame p95 < 20ms。
- 连续切换 200 项后，内存不线性增长；空闲/回收后回到峰值前基线的 120% 以内。
- 退出后立即返回，在 epoch 未变化时不做无界全量查询。

### 视频

- 拖动开始时相邻槽已经显示正确封面。
- 落位后不再突然替换封面；prepared 命中时首帧目标 p95 < 150ms。
- 任意时刻只有一个有声音的 player。
- 1×/1.5×/2× 纯音测试输出基频误差 ≤ 1%，并通过语音、音乐、扬声器、有线和蓝牙主观矩阵。

### 聊天

- 20,000 条单线程消息初次只读取最后一页。
- 普通进入消息可见后无 400/700ms 纠正跳动。
- 连续加载 100 页不全量重排，不丢失/重复同时间戳消息。
- streaming、键盘和历史滚动不强制用户回到底部。

### 数据与极端场景

- 100,000 媒体、10,000 IP、20,000 单线程消息的目标查询计划有界。
- 低存储、单个超大视频、500 附件候选、导入取消、应用后台和 Personal 锁定不崩溃且不泄露缓存。

## 12. 模块执行与 review 协议

每个模块严格执行：

```text
读取当前计划与相关代码
→ 写失败测试并确认 RED
→ 最小实现
→ focused tests / typecheck
→ git diff --check + 范围 diff review
→ 对照本 Spec 自审
→ 修正 review 问题
→ 记录证据
→ 进入下一模块
```

Review 检查：需求覆盖、Personal 边界、原图安全、定时器/监听器释放、异步竞态、内存上限、无关改动、测试是否真实捕获回归。

当前工作区包含用户未提交且与目标文件重叠的修改，因此本轮不自动 commit、不 reset、不 stash。每个模块记录文件清单和 diff；待用户后续决定如何提交。

## 13. 分阶段范围

1. 模块 0：基线与图片阅读器编译阻断。
2. 模块 1：首页单 skeleton、共享卡片壳、首卡等成本。
3. 模块 2：视频保音高统一 API。
4. 模块 3：SQLite 索引、cursor API、Scoped LRU 与 epoch。
5. 模块 4：图片阅读器 around-anchor、分层预取、lastViewed 合并和会话恢复。
6. 模块 5：视频三槽手势、player/preload 池、队列虚拟化。
7. 模块 6：聊天普通进入稳定、锚点、预热和附件有界读取。
8. 模块 7：缩略图调度、导入配额、缓存清理有界并发。
9. 模块 8：功能矩阵、压力脚本、全量验证和真机未验证边界。

## 14. 明确不在首轮引入

- 不迁移 Expo Router / navigation stack。
- 不引入 FlashList、Zustand 或第二套数据库只为“看起来更快”。
- 不修改、压缩、裁剪或覆盖原始媒体。
- 不默认语义缓存私人陪伴回复或 Personal 对话。
- 不在 `preservesPitch + Media3/Sonic` 未验证前引入 SoundTouch/Rubber Band。
- 不发布 APK、OTA、tag、push 或远端部署。

## 15. 全面 Review 后补强

首轮完成后的逐文件 review 又确认并修复了 space-scoped media epoch、混合导入共享实际字节账本、Android memory trim + 图片双维像素预算、聊天 around-anchor 单 statement 与 6000 消息 repository benchmark。补强设计、执行顺序和最终证据分别见：

- [`2026-08-20-performance-hardening-followup-design.md`](2026-08-20-performance-hardening-followup-design.md)
- [`2026-08-20-performance-hardening-followup.md`](../plans/2026-08-20-performance-hardening-followup.md)
- [`2026-08-20-performance-hardening-review.md`](../../reviews/2026-08-20-performance-hardening-review.md)
