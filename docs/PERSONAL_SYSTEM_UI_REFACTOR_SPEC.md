# Pixory Personal System UI 统一重构规范

**文档性质**：开发交接文档 / 架构重构规范 / 验收清单

**适用范围**：本规范用于指导 Pixory 隐私系统从“独立控制台”重构为“主 UI 下的已认证数据源模式”。它约束 UI、导航、数据访问、图片缓存、数据库连接生命周期、后台保护、备份导出与验收测试。

**核心原则**：

> Personal System 不是独立 App、不是第二套图库、不是普通库与隐私库的混排聚合页。它是 Pixory 主 UI 在已认证 `personal` 数据源上下文下运行的一种模式。

Pixory 只有一套产品体验，但有两套物理隔离的数据源：

```ts
type PixorySpace = 'normal' | 'personal';
```

UI 可以同构，数据层必须隔离。前端体验统一，运行时上下文显式；普通导航尽量保留，隐私子树必须可销毁；安全清场优先于动画和状态保留。

**给后续 AI/开发线程的执行要求**：

本文件定义的是目标、边界、安全不变量和验收标准，不是逐行照抄的施工脚本。实现者必须先阅读当前代码结构，再选择最小、兼容、可验证的落地路径。除“先遮罩再清场”“认证成功前不得挂载 personal UI”“上锁后旧 session 必须失效”等安全不变量外，不要把本文中的示例类型、组件名、facade 名、实施顺序当成唯一实现。

---

## 1. 不变边界与本次重构边界

### 1.1 本次不主动重写的底层能力

以下能力是本次 UI 重构需要继续复用的基础，不应为了 UI 改造而重写：

- 双数据库物理隔离：`pixory.sqlite` 与 `pixory_personal.sqlite`。
- 双文件树隔离：普通图库目录与 `pixory_personal/` 下的 originals、thumbnails、temp、exports。
- 现有资源导入服务链：图片选择、原图复制、元数据读取、缩略图生成、SQLite 写入、导入结果记录。
- 现有资源包导入和 `.pixorypack` 加密导出能力。
- 软删除、回收站、备份必须保留“原图优先、不压缩、不重编码”的项目红线。

### 1.2 本次必须改变的部分

- 废弃当前独立控制台心智的 `PersonalSystemScreen.tsx`。
- 隐私/普通模式切换入口必须收敛到设置区域，表现为当前模式的互斥入口，而不是独立产品入口。
- Home、Search、Tags、Favorites、Trash、Backup、Import、Batch Manage 等主页面必须支持同构运行在 `normal` 或 `personal` 上下文。
- 数据访问层必须从“全局 space 隐式切换”改成“显式、可失效、可追踪的 Space Session / DB Handle”。
- personal 模式退出时必须统一清理导航、组件状态、业务 store、异步回调、图片缓存和 personal SQLite 连接。

### 1.3 禁止夸大安全承诺

本系统目标是 Android-first、本地离线、App 私有存储内的强隐私隔离。它不能承诺抵御 root 设备、系统级恶意软件、完整内存 dump、已被攻破的操作系统或物理取证。

文档、UI 文案和代码注释不得使用“银行级绝对安全”“100% 不可能泄漏”之类无法验证的表述。工程目标是：在正常 Android 权限模型和 App 私有存储边界内，最大限度降低误显示、串库、缓存残留和备份误导风险。

---

## 2. 目标产品形态

### 2.1 进入方式

- 隐私模式入口应放在设置区域中，而不是做成独立 Tab、独立首页、独立控制台或强入口页面。
- normal 模式下，设置中显示“进入隐私模式”入口。
- personal 模式下，同一位置显示“返回普通模式”或“退出隐私模式”入口。
- 点击“进入隐私模式”后弹出轻量认证组件，例如 `PersonalUnlockModal`。
- 验证成功后创建 personal session，进入主 UI 的 personal 运行上下文。
- 点击“返回普通模式”必须走统一 `lockPersonalSpace('manual')`，不得只做普通导航跳转。
- 不再跳转到一个功能堆叠式的独立控制台。

### 2.2 视觉暗号

personal 模式下必须有全局可见状态提示，至少包含：

- `PersonalModeBanner` 或明显不同的 Header / Status Bar 视觉。
- 设置区域的模式入口必须根据当前上下文互换：normal 显示进入隐私模式，personal 显示返回普通模式。
- 可在 Header 或设置入口附近提供显眼的上锁/返回普通模式动作，但不得把它设计成新的 Personal 控制台入口。
- 不使用大面积花哨装饰；视觉差异应清晰、克制、稳定。

### 2.3 操作等权

普通模式可以做的核心资产管理动作，personal 模式下应尽量同构：

- 浏览 IP、图片、分组、标签、收藏、回收站。
- 导入图片或资源包。
- 搜索、筛选、批量整理、打标签、收藏、软删除、恢复。
- 备份页根据当前上下文展示对应导出能力。

---

## 3. 数据访问红线

### 3.1 禁止依赖全局 `activeSpace` 或 `currentDatabaseSpace`

当前代码中存在 `src/database/db.ts` 的 `currentDatabaseSpace` / `runWithDatabaseSpace(...)` 模式。该模式在异步并发下存在串库风险：

```ts
// 禁止作为最终安全模型
currentDatabaseSpace = 'personal';
await task();
currentDatabaseSpace = previous;
```

两个异步任务交错执行时，后启动任务可能覆盖前一个任务的全局 space。后台导入、备份、整理任务也可能因为 UI 正处于 personal 模式而写入错误数据库。

最终实现要求：

- Repository / Service 不得隐式读取全局 `activeSpace` 来决定数据库。
- 新代码不得新增依赖 `currentDatabaseSpace` 的访问路径。
- `runWithDatabaseSpace(...)` 只能作为迁移期兼容层，必须逐步收敛为显式 DB Handle / Space Session。
- 所有后台任务必须显式接收 `PixorySpace`、`SpaceSession` 或 `DbHandle`，不得从 UI 当前状态推断。

### 3.2 Space Session 模型

推荐建立不可伪造、可失效的 session 对象：

```ts
type PixorySpace = 'normal' | 'personal';

type PersonalSessionState =
  | 'locked'
  | 'unlocking'
  | 'unlocked'
  | 'locking';

type SpaceSession = {
  space: PixorySpace;
  sessionId: string;
  generation: number;
  db: SQLiteDatabase;
  assertActive(): void;
};
```

要求：

- 冷启动必须是 `normal` + `locked`。
- `personal` session 只能由认证成功流程创建。
- 每次解锁生成新的 `sessionId` / `generation`。
- 上锁后旧 session 立即失效，任何旧请求返回结果都必须丢弃。
- 页面层可以使用 `useAssetRepository()` 等 Hook 获取绑定当前 session 的 facade。
- Service 层和后台任务必须显式接收 session 或 db handle。

### 3.3 Repository / Facade 分层

推荐结构：

```txt
UI Screen
  -> useCurrentSpaceFacade()
    -> AssetFacade / TagFacade / BackupFacade
      -> Repository(dbHandle)
        -> SQLite
```

规则：

- UI Screen 不直接选择数据库文件名。
- Repository 不读 React 状态、不读 Zustand 全局 `activeSpace`。
- Facade 可以由 React Hook 绑定当前 session，但绑定结果必须包含 `sessionId`。
- 异步查询完成时必须校验 session 仍然有效，再写入 store 或 setState。
- 记录身份必须包含 space，不能只传 numeric id。

```ts
type SpaceScopedId = {
  space: PixorySpace;
  id: number;
};
```

---

## 4. 导航架构

### 4.1 禁止顶级粗暴重挂载

不要把 `key={activeSpace}` 挂在 `NavigationContainer` 或整个 App 根节点上。这会导致普通模式导航栈、滚动位置和历史状态全部丢失。

### 4.2 推荐并行子树

```txt
AppRoot
├─ NormalNavigator      常驻，可保留普通浏览栈
└─ PersonalNavigator    仅解锁后挂载，上锁时销毁
```

要求：

- `NormalNavigator` 不得查询 personal 数据。
- `PersonalNavigator` 只在 personal session 有效时挂载。
- personal 上锁时必须销毁 `PersonalNavigator`。
- 手动上锁可以回到之前 normal 位置。
- App 退后台触发上锁时，必须回到 normal Home。

### 4.3 路由参数

任何指向记录详情的路由必须携带 space：

```ts
{ name: 'image-detail', imageId: 12, space: 'personal' }
```

禁止只靠数字 ID 打开详情。normal 和 personal 数据库都可能存在 `id = 12`。

---

## 5. 同构页面改造规则

### 5.1 页面职责

Home、Search、Tags、Favorites、Trash、Backup、Import、Batch Manage 等页面应复用主 UI，不应复制成 `PersonalHomeScreen`、`PersonalSearchScreen` 等第二套页面。

页面允许根据 capabilities 渲染不同操作，但不得直接选择数据库：

```ts
type SpaceCapabilities = {
  canExportEncryptedPack: boolean;
  canRunNormalBackup: boolean;
  canShowPersonalBanner: boolean;
};
```

### 5.2 BackupScreen 规则

- normal 模式下普通备份只包含普通图库，不包含 `pixory_personal.sqlite`、personal originals、personal thumbnails、personal manifest 或 personal 元数据。
- personal 模式下可展示 `.pixorypack` 加密导出。
- 如果保留“全部数据加密包”，它只能在已解锁 personal 模式下出现，且产物必须是加密包，不能产生普通明文 all backup。
- 文案必须明确区分普通备份和隐私导出，避免用户误以为普通备份包含隐私数据。

---

## 6. 图片渲染与缓存安全

### 6.1 统一安全图片组件

personal 图片不得直接使用普通 `<Image>` 或未受控的图片组件。必须引入统一组件，例如：

```txt
SecureImage
PersonalImage
PixoryImage
```

组件职责：

- 根据 `space` 选择缓存策略。
- personal 图片默认禁用磁盘缓存。
- 禁止 personal 图片 prefetch 到磁盘。
- 对 personal 原图、缩略图路径做统一审计入口。

### 6.2 依赖要求

当前 `package.json` 未安装 `expo-image` 和 `expo-screen-capture`。实现时必须二选一：

- 安装并使用 `expo-image`，personal 图片强制 `cachePolicy="none"`，上锁时调用 `Image.clearMemoryCache()` 与 `Image.clearDiskCache()`。
- 或提供等价的原生图片缓存禁用和清理能力，并用测试证明 personal 图片不会落入可扫描的全局 cache。

如果使用 React Native 内置 `<Image>`，必须先验证其 Android/iOS 缓存行为；未经验证不得直接用于 personal 图片。

### 6.3 上锁缓存清理

`lockPersonalSpace(...)` 必须清理图片内存缓存和磁盘缓存。清理 API 失败时：

- 不得静默吞掉。
- 必须记录非敏感错误日志。
- 必须继续执行遮罩、导航销毁、store 清理、DB close。
- 验收时必须在 Android 真机或模拟器检查 App cache 目录。

---

## 7. Personal Session 生命周期

### 7.1 解锁流程

解锁流程必须满足以下状态门禁。具体函数拆分、组件挂载位置和 facade 命名可根据现有代码调整，但不得绕过这些门禁：

```txt
1. 用户提交密码
2. session state = unlocking
3. 校验密码
4. 打开 pixory_personal.sqlite
5. 运行必要 migration / schema check
6. 启用防截屏或等价保护
7. 创建 SpaceSession(sessionId, generation, db)
8. 挂载 PersonalNavigator
9. session state = unlocked
```

任何一步失败都必须回到 `normal` + `locked`，不得挂载 personal UI。

### 7.2 唯一上锁出口

所有退出 personal 的路径都必须调用同一个函数：

```ts
lockPersonalSpace(reason: 'manual' | 'background' | 'auth-expired' | 'error')
```

禁止在任意页面里直接写：

```ts
setActiveSpace('normal');
```

### 7.3 上锁顺序

上锁过程不要求所有实现都写成一个大函数，但必须满足以下顺序不变量：

```txt
1. 立即显示隐私遮罩，阻止任何私密帧继续暴露
2. session state = locking，并使旧 sessionId / generation 失效
3. 取消 personal 查询、导入、备份、整理任务的可见回调
4. 清空 personal 相关 React state、Zustand store、搜索结果、详情、多选状态
5. 清理图片内存缓存和磁盘缓存
6. close pixory_personal.sqlite 连接
7. 销毁 PersonalNavigator
8. active space 回到 normal，session state = locked
9. 根据 reason 决定 normal 导航目标
10. 确认 normal UI 已挂载后隐藏遮罩
```

`background` 原因必须强制回 normal Home。`manual` 原因可以回到进入 personal 前的 normal 位置，但不得保留任何 personal 画面、路由或状态。

---

## 8. SQLite 连接与内存管理

### 8.1 连接生命周期

- normal DB 可跟随 App 生命周期长期打开。
- personal DB 只能在 personal session 内打开。
- 上锁、退后台、认证过期、严重错误时必须 close personal DB。
- close 后必须清空当前 personal db handle，旧 session 不得继续执行查询。

### 8.2 WAL 与临时文件

如果项目使用 WAL 模式，personal 数据可能存在 `pixory_personal.sqlite-wal` / `pixory_personal.sqlite-shm` 等 sidecar 文件。实现时必须保证：

- personal 备份/导出逻辑正确处理 WAL 数据一致性。
- normal 备份不得包含任何 personal sqlite、wal、shm 或 personal 目录。
- 上锁 close 前可评估执行安全的 checkpoint / truncate，但不得以破坏数据一致性为代价。

### 8.3 查询内存

- personal 列表页必须分页或限制数量。
- 避免一次性 `getAllAsync()` 拉取大量私密记录进入 JS 内存。
- 组件卸载和上锁时必须释放列表、详情、标签、搜索结果等明文状态。

---

## 9. 后台与防截屏保护

### 9.1 依赖要求

实现必须引入 `expo-screen-capture` 或等价原生能力。Android 目标应使用 `FLAG_SECURE` 或等价效果保护多任务卡片和屏幕录制。

### 9.2 AppState 规则

当 AppState 进入 `inactive` 或 `background`：

```txt
1. 先显示 PrivacyShield
2. 立即调用 lockPersonalSpace('background')
3. 回前台时只允许出现 normal Home
```

不得先等待异步清理完成后才遮罩。遮罩必须是第一动作。

### 9.3 失败兜底

如果防截屏 API 不可用或调用失败：

- App 仍必须执行遮罩和上锁。
- 日志只能记录非敏感错误。
- QA 必须在 Android 真机或模拟器验证多任务卡片。

---

## 10. 双库 Migration 与 Schema 稳定性

- normal 和 personal 必须使用同一套 migration。
- 每次新增表、字段、索引、触发器，必须对两个数据库都可运行。
- migration 测试必须覆盖 `pixory.sqlite` 和 `pixory_personal.sqlite`。
- Repository 不得假设 personal 库有额外字段，除非通过明确版本和能力判断。
- schema 变更必须考虑备份、导入、`.pixorypack` 兼容。

---

## 11. 日志、错误与隐私文案

- 日志不得输出 personal 文件绝对路径、IP 名称、标签、文件名、note、manifest 明文、导出密码或加密密钥。
- 错误提示应说明操作失败，不暴露隐私数据内容。
- normal 模式不得提示“发现隐私数据”，避免泄露 personal 存在性。
- 备份文案必须明确：“普通备份不包含隐私系统数据；隐私数据需进入隐私模式后导出加密包。”

---

## 12. 实施策略建议（非固定流程）

后续实现不要机械照阶段施工。推荐按风险拆成若干可独立验证的工作流，并根据代码实际依赖关系调整顺序：

- **上下文安全流**：建立 `SpaceSession` / `PersonalSessionState` / `lockPersonalSpace(...)` 的最小骨架，优先消除后台任务、导入、备份、详情、搜索等高风险路径对全局 space 的依赖。
- **导航与 UI 流**：在不破坏 normal 浏览栈的前提下，引入 personal 可销毁子树；逐步把现有主页面接入当前 space facade。
- **缓存与后台流**：引入安全图片组件、防截屏、PrivacyShield、AppState 上锁；验证 Android 多任务卡片和 cache 目录。
- **备份与 migration 流**：确认 normal 备份排除 personal，personal 加密导出受认证保护，双库 migration 保持一致。
- **旧实现收口流**：当同构页面、认证入口和安全清场全部可验收后，再删除 `PersonalSystemScreen.tsx` 的控制台职责、旧路由和迁移期兼容代码。

实现者可以调整顺序，但每次提交都应保持 App 可运行、normal 数据不受影响、personal 数据不串库，并说明已验证和未验证部分。

---

## 13. 验收清单

开发完成后必须逐条验收：

- [ ] 冷启动一定进入 `normal` + `locked`。
- [ ] 未认证状态下没有任何页面可查询 personal DB 或 personal 文件目录。
- [ ] 解锁 personal 后，Home/Search/Tags/Favorites/Trash/Import/Backup 读取当前 personal session。
- [ ] normal 和 personal 中相同 numeric id 不会打开错详情。
- [ ] personal 导入只写入 `pixory_personal.sqlite` 和 `pixory_personal/` 文件树。
- [ ] normal 导入、备份、整理后台任务不会因 UI 处于 personal 而串库。
- [ ] 手动上锁后，personal 详情页、搜索结果、多选栏、弹窗、store 状态全部清空。
- [ ] 退后台后再回前台，只能看到 normal Home。
- [ ] Android 多任务卡片不显示 personal 内容。
- [ ] personal 图片不使用未受控普通图片组件。
- [ ] personal 上锁后执行图片 memory/disk cache 清理，并在 Android cache 目录验证无可识别 personal 图片缓存。
- [ ] personal DB 在上锁后 close，旧 session 查询结果不会写回 UI。
- [ ] normal 备份不包含 personal sqlite、wal、shm、originals、thumbnails、manifest 或元数据。
- [ ] `.pixorypack` 隐私导出只能在 personal 解锁后出现。
- [ ] 双库 migration 测试通过。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm test` 通过；若某项无法自动化，必须记录人工验证步骤和结果。

---

## 14. 最终交付定义

本次重构完成的标准不是“能打开隐私页面”，而是：

- personal 不再表现为独立控制台。
- 隐私入口只存在于设置区域，并根据当前模式显示为“进入隐私模式”或“返回普通模式”。
- 主 UI 可在 normal/personal 两个上下文下同构运行。
- 数据访问上下文显式、可失效、可测试。
- personal 退出时能销毁私密导航树、状态、缓存、异步回调和数据库连接。
- normal 备份、普通页面、后台任务不会接触 personal 数据。
- 新增页面只要接入统一 facade 和 space-scoped identity，就能自然支持双空间，不需要补丁式复制页面。
