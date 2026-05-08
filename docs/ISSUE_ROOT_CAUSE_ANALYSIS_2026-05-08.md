# Pixory 问题根因排查记录（2026-05-08）

## 目的

本文件记录当前代码中的问题现状、问题原因、证据、影响范围，以及对应的预期效果，不包含代码修改。

排查范围覆盖以下诉求：

- 混合图片 / 视频压缩包导入导出
- 视频播放器交互问题
- 文件重命名能力覆盖面
- 隐私模式角标遮挡
- 批量滑动选中
- 全部素材 / 批量管理排序
- 待播放列表封面

## 排查方式

- 阅读项目约束和现有规格：`AGENTS.md`、`docs/V2_VIDEO_AND_IMPORT_SPEC.md`、`docs/V2_ACCEPTANCE_CRITERIA.md`
- 对照关键实现文件：视频播放、资源包导入、备份导出、列表筛选、多选、隐私模式入口
- 本次未改代码，未做 Android 真机复现；以下结论以静态代码证据为主，涉及手势冲突的个别点标注为“高概率原因”

## 总结结论

当前项目里有两条容易混淆的链路：

1. `资源包导入 / 压缩包导入`
   这条链路本质上是“把 zip 里的图片识别出来并导入为新图片资产”。

2. `备份 / 恢复`
   这条链路本质上是“复制数据库、原图、缩略图、manifest，并在恢复时还原结构化数据”。

现在的问题是，这两条链路没有真正打通，所以：

- 带视频的压缩包不会被完整导回
- 备份包也不能当作普通资源包重新导入
- 视频播放器很多体验问题并不是单点样式问题，而是交互状态管理方式本身不对

---

## 1. 混合图片 / 视频压缩包不支持回导

### 当前结论

当前“选择资源包”并不支持混合导入。压缩包里如果同时有图片和视频，图片会按图片导入逻辑处理，视频会被跳过。  
如果把单个 IP 导出的资产包手动再压成 zip，再走“选择资源包”导入，也不会按“恢复”处理，只会把能识别成图片的文件当作新图片资产导入，视频、分组、标签、备注、收藏、import batch、manifest 都不会被恢复。

### 直接原因

- `src/services/packageImportService.ts:300-315`
  `importPackageToIp` 遍历解压后的文件时，只调用 `detectImageTypeFromMagicBytes` 识别图片魔数。
- `src/services/packageImportService.ts:320-340`
  识别成功后永远构造 `PickedImageAsset`，并调用 `importSingleImage(...)`。
- `src/services/packageImportService.ts:302-314`
  任何无法识别成图片的文件，都会记为 `skipped`，不会进入视频导入逻辑。

### 根因

资源包导入服务的设计目标就是“图片包导入”，不是“混合媒体资产恢复”。

- 没有视频魔数识别和视频分流
- 没有 manifest 校验和恢复流程
- 没有“图片 / 视频 / 元数据”三类内容的统一包格式解释器

### 影响范围

- 混合图片 / 视频 zip 无法完整导入
- 带视频的导出包无法通过“选择资源包”原样恢复
- 即使压缩包里带有 `manifest.json`、数据库、分组信息，当前资源包导入也会忽略

### 预期效果

- 压缩包里同时有图片和视频时，两类素材都能被正确识别
- 视频不会再被当作未知文件跳过
- 如果导入的是标准 Pixory 资产包，应按资产恢复语义导回，而不是只把图片重新导入一遍
- 导入结果里应清楚区分成功、跳过、失败的图片数和视频数

### 额外证据

- `src/native/pixoryMediaModule.ts:76-77`
  原生 zip 阅读能力接口名就是 `listZipImageEntries` / `extractZipEntryToTemp`，能力边界偏向图片阅读。
- `src/screens/ArchiveReaderScreen.tsx:49`
  临时阅读器读取的是“zip 里的图片条目”，不是混合媒体条目。

---

## 2. 单个 IP 导出包不能直接当资源包回导

### 当前结论

“导出单个 IP 资产包”和“资源包导入”不是同一套协议。  
普通空间的单 IP 导出目前生成的是一个目录型备份包，再复制到系统文件夹；它不是一个可直接被“资源包导入”正确恢复的回导包。

### 直接原因

- `src/screens/BackupScreen.tsx:240-261`
  单个 IP 导出走的是 `createIpBackup(ip.id, 'normal')`。
- `src/services/backupService.ts:339-402`
  `createIpBackup` 生成的是：
  - `database/`
  - `originals/`
  - `thumbnails/`
  - `manifest.json`
- `src/screens/BackupScreen.tsx:421-436`
  UI 文案也明确是“复制 SQLite、manifest、原图和缩略图到默认导出文件夹”。

### 根因

项目已经有“备份结构”和“资源包结构”两种概念，但恢复入口只完成了一部分：

- 普通空间：有导出，缺少对应的恢复入口
- 隐私空间：只有加密 `.pixorypack` 有专门合并导入
- 资源包导入：只适合图片包，不适合数据库级恢复

### 影响范围

- 用户把单 IP 备份目录手动压缩成 zip，再去资源包导入时，会发生“协议错位”
- 最终效果不是恢复，而是“把其中部分图片重新导入一遍”
- 视频不会恢复，元数据也不会恢复

### 预期效果

- 单个 IP 导出包应有清晰、单一的回导方式
- 用户不需要靠“手动压缩后再走资源包导入”这种绕路方式恢复数据
- 如果产品允许回导，回导后应恢复图片、视频、分组、标签、备注、收藏和批次关系
- 如果产品不允许普通资产包回导，入口和文案也应明确区分“备份恢复”和“资源包导入”

### 额外证据

- `src/services/backupService.ts:567-735`
  当前真正带恢复逻辑的是 `importEncryptedPersonalPack(...)`，并且只面向 Personal System 的加密包。
- `src/services/backupService.ts:598-600`
  该恢复逻辑明确限制为 personal 包。
- `App.tsx:192-197`
  从系统“打开方式”进入 `.pixorypack` 时，目前只会进入占位页。
- `App.tsx:1026-1032`
  占位页文案写的是“资源包入口待接入”。

---

## 3. 视频播放器进度条不跟手、会跳、拖动卡手

### 当前结论

这是播放器状态管理方式造成的，不是单纯样式问题。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:241-256`
  进度条拖拽在 `onPanResponderGrant` 和 `onPanResponderMove` 里每次都直接调用 `seekFromTrackLocation(...)`。
- `src/screens/VideoPlayerScreen.tsx:264-270`
  视频区域拖拽同样在每次 move 时直接调用 `seekFromSurfaceDelta(...)`。
- `src/screens/VideoPlayerScreen.tsx:445-454`
  `seekToTime(...)` 每次都会直接写 `player.currentTime = clampedTime`。
- `src/screens/VideoPlayerScreen.tsx:161-166`
  同时，播放器 `timeUpdate` 监听仍在持续把原生时间写回 `currentTime`。

### 根因

拖拽态和播放态没有隔离：

- 没有 `isScrubbing` 之类的状态来阻止 `timeUpdate` 在拖拽期间反向覆盖 UI
- 没有对 seek 请求做节流或降频
- 没有“拖拽时先更新本地 UI，松手后再精确 seek”的两阶段策略
- 没有帧预览或低频预览降级策略

这会导致：

- 手指拖动时，UI 一边被手势更新，一边又被播放器回调覆盖，所以看起来“自己跳”
- 高频 `currentTime` 写入让原生播放器不断 seek，造成卡顿和暂停 / 恢复感

### 额外证据

- `src/screens/VideoPlayerScreen.tsx:73`
  `timeUpdateEventInterval = 0.25`，说明正常播放刷新是固定间隔；但拖拽时没有独立机制。
- `docs/V2_VIDEO_AND_IMPORT_SPEC.md:189-196`
  规格明确要求“seek 请求必须节流，不能每个手势事件都 seek”，当前实现与规格相反。
- `docs/V2_ACCEPTANCE_CRITERIA.md:118`
  验收失败标准里明确写了“拖拽时每次手势都明显触发卡顿 seek”，当前实现正是这样。

### 预期效果

- 手指拖到哪里，进度 UI 就稳定跟到哪里
- 拖动过程中不出现“自己跳回去”或来回抖动
- 拖拽时播放器不应因为高频 seek 明显卡顿
- 松手后播放器应稳定跳到目标时间继续播放或保持用户期望的状态

---

## 4. 拖动进度条时视频帧不跟着变化

### 当前结论

当前实现没有真正的“拖拽预览帧”设计，只是在 move 期间粗暴改 `currentTime`。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:445-454`
  只有统一的 `seekToTime(...)`，没有“预览帧更新”与“最终 seek”分离。
- `src/screens/VideoPlayerScreen.tsx:241-270`
  两种拖拽都只是在连续写时间，没有任何原生帧预览控制或降级策略。

### 根因

代码把“拖拽交互”和“正式 seek”混成了一个动作。  
这在视频播放器里通常不够用，因为原生解码器未必能在每个手势事件都稳定地渲染目标帧。

### 额外证据

- `docs/V2_VIDEO_AND_IMPORT_SPEC.md:195-196`
  规格要求“当前帧预览优先使用原生能力；不稳定时可低频 seek 或预生成关键帧降级。松手后执行准确 seek。”当前未实现。

### 预期效果

- 拖拽时画面应能体现当前位置变化
- 即使无法逐帧完全实时，也应有足够可感知的预览反馈
- 预览与正式 seek 应分阶段处理，不牺牲整体流畅度

---

## 5. 进度条热区过小

### 当前结论

这是纯实现尺寸问题。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:609-617`
  可拖拽区域就是 `progressTrack` 本身。
- `src/screens/VideoPlayerScreen.tsx:767-786`
  样式里：
  - 轨道高度只有 `6`
  - 圆点高度只有 `14`
  - 没有额外 `hitSlop`
  - 没有外层透明触控热区

### 根因

进度条的视觉尺寸和可触控尺寸没有拆开设计，导致细控件同时承担点击命中职责。

### 预期效果

- 用户不需要非常精准地点中细线才能拖动
- 即使视觉上进度条很细，实际可点击和可拖拽热区也应足够大
- 单手操作时更容易命中和拖动

---

## 6. 视频区域拖动不稳定 / 无法拖动

### 当前结论

从代码上看，这是一个高概率手势冲突问题。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:261-274`
  `surfacePanResponder` 只有在“水平位移大于 8 且大于垂直位移”时才会接管。
- `src/screens/VideoPlayerScreen.tsx:507-526`
  同一个 `Pressable` 同时承担：
  - `panHandlers`
  - `onPress`
  - `onLongPress`
  - `onPressOut`
  - 子节点还是 `VideoView`

### 根因

视频页把点击、长按加速、水平拖动、播放器原生视图展示都压在同一触摸层上，但没有独立手势仲裁层。

这容易造成：

- 轻微拖动不满足阈值，拖拽不启动
- `Pressable` 与 `PanResponder` 行为互相干扰
- 原生视频视图区域在某些设备上吞掉部分手势

### 备注

这一条最好在 Android 真机上再做一次定向确认，但从当前代码结构看，问题来源已经很集中。

### 预期效果

- 在视频区域左右滑动时，拖拽应稳定触发
- 点击、长按、拖拽三种手势的优先级应清晰，不互相抢手势
- 不同 Android 设备上都应保持大体一致的可用性

---

## 7. 长按加速 3 秒后进入沉浸模式时，加速提示会消失

### 当前结论

这是控件显隐逻辑绑得太死导致的。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:18`
  自动隐藏时间写死为 `3000ms`。
- `src/screens/VideoPlayerScreen.tsx:361-368`
  `resetHideTimer()` 到时后直接 `setControlsVisible(false)`。
- `src/screens/VideoPlayerScreen.tsx:528-636`
  顶部栏、底部栏、加速提示都被包在 `controlsVisible ? (...) : null` 里。
- `src/screens/VideoPlayerScreen.tsx:535-540`
  长按加速提示 `holdSpeedBadge` 还被放在顶部标题栏内部。

### 根因

“沉浸模式”和“播放控制临时浮层”没有拆成两个层级：

- 当前代码把“需要隐藏的控件”和“长按加速状态提示”都绑在 `controlsVisible` 上
- 所以只要自动沉浸触发，加速提示就会一起消失

### 影响范围

- 无法实现“进入沉浸模式但保留长按加速反馈”
- 也无法按需求把加速小按钮独立移到底部居中区域

### 预期效果

- 自动进入沉浸模式后，长按加速状态仍应有可见反馈
- 加速提示应独立于普通控件显隐逻辑
- 加速提示位置应满足你提出的“底部居中、不要挤在标题栏”的目标

---

## 8. 自动沉浸时间是 3 秒，不是 5 秒

### 当前结论

这是硬编码常量导致的。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:18`
  `CONTROL_HIDE_DELAY_MS = 3000`

### 根因

播放器没有抽出统一的沉浸配置，直接在页面内硬编码。

### 预期效果

- 无操作自动沉浸时间应改为 5 秒
- 该时间最好成为可维护的配置值，而不是散落硬编码

---

## 9. 视频播完后不会自动回到开头重播

### 当前结论

当前播放器没有实现循环播放。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx`
  页面里没有任何 `ended` / `playToEnd` 监听，也没有看到 `loop` / `isLooping` 设置。
- `src/screens/VideoPlayerScreen.tsx:421-428`
  播放 / 暂停只处理手动切换。

### 根因

播放结束事件未接入，播放器状态机只覆盖了“加载、播放、暂停、切视频”，没有覆盖“播完后的行为策略”。

### 预期效果

- 视频播放结束后应自动回到开头继续播放
- 循环过程不应闪退到暂停态，也不应卡在结尾帧

---

## 10. 点一下呼出信息，再点一下不会消失；进度条显隐没有动画

### 当前结论

当前点击逻辑只支持“显示控件”或“双击切换播放”，不支持“单击切换显隐”。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:430-439`
  `handleSurfacePress()`：
  - 双击时调用 `togglePlay()`
  - 单击时只会 `showControls()`
  - 没有“如果已显示则隐藏”的分支
- `src/screens/VideoPlayerScreen.tsx:528-636`
  控件区域是纯条件渲染，没有动画容器

### 根因

- 控件显隐被做成了离散布尔值切换，没有过渡层
- 页面没有引入 `Animated`、`LayoutAnimation`、`Reanimated` 之类的进入 / 退出动画机制

### 附带表现

- 进度条“浮上来再沉下去”的动效目前不存在
- 整体会显得“突然出现 / 突然消失”

### 预期效果

- 单击视频区域时，控件应在“显示 / 隐藏”之间切换
- 控件显隐应带有柔和过渡动画，而不是硬切
- 进度条和底部控制区的进入退出应更轻、更自然

---

## 11. 进度条样式偏粗，不符合现在的细线视觉

### 当前结论

这是当前静态样式与目标设计不一致。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:767-786`
  当前进度条是：
  - `6px` 轨道
  - 实心填充
  - `14px` 圆形 knob

### 根因

现有播放器样式仍是“传统控制条”写法，没有把视觉轨道与触控热区分离，所以很难在保持细线观感时又保留大热区。

### 预期效果

- 视觉上应更接近一根细灰线 + 主题色已播放线
- 手感保持好用，但观感更轻、更精致
- 不需要靠大圆点来表达可拖拽性

---

## 12. 视频播放页进入后默认暂停，不会自动播放

### 当前结论

这是当前加载完成后的显式暂停逻辑造成的，不是播放器默认行为。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:130-146`
  换源后先 `safePausePlayer()`，再 `setIsPlaying(false)`。
- 同一段逻辑里没有在加载完成后主动 `play()`。

### 根因

页面把“安全加载”处理成了“加载后保持暂停”，没有区分：

- 首次进入播放器是否应自动播放
- 从上次播放位置恢复时是否自动继续

### 预期效果

- 进入视频播放页后应默认自动播放
- 从历史进度恢复时，也应在恢复位置自动开始播放

---

## 13. 图片、视频、导出包、文件夹的重命名支持不完整

### 当前结论

当前项目里只有“图片元数据改名”是部分支持的，而且只是改数据库展示名，不改实际存储文件名。  
视频、导出包、导出目录、内部资产目录，都没有完整重命名能力。

### 13.1 图片重命名

#### 现状

- `src/screens/EditImageScreen.tsx:117-123`
  保存时调用 `imageRepository.updateMetadata(...)`
- `src/screens/EditImageScreen.tsx:176`
  页面文案直接写了“仅更新元数据，不改动原图文件。”

#### 根因

图片“重命名”目前只等于更新 `originalFilename` 字段，不涉及：

- `internalFilename`
- `originalFileUri`
- 缩略图文件名
- 导出目录中的现有文件名

#### 预期效果

- 用户修改图片文件名后，至少产品层面要清楚区分“只改显示名”还是“同时改物理文件名”
- 如果支持真正重命名，应连同相关路径和引用一起保持一致

### 13.2 视频重命名

#### 现状

- `src/screens/VideoDetailScreen.tsx:90-105`
  视频更多菜单只有“保存本地”和“移入回收站”
- `App.tsx:984-1003`
  视频详情只提供播放入口，没有编辑入口
- 全项目没有 `EditVideoScreen`

#### 根因

视频资产虽然和图片共用 `image_assets` 表，但产品流里没有接入“视频编辑 / 改名”页面。

#### 预期效果

- 视频应和图片一样具备可发现的重命名入口
- 用户不需要通过外部导出再改名的方式绕行

### 13.3 导出压缩包 / 导出文件夹重命名

#### 现状

- `src/services/backupService.ts:253-258`
  备份目录名由前缀和时间戳自动生成
- `src/services/backupService.ts:502-503`
  加密包名自动生成 `${prefix}_${timestamp}.pixorypack`
- `src/services/backupService.ts:533-534`
  全量加密包同样自动命名
- `src/screens/BackupScreen.tsx`
  没有任何“导出前命名 / 导出后重命名”UI

#### 根因

导出流程是“生成固定结构 -> 复制到系统目录”，没有独立的导出命名模型。

#### 预期效果

- 用户导出压缩包或目录时，应能更清楚地控制导出名称
- 导出结果名称应可读，而不只是时间戳

### 13.4 文件夹重命名

#### 现状

- 项目约定的本地结构是 `ip_{ipId}` 固定目录
- 代码里大量路径都按 `ip_{id}` 拼接，例如：
  - `src/services/backupService.ts:286-287`
  - `src/services/videoImportService.ts:145-146`

#### 根因

内部目录是稳定存储标识，不是用户可编辑名称。  
这有利于可靠性，但也意味着当前没有任何“用户改名后同步重命名物理文件夹”的设计。

#### 预期效果

- 应明确“用户命名”与“内部稳定目录名”的边界
- 如果不支持改内部文件夹，也应让用户在产品层面能改显示名称而不困惑

---

## 14. 隐私模式右下角图标遮挡界面

### 当前结论

这是固定定位导致的遮挡。

### 直接原因

- `App.tsx:1246-1249`
  解锁隐私模式后会渲染 `personalBanner`
- `App.tsx:1285-1294`
  `personalBanner` 使用 `position: 'absolute'`，固定在 `bottom/right`

### 根因

隐私模式提示被设计成全局悬浮徽标，但没有避让底部操作区，也没有根据页面布局切换位置。

### 预期效果

- 隐私模式标识不应遮挡页面主要操作区
- 位置应改到更不干扰的区域，比如右上角

---

## 15. 批量滑动选中没有覆盖到“全部素材”场景

### 当前结论

滑动批量选中目前只接到了“批量管理”页，没有接到“全部素材”等素材列表页。

### 直接原因

- `src/screens/BatchManageImagesScreen.tsx:138-147`
  只有这里用了 `useSwipeGridSelection(...)`
- `src/screens/BatchManageImagesScreen.tsx:803-817`
  只有这里把 `panHandlers`、`registerItemLayout`、`beginSwipeSelection` 真正接到网格项上
- `src/screens/AllImagesScreen.tsx:146`
  “全部素材”只用了 `useImageMultiSelect(...)`
- `src/screens/FavoritesScreen.tsx:94`
  收藏页同样只用了 `useImageMultiSelect(...)`
- `src/screens/RecentViewedScreen.tsx:43`
  最近查看页同样如此
- `src/screens/GroupImagesScreen.tsx:133`
  分组页同样如此
- `src/screens/TagResultScreen.tsx:133`
  标签页同样如此

### 根因

项目里已经有“滑动批选 hook”，但它目前还是局部接入状态，没有下沉成通用网格多选能力。

### 备注

`useSwipeGridSelection` 还额外限制了只对 `mediaType === 'image'` 生效：

- `src/hooks/useSwipeGridSelection.ts:37`

这和规格“视频不进入图片专属批量管理”是一致的，但也说明它不是一个“全素材通用选中系统”。

### 预期效果

- 全部素材、收藏、分组、标签、最近查看等图片网格页都应支持滑动批量选中
- 同一套交互手感应尽量一致
- 视频仍可按产品规则排除在图片专属批选之外

---

## 16. 全部素材 / 批量管理缺少排序能力，且仓储层能力也不够

### 当前结论

这个问题不只是 UI 没做，底层排序枚举也不够支撑“按时间 / 名称 / 大小，升序 / 降序”的完整需求。

### 直接原因

- `src/database/types.ts:275`
  当前排序类型只有：
  - `createdAtDesc`
  - `lastViewedAtDesc`
  - `deletedAtDesc`
- `src/database/repositories/imageRepository.ts:56-66`
  SQL `ORDER BY` 也只实现了这三种

### 页面层证据

- `src/screens/AllImagesScreen.tsx:94-107`
  全部素材只在“最近查看”筛选开启时传 `lastViewedAtDesc`，其他时候走默认创建时间倒序
- `src/screens/GroupImagesScreen.tsx:85-95`
  分组页同样如此
- `src/screens/TagResultScreen.tsx:79-90`
  标签页同样如此
- `src/screens/BatchManageImagesScreen.tsx:83-100`
  批量管理页直接读 `findByIpId / findByGroupId / findByImportBatchId / findByIds`，没有排序控制 UI

### 根因

排序能力现在是“为少量固定场景硬编码的查询参数”，还没有演化成：

- 统一排序模型
- 列表页可选排序 UI
- 名称 / 大小 / 时间的双向排序

### 影响范围

- “全部素材”不能按名称 / 大小排序
- “批量管理”不能按名称 / 大小 / 时间升降序排序
- 即使前端临时加一个排序按钮，仓储层现在也不够用

### 预期效果

- 全部素材和批量管理都应支持按时间、名称、大小排序
- 每个维度都应支持升序 / 降序
- 查询层和 UI 层都应共享统一排序模型

---

## 17. 待播放列表没有封面图

### 当前结论

这是纯 UI 未使用现有数据的问题，不是数据层缺失。

### 直接原因

- `src/screens/VideoPlayerScreen.tsx:575-585`
  待播放面板每一行只渲染：
  - 播放图标
  - 文件名
  - 时长
- 没有使用任何缩略图组件

### 数据层证据

- `src/database/types.ts:307`
  `ImageListItem` 本身就是列表展示模型
- `src/components/ThumbnailTile.tsx:10`
  普通素材卡片已经依赖 `thumbnailFileUri`
- `src/database/repositories/assetRepository.ts:33-35`
  待播放列表数据来自 `findQueueVideosByIpId(...)`
- `src/database/repositories/imageRepository.ts`
  列表查询模型本来就包含 `thumbnailFileUri`

### 根因

待播放列表的 UI 实现偷简了，只用了文本行，没有复用现成的缩略图信息。

### 预期效果

- 待播放列表中每个视频都应带封面缩略图
- 用户能更快识别要切换到哪个视频

---

## 18. “选择导入视频”进入了文件管理器，而不是相册 / 媒体库视频页

### 当前结论

这是当前选择器能力选错了，不是系统偶发行为。  
现在导入视频用的是“文档选择器”思路，所以 Android 会优先打开文件管理器；这和导入图片走媒体库选择器的体验不一致，也确实不够友好。

### 直接原因

- `src/services/videoImportService.ts:254-259`
  `pickVideosForImport()` 直接调用的是 `DocumentPicker.getDocumentAsync(...)`
- 同一段里传入的是：
  - `multiple: true`
  - `type: ['video/*']`
- `src/screens/ImportImagesScreen.tsx:138-155`
  导入页的“选择视频”按钮最终就是走这个 `pickVideosForImport()`

### 额外证据

- `src/screens/ImportImagesScreen.tsx:510`
  按钮文案写的是“正在打开文件选择…”
- `src/screens/ImportImagesScreen.tsx:512`
  提示文案写的是“从系统文件中选择视频”
- `src/services/imageImportService.ts:405-415`
  相比之下，图片导入走的是 `expo-image-picker` 的 `launchImageLibraryAsync(...)`，更接近用户理解中的“相册选择”

### 根因

视频导入链路当前是按“拿到任意本地视频 URI 即可导入”的工程思路实现的，优先选择了 `DocumentPicker`：

- 优点是 URI 来源更宽，文件管理器、下载目录、第三方文档提供者都能选
- 代价是入口体验会偏“文件系统”，不偏“媒体库”

也就是说，这不是单个机型兼容问题，而是产品入口策略本身决定的结果。

### 影响范围

- 用户点击“选择视频”时，容易被带到文件管理器而不是相册视频页
- 和“选择图片”的交互风格不一致
- 对主要从相册导入视频的用户来说，操作路径更绕，认知负担更高

### 预期效果

- 选择导入视频时，应优先进入用户熟悉的媒体库 / 相册视频视图
- 与图片导入入口的体验保持一致

### 与需求的偏差

如果产品希望“导入视频”默认进入相册 / 媒体库的视频视图，那么当前实现方向就是错位的：  
它实现的是“文件导入”，不是“媒体库视频导入优先”。

---

## 19. 分享保存到 IP 面板缺少“新建 IP”、多图滑动预览和点击放大

### 当前结论

当前分享保存页是一个简化保存面板，只支持从已有普通模式 IP 里选一个目标，然后可选分组和标签。  
它没有“新建 IP”入口，也没有把多图预览做成可滑动、可点击放大的预览器。

### 19.1 没有“新建 IP”选项

#### 直接原因

- `src/screens/ShareCollectScreen.tsx:223-239`
  当有 IP 时，界面只渲染已有 IP 列表。
- `src/screens/ShareCollectScreen.tsx:131-133`
  如果没选中 IP，只会提示“请先创建一个普通模式 IP”。
- `src/screens/ShareCollectScreen.tsx:223-230`
  当 `ips.length === 0` 时，空状态只有“关闭”，没有“新建 IP”动作。

#### 根因

分享保存页当前只实现了“选择已有 IP”，没有把“创建 IP 并继续保存”接到分享流里。  
这和外部视频保存页的能力不一致，因为外部视频页已经有：

- `src/screens/VideoPlayerScreen.tsx:640-671`
  “新建 IP 并保存”

### 19.2 多图预览不能滑动查看更多

#### 直接原因

- `src/screens/ShareCollectScreen.tsx:209-221`
  预览区只是一个普通 `View`
- 同一段里只渲染 `shareItems.slice(0, 6)`

#### 根因

预览区被实现成了“静态缩略图摘要”，不是“可浏览预览条”。

### 19.3 点击图片不能放大预览

#### 直接原因

- `src/screens/ShareCollectScreen.tsx:209-221`
  每个预览 tile 都只是普通 `View`，没有 `Pressable`
- 没有接任何图片查看器、弹层、缩放组件或全屏预览路由

#### 根因

分享保存页把预览视为“辅助确认”，没有把它当成真实可交互预览器来实现。

### 19.4 现在还保留了 Group 和 标签，导致面板变重、卡片更大

#### 直接原因

- `src/screens/ShareCollectScreen.tsx:242-250`
  单独渲染了 `Group` 区块
- `src/screens/ShareCollectScreen.tsx:252-265`
  单独渲染了“标签”输入区块
- `src/screens/ShareCollectScreen.tsx:154-166`
  保存时会把 `selectedGroupId` 和 `tagNames` 一并传给图片 / 视频导入逻辑

#### 根因

分享保存页当前走的是“导入表单思路”，不是“快速收集到某个 IP”的轻量流程。  
因此它天然会更高、更重，也更不适合在分享场景里快速完成。

### 19.5 面板高度和视觉重量偏大

#### 直接原因

- `src/screens/ShareCollectScreen.tsx:284-294`
  `sheet` 设置了较大的上下留白和 `maxHeight: '86%'`
- `src/screens/ShareCollectScreen.tsx:233-265`
  IP、Group、标签三个区块连续堆叠
- `src/screens/ShareCollectScreen.tsx:352-355`
  `optionList` 还预留了较大的列表高度

#### 根因

不是单个 padding 的问题，而是页面信息架构偏“完整导入配置”。  
如果需求改成“只保留 IP 选择”，那面板自然会明显变小。

### 影响范围

- 分享保存路径比预期更慢
- 用户无法在分享入口里直接新建目标 IP
- 多图时只能看到前 6 张摘要，不利于确认
- 点缩略图不能放大检查内容，分享前确认能力不足
- Group / 标签在分享场景里提高了认知负担

### 预期效果

- 分享保存面板中应能直接新建 IP
- 多图时应可左右滑动预览更多素材
- 点击缩略图应支持放大查看
- 分享场景下可简化为只选 IP，减少 Group / 标签负担
- 面板应更紧凑、更适合快速保存

---

## 20. 分组页左上角“全部 IP”不是可切换下拉；分组长按缺少“添加图片 / 视频”

### 20.1 左上角“全部 IP”只是静态标签，不是筛选下拉

#### 当前结论

全局分组页左上角现在只是一个静态文案 pill，没有任何状态、下拉或筛选能力。

#### 直接原因

- `src/screens/GlobalGroupsScreen.tsx:101-103`
  页面直接渲染 `Text style={styles.scopePill}>全部 IP</Text>`
- `src/screens/GlobalGroupsScreen.tsx:42-52`
  页面只有 `groups` 数据，没有“当前选中 IP”这类状态
- `src/screens/GlobalGroupsScreen.tsx:42-44`
  数据查询固定走 `groupRepository.findOverview(db)`，即全量分组总览

#### 根因

全局分组页当前被设计成“总览页”，不是“可切换 IP 作用域的分组浏览页”。

### 20.2 分组长按没有“添加图片 / 添加视频”入口

#### 当前结论

虽然分组天然绑定在 IP 下，但全局分组页的长按菜单只提供查看 / 封面 / 编辑 / 置顶 / 删除，没有导入素材入口。

#### 直接原因

- `src/screens/GlobalGroupsScreen.tsx:133-151`
  长按 action sheet 只有：
  - `查看图片`
  - `选择封面 / 更换封面`
  - `编辑分组`
  - `置顶分组`
  - `删除分组`
- `App.tsx:1136-1142`
  `GlobalGroupsScreen` 注入的 props 里也没有 `onImportImages` 或类似“添加素材到该分组”的回调

#### 根因

全局分组页目前被实现为“分组浏览 / 管理入口”，没有被视作“分组即导入目标”的快捷入口。

### 影响范围

- 用户无法先按 IP 缩小分组范围
- 进入分组后若想往该分组直接加图片 / 视频，还得再绕回 IP 的导入流程

### 预期效果

- 左上角应成为可切换 IP 的下拉筛选，默认“全部 IP”
- 分组长按菜单里应能直接进入“往该分组添加图片 / 视频”的流程
- 因为分组绑定在 IP 下，导入路径应自然继承该 IP 和该分组上下文

---

## 21. 个人主页本地空间只显示原图存储，没有单独视频存储

### 当前结论

“我的”页现在只有一个合计的原始素材存储数字，没有把图片原图和视频文件拆开显示。

### 直接原因

- `src/screens/MeScreen.tsx:39`
  统计字段只有 `totalOriginalBytes`
- `src/screens/MeScreen.tsx:104-113`
  页面只查询一次 `imageRepository.sumFileSize(db, { includeDeleted: true })`
- `src/screens/MeScreen.tsx:246-252`
  UI 只展示“本地原图存储”

### 根因

个人页存储统计模型过于粗，只保留了“全部原始文件总大小”，没有拆出：

- 图片原图存储
- 视频原文件存储

### 备注

这里的 `sumFileSize(...)` 是支持按 `mediaType` 过滤的，只是 Me 页没有去拆分调用。

### 预期效果

- 个人主页应分别显示图片原图存储和视频存储
- 视频存储可放在“本地原图存储”后面，帮助用户更直观看到空间去向

---

## 22. IP 封面 / IP 信息把视频当图片；也没有显示 IP 占用空间

### 22.1 IP 卡片把素材总数写成“张图片”

#### 当前结论

IP 卡片文案会把当前 IP 下所有素材都写成“张图片”，即使其中包含视频。

#### 直接原因

- `src/components/IPCard.tsx:54`
  卡片文案固定写的是 ``${ip.imageCount} 张图片 · ...``
- `src/database/repositories/ipRepository.ts:36`
  `imageCount` 的 SQL 统计是：
  `COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL THEN image_assets.id END)`
- 上面这个统计没有按 `mediaType = 'image'` 过滤，所以视频也算进去了

#### 根因

`IpListItem` 当前只有一个聚合字段 `imageCount`，但这个字段实际语义已经变成“素材总数”，UI 却仍按“图片数”解释。

### 22.2 只显示图片数，不显示视频数

#### 当前结论

IP 卡片数据模型里没有独立的 `videoCount`，所以 UI 无法实现“有视频时显示多少视频，没有视频就不显示”。

#### 直接原因

- `src/database/types.ts:43-48`
  `IpListItem` 只有：
  - `imageCount`
  - `groupCount`
  - `coverThumbnailFileUri`
  - `coverSource`
- 没有 `videoCount`

#### 根因

IP 列表聚合模型仍停留在“图片资产时代”，没有升级为混合媒体统计模型。

### 22.3 IP 卡片没有显示该 IP 占用的本地存储空间

#### 当前结论

当前 IP 列表数据和卡片 UI 都没有 IP 级别存储占用字段，所以无法展示“这个 IP 占了多少空间”。

#### 直接原因

- `src/database/types.ts:43-48`
  `IpListItem` 没有 `totalBytes` 或类似字段
- `src/database/repositories/ipRepository.ts:24-70`
  IP 列表查询也没有聚合 `SUM(fileSize)`
- `src/components/IPCard.tsx:47-62`
  卡片文案只显示名称和数量，不显示存储占用

#### 根因

IP 列表聚合只覆盖了数量型指标，没有覆盖容量型指标。

### 影响范围

- 用户会误以为视频也被算作“图片”
- IP 卡片无法反映视频占比
- 用户无法直接判断哪个 IP 最占空间

### 预期效果

- IP 卡片应分别展示图片数和视频数
- 没有视频时可只显示图片数；有视频时再补充视频数
- IP 卡片应显示该 IP 占用的存储空间
- 文案不能再把视频素材误写成“图片”

---

## 23. 隐私模式密码输入框没有“显示密码”切换

### 当前结论

隐私模式入口和修改密码弹层里的所有密码输入框目前都是固定隐藏，没有显示 / 隐藏切换按钮。

### 直接原因

- `src/components/PersonalUnlockModal.tsx:113-130`
  主密码和确认密码输入框都直接写了 `secureTextEntry`
- `src/components/PersonalUnlockModal.tsx:180-195`
  修改密码弹层里的“当前密码 / 新密码”也都是 `secureTextEntry`
- 整个组件里没有任何 `showPassword` / `toggleVisibility` 状态

### 根因

组件按“默认隐藏密码”的基础表单实现了输入，但没有补齐移动端常见的可视化开关。

### 预期效果

- 用户应可在隐私模式入口里切换显示 / 隐藏密码
- 创建密码、输入密码、改密码三个场景都应保持一致

---

## 24. 全局搜索：部分历史功能已存在，但确认删除、搜索建议和更完整联想缺失

### 24.1 空输入时显示搜索历史：这部分其实已经做了

#### 当前结论

这条当前是“部分已满足”的，不是完全缺失。

#### 直接证据

- `src/screens/GlobalSearchScreen.tsx:84`
  `showHistory = !keyword && searchHistory.length > 0`
- `src/screens/GlobalSearchScreen.tsx:140-146`
  为空关键词时会渲染 `SearchHistoryList`
- `src/screens/GlobalSearchScreen.tsx:86-98`
  页面加载时会读取历史记录

### 24.2 长按删除历史：这部分也已经做了

#### 直接证据

- `src/screens/GlobalSearchScreen.tsx:200-207`
  历史 pill 支持 `onLongPress={() => onDeleteItem(item)}`
- `src/services/searchHistoryService.ts:44-49`
  `removeSearchHistoryItem(...)` 已实现

### 24.3 清空历史按钮：这部分也已经做了，但没有确认弹窗

#### 直接证据

- `src/screens/GlobalSearchScreen.tsx:193-197`
  右上角已有“清空全部”按钮
- `src/screens/GlobalSearchScreen.tsx:121-124`
  点下去会直接 `setSearchHistory([])` 并执行 `clearSearchHistory(space)`
- `src/services/searchHistoryService.ts:51-53`
  `clearSearchHistory(...)` 会直接删存储

#### 当前缺口

没有任何 `AppDialog` 或确认流程。  
也就是说，“清空全部”是立即生效的。

#### 预期效果

- 清空全部历史前应弹确认框
- 长按删除单条历史时，也可以考虑加入确认或更明确反馈

### 24.4 搜索建议：当前没有实现

#### 直接原因

- `src/screens/GlobalSearchScreen.tsx`
  页面只有：
  - 历史记录
  - 真正搜索后的结果区
- 没有“输入中联想建议”的单独数据源、状态和展示区
- `src/services/searchHistoryService.ts`
  只负责历史，不负责建议

#### 根因

当前全局搜索是“历史 + 实际搜索结果”的二段式结构，不是“输入联想 + 结果”的即时建议模型。

#### 预期效果

- 用户输入过程中应能看到搜索建议
- 建议可来自历史、前缀命中、常用标签 / IP / 分组等

### 24.5 模糊查询：当前有基础支持，但不是完整建议式搜索

#### 当前结论

基础模糊搜索其实已经存在，但主要是 SQL `LIKE` 和前端 `includes` 级别。

#### 直接证据

- `src/database/repositories\imageRepository.ts:216-245`
  图片搜索会查：
  - `originalFilename LIKE`
  - `note LIKE`
  - `ips.name LIKE`
  - 标签名 `LIKE`
  - 分组名 `LIKE`
- `src/database/repositories\ipRepository.ts:136-141`
  IP 搜索也用了 `LIKE`
- `src/screens/GlobalSearchScreen.tsx:64-65`
  分组 / 标签筛选是前端 `toLowerCase().includes(...)`

#### 当前缺口

- 没有“你是不是想搜 ...”式建议
- 没有热门 / 最近 / 前缀联想混排
- 没有基于输入过程的建议列表

#### 预期效果

- 模糊查询不仅要能搜到结果，还应给出更智能的联想和建议
- 输入少量字符时也应快速出现可点击建议项

### 影响范围

- 搜索历史的基础体验已经在，但删除风险提示不够
- 用户在输入阶段看不到建议，只能等结果
- 当前搜索更像“模糊匹配查询”，不是“完整搜索体验”

---

## 25. 图片阅读器没有沉浸式阅读切换，信息默认常驻且无过渡

### 当前结论

图片阅读器现在默认一直显示顶部栏和底部信息栏，没有“点一下进入沉浸式，再点一下显示信息”的交互，也没有浮上 / 下沉过渡。

### 直接原因

- `src/screens/ImageViewerScreen.tsx:189-209`
  顶部栏始终渲染
- `src/screens/ImageViewerScreen.tsx:256-275`
  底部栏在有 `activeImage` 时始终渲染
- 整个页面里没有 `controlsVisible`、`immersiveMode` 或类似状态
- 页面里也没有任何 `onPress` 用来切换信息层显隐

### 根因

图片阅读器目前是“静态信息常驻版式”，还没有进入“阅读器交互层”设计：

- 没有沉浸态状态机
- 没有单击切换显隐逻辑
- 没有进入 / 退出动画容器

### 预期效果

- 默认进入图片阅读器时显示信息层
- 单击图片区域后切换到沉浸式阅读，只保留图片内容
- 再次单击时，信息层应以柔和动画浮上 / 下沉，而不是硬切

---

## 26. 图片阅读器没有进度条，不能点击或拖动跳页

### 当前结论

图片阅读器现在只有顶部 `当前序号 / 总数` 文本，没有底部细线进度条，也没有点击 / 滑动进度条跳转页码的能力。

### 直接原因

- `src/screens/ImageViewerScreen.tsx:111-117`
  当前页信息只被组织成 `counterLabel`
- `src/screens/ImageViewerScreen.tsx:198-200`
  顶部只显示 `counterLabel` 文本
- `src/screens/ImageViewerScreen.tsx:542-580`
  底部栏只有文件名和收藏 pill，没有进度条样式
- 页面里没有任何与 `progress`、`jumpToIndex` 对应的控件逻辑

### 根因

图片阅读器的分页能力完全依赖 `FlatList` 横向翻页，没有额外做“可视化页码导航层”。

### 预期效果

- 底部应新增一条细线进度条
- 点击或拖动进度条时，应跳到对应图片页
- 进度条右侧应显示 `当前序号 / 总页数`
- 视觉上保持细线，但实际触控热区要足够大

---

## 27. 图片阅读器双击放大 / 复原是瞬间变化，没有缩放过渡

### 当前结论

双击缩放能力是有的，但当前是直接跳变，不带缩放动画过渡。

### 直接原因

- `src/screens/ImageViewerScreen.tsx:342-345`
  双击时直接执行 `updateScale(scale > 1.01 ? 1 : DOUBLE_TAP_ZOOM_SCALE)`
- `src/screens/ImageViewerScreen.tsx:316-325`
  `updateScale(...)` 直接 `setScale(clampedScale)`，没有动画过程

### 根因

缩放状态目前只是普通 React state 赋值，不是动画驱动的缩放变换。

### 预期效果

- 双击放大和双击复原都应带有平滑缩放过渡
- 视觉上应更像“镜头推近 / 拉远”，而不是瞬间切换倍率

---

## 28. 图片阅读器右下角“未收藏 / 已收藏”不能直接切换收藏状态

### 当前结论

右下角收藏状态现在只是展示，不可点击切换。

### 直接原因

- `src/screens/ImageViewerScreen.tsx:266-273`
  收藏区渲染的是普通 `View style={styles.favoritePill}`
- 没有 `Pressable`
- 页面里也没有任何 `toggleFavorite`、`updateMetadata(...isFavorite...)` 或类似收藏切换函数

### 根因

阅读器把收藏状态当作只读信息展示，而不是快捷操作入口。

### 预期效果

- 点击右下角“未收藏 / 已收藏”后，应直接切换收藏状态
- 图标和文字应同步更新
- 不需要退出阅读器再去详情页改收藏

---

## 29. 图片一键逆序后，当前图片保持不变；但预期是当前位置保持不变

### 当前结论

当前“一键逆序”的实现语义是“反转数组后，继续停留在原来的那张图片上”。  
你的预期语义是“反转数组后，继续停留在原来的那个位置上”，因此当前行为会让你感觉“顺序变了，但我看到的还是原来那张”。

### 直接原因

- `src/screens/ImageViewerScreen.tsx:148-166`
  逆序逻辑里先取：
  - `currentImageId = currentImages[activeIndex]?.id`
- 然后反转数组：
  - `nextImages = [...currentImages].reverse()`
- 再通过 `findIndex(image.id === currentImageId)` 找到这张原图在新数组里的位置，并跳过去

### 根因

当前实现是“按当前图片 ID 锚定”，而不是“按当前页索引锚定”。  
所以：

- 原来第 1 张图片，在逆序后会被定位到第 50 位
- 画面继续显示这张图本身
- 而不是显示逆序后的第 1 张

### 影响范围

- 逆序后用户感知为“图片没换，只是序号概念变了”
- 与阅读器里“我当前在第几页”的直觉不一致

### 预期效果

- 如果当前在第 `n` 个位置，逆序后仍应停留在逆序结果里的第 `n` 个位置
- 例如原顺序 `1-50`，在第 1 张点逆序后，应显示原来的 `50`
- 换句话说，应保持“当前位置”不变，而不是保持“当前图片”不变

---

## 与现有规格的主要偏差

以下需求在现有规格里已经写过，但实现没有跟上：

- 资源包 / 备份恢复要区分 `image` 和 `video`
  - `docs/V2_VIDEO_AND_IMPORT_SPEC.md:398-402`
  - `docs/V2_ACCEPTANCE_CRITERIA.md:207-217`
- 视频拖拽必须节流，不能每个手势事件都 seek
  - `docs/V2_VIDEO_AND_IMPORT_SPEC.md:189-196`
  - `docs/V2_ACCEPTANCE_CRITERIA.md:102-106`
- 视频区域应该可直接左右拖动
  - `docs/V2_VIDEO_AND_IMPORT_SPEC.md:191-196`
- 待播放要从右下角展开，且列出当前 IP 下其他视频
  - `docs/V2_VIDEO_AND_IMPORT_SPEC.md:214-220`
  - 现在虽然能展开，但展示信息不完整，没有封面

---

## 建议的修复优先级（仅记录，不在本次实施）

### P0

- 把“资源包导入”和“备份恢复”协议彻底拆清
- 明确混合媒体包是否支持，以及支持的标准包结构
- 视频播放器的拖拽状态管理重做

### P1

- 接入视频自动播放、循环播放、控件 toggle、沉浸时间配置
- 把长按加速提示从 `controlsVisible` 生命周期里解耦
- 给待播放列表补封面

### P2

- 把滑动批选能力推广到“全部素材 / 收藏 / 分组 / 标签 / 最近查看”
- 建立统一排序模型，补齐名称 / 大小 / 时间升降序
- 设计图片 / 视频 / 导出包 / 导出目录的重命名边界

---

## 本次涉及的关键文件

- `src/services/packageImportService.ts`
- `src/services/backupService.ts`
- `src/screens/BackupScreen.tsx`
- `src/screens/ArchiveReaderScreen.tsx`
- `src/screens/VideoPlayerScreen.tsx`
- `src/screens/VideoDetailScreen.tsx`
- `src/screens/EditImageScreen.tsx`
- `src/screens/AllImagesScreen.tsx`
- `src/screens/BatchManageImagesScreen.tsx`
- `src/screens/FavoritesScreen.tsx`
- `src/screens/RecentViewedScreen.tsx`
- `src/screens/GroupImagesScreen.tsx`
- `src/screens/TagResultScreen.tsx`
- `src/hooks/useSwipeGridSelection.ts`
- `src/hooks/useImageMultiSelect.ts`
- `src/database/types.ts`
- `src/database/repositories/imageRepository.ts`
- `src/database/repositories/assetRepository.ts`
- `App.tsx`

## 未验证项

- 视频区域拖拽“完全无法触发”的现象，需要 Android 真机再确认一次具体触摸路径
- `expo-video` 在当前机型上对高频 `currentTime` 写入造成的暂停 / 恢复表现，最好配合日志和真机录屏验证
