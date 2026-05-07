# Pixory V2 安全与风险评估报告 (Security & Risk Assessment)

## 1. 概述 (Executive Summary)
本文档基于对 Pixory V2（视频集成与混合资产管理模块）底层原生代码与前端流水线的深度静态及逻辑审计生成。当前系统在跨端数据桥接、流式进度控制以及基于 `runWithDatabaseSpace` 的物理隔离方面表现出良好的工程结构。然而，在处理极端异常流（如：磁盘空间耗尽、系统强杀后台、超大媒体文件、Native 内存受限等）时，暴露出了若干高危风险，可能导致存储永久泄露、内存溢出（OOM）崩溃以及数据不一致。

---

## 2. 内存与性能风险 (Memory & Performance Risks)

### 2.1 导出备份时的 Base64 内存溢出 (Critical OOM during Backup Export)
- **严重程度**: 🔴 Critical
- **漏洞描述**: 在 `backupService.ts` 的 `copyBackupDirectoryToSaf` 中，将备份包复制到用户选择的 SAF（Storage Access Framework）系统目录时，使用了 `FileSystem.readAsStringAsync(..., { encoding: Base64 })`。此方法会将整个文件全量加载进内存。
- **影响评估**: 对于 V2 引入的超大视频资产（如 1GB 的视频），这会瞬间在 JavaScript 堆和 Native 内存中分配超过 1.3GB 的内存，**必然导致 `OutOfMemoryError` 崩溃**，使包含视频的系统备份导出功能瘫痪。
- **修复方向**: 建议由原生代码 (Kotlin) 提供一个流式文件复制方法，使用 `InputStream` 至 `OutputStream` 的 Buffer 分块传输。

### 2.2 提取视频封面时的原生内存溢出 (Native OOM on Thumbnail Generation)
- **严重程度**: 🟠 High
- **漏洞描述**: `PixoryMediaModule.kt` 中的 `createVideoThumbnail` 使用了 `MediaMetadataRetriever.getFrameAtTime` 获取视频首帧 Bitmap。
- **影响评估**: 对于 4K/8K 视频或部分编码异常的视频，该方法会在 Native 层申请庞大的连续内存。这种内存溢出难以在 JS 端通过 `try-catch` 优雅降级，往往表现为应用直接闪退。
- **修复方向**: 视 Android API 支持情况，可替换为带尺寸限制的获取方法（如 API 27+ 的 `getScaledFrameAtTime`），并在原生层加强异常吞吐。

### 2.3 原生长耗时任务阻塞 RN 桥接线程 (Native Bridge Blocking & Deadlock)
- **严重程度**: 🔴 Critical
- **漏洞描述**: `PixoryMediaModule.kt` 中的 `@ReactMethod` 方法（特别是 `copyUriToFileWithProgress` 和 `saveVideoToMediaStore`）是同步执行连续大体积文件（GB 级别视频）的 `while` 循环写入，**并未通过 Kotlin Coroutines 或线程池抛入后台**。
- **影响评估**: 根据 React Native 架构，这些大体积 I/O 循环将霸占并长时间死锁整个 Native Module 线程（长达数十秒甚至几分钟）。在这期间，**JS 线程与所有其他原生模块的通讯将被完全阻塞**。这导致：
  1. UI 上的进度条更新完全失效，所有的 `db.runAsync` 进度落库操作被堆积卡死。
  2. 用户界面的“取消”、“返回”等任何需要调用原生层的交互操作失去响应，造成应用假死（ANR）。
- **修复方向**: 必须重构 `PixoryMediaModule.kt` 中的长耗时文件流式操作，强制将其调度到后台线程（如 `CoroutineScope(Dispatchers.IO).launch`）中执行并异步回调。

---

## 3. 数据完整性与存储泄露 (Data Integrity & Storage Leaks)


### 3.1 “幽灵文件”导致的私有存储永久流失 (Orphaned Files Storage Leak)
- **严重程度**: 🟠 High
- **漏洞描述**: 导入流水线先将文件从 `temp/` 移动至内部私有目录 `originals/`，然后再执行数据库写入。若在移动完成但在落库成功前，应用发生崩溃、强杀或 OOM，遗留文件将脱离系统追踪。
- **影响评估**: 由于 `originals/` 位于 Android 沙盒内（用户不可见），现有的 `cacheCleanupService` 仅定时清理 `temp/`，这些失败的冗余文件将作为“幽灵文件”永久挤占磁盘空间，多次大视频导入失败可能流失数 GB 容量。
- **修复方向**: 建议引入孤立文件扫描器（Orphaned File Scanner），在特定时机对比 `image_assets` 记录与文件系统实体进行自愈清理。

### 3.2 磁盘空间耗尽未作前置拦截 (Storage Exhaustion during Copy)
- **严重程度**: 🟡 Medium
- **漏洞描述**: `copyUriToFileWithProgress` 未校验设备剩余空间便开始向 `FileOutputStream` 写入。
- **影响评估**: 写入将在耗尽设备最后 1MB 空间触发 `ENOSPC (No space left on device)` 时才被动抛出错误，不仅浪费 CPU/IO 性能，还可能引发整个 Android OS 的短时卡顿甚至关联服务崩溃。
- **修复方向**: 在执行复制流之前，对比 `totalBytes` 与 `destination.parentFile.freeSpace` 进行前置拦截。

### 3.3 私密包导入缺乏原子性回滚 (Inconsistent State on Encrypted Pack Import)
- **严重程度**: 🟠 High
- **漏洞描述**: `importEncryptedPersonalPack` 执行大规模的文件解压和复制，但并未包裹在严格的 SQLite 事务中，且 `catch` 块中缺乏对已复制文件的清理回滚。
- **影响评估**: 如果解压中途因空间不足或读写异常中止，将留下残缺的 IP 数据库记录与一堆未受管理的脏文件。

---

## 4. Android 系统集成风险 (Android System Integration)

### 4.1 MediaStore 导出失败产生“僵尸文件” (Pending Media Leak)
- **严重程度**: 🟡 Medium
- **漏洞描述**: `saveVideoToMediaStore` 中利用了 Android Q+ 的 `IS_PENDING = 1` 占位特性。
- **影响评估**: 如果数据流写入抛出异常，原生代码捕获后将错误抛给 JS，但并未在 `catch` 里销毁被占位的 `destinationUri`，导致用户相册中出现无法打开但永久占用体积的损坏文件。
- **修复方向**: 在异常处理链路中显式调用 `resolver.delete` 移除损坏的文件。

### 4.2 视频旋转元数据丢失导致 UI 变形 (Video Orientation Metadata Ignored)
- **严重程度**: 🟡 Medium
- **漏洞描述**: `getVideoMetadata` 提取了宽高，但遗漏了 `METADATA_KEY_VIDEO_ROTATION` 属性。
- **影响评估**: 手机拍摄的竖屏视频在底层多为横屏编码+90度旋转标签。Pixory 会将其错认为横屏视频，渲染出的画面将被扭曲或添加巨大的黑边，严重破坏视觉一致性。
- **修复方向**: 若检测到 Rotation 为 90 或 270，在返回元数据前必须互换 width 和 height。

---

## 5. 生命周期与用户体验盲区 (Lifecycle & UX Edge Cases)

### 5.1 异步预加载引发的幽灵音频 (Ghost Audio on Unmount)
- **严重程度**: 🟢 Low
- **漏洞描述**: `VideoPlayerScreen` 的视频切换调用了 `void player.replaceAsync().then(() => player.play())`。
- **影响评估**: 若在此异步解析的数百毫秒内组件被卸载，回调依旧会执行并让处于游离态的播放器开始播放，容易导致应用背景发出不明声音。
- **修复方向**: 利用 `isMounted` 标记拦截过期的异步回调。

### 5.2 强杀导致播放进度丢失 (Playback Position Lost on Force Kill)
- **严重程度**: 🟢 Low
- **漏洞描述**: 视频的 `lastPlaybackPositionMs` 当前仅依赖组件的 `useEffect` 卸载清理函数进行保存。
- **影响评估**: 习惯在多任务栏直接划掉应用（强杀）的用户将永久丢失其长视频进度。
- **修复方向**: 可加入节流定时保存，或绑定 `AppState` 在退入后台时抢救性落库。

### 5.3 压缩包内新建 IP 失败的数据残留 (Dangling IP on Save Failure)
- **严重程度**: 🟢 Low
- **漏洞描述**: 在 `ArchiveReaderScreen` 触发“新建 IP 并保存”，如果在保存图片环节失败，刚落库的 IP 没有被回滚。
- **影响评估**: 首页将出现一个没有内容的空 IP，增加用户困扰。

---

## 6. 安全与拒绝服务防范 (Security & DoS)

### 6.1 压缩包炸弹风险 (Zip Bomb DoS)
- **严重程度**: 🟡 Medium
- **漏洞描述**: 原生解压代码没有在 `input.copyTo(output)` 阶段限制单次输出的体积上限。
- **影响评估**: 恶意构造的超高压缩比文件可能通过几十 KB 的母体直接耗尽数十 GB 的存储导致系统瘫痪。

### 6.2 隐私空间临时文件延迟销毁 (Delayed Cleanup of Private Temp Sessions)
- **严重程度**: 🟢 Low
- **漏洞描述**: 浏览私密压缩包若直接强杀应用，解压出来的明文图片将留在 `temp/` 目录长达 48 小时（直至定时清理触发）。
- **影响评估**: 存在隐私数据的短时留存漏洞。
- **修复方向**: 建议在应用冷启动（或退出隐私模式时）无条件做一次临时目录碎片抹除。
