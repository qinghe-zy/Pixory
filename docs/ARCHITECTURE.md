# Pixory 架构说明

## 总览

Pixory 当前采用本地优先架构：

- SQLite 保存结构化元数据
- 应用私有文件目录保存原图与缩略图
- 页面层直接读取本地数据库与本地文件状态
- 不依赖服务器、云存储、账号或同步服务

## SQLite 数据层

核心表：

- `ips`
- `groups`
- `image_assets`
- `import_batches`
- `tags`
- `image_tags`

关键字段：

- `image_assets.originalFileUri`
- `image_assets.thumbnailFileUri`
- `image_assets.originalFilename`
- `image_assets.internalFilename`
- `image_assets.groupId`
- `image_assets.isFavorite`
- `image_assets.note`
- `image_assets.deletedAt`
- `image_assets.lastViewedAt`
- `image_assets.importBatchId`
- `import_batches.name`
- `import_batches.templateKey`
- `import_batches.successCount`
- `import_batches.completedAt`

当前数据库版本：`7`

## 本地文件系统

文件层由 `src/services/fileStorageService.ts` 管理。

当前目录模型：

- `documentDirectory/pixory/originals/`
- `documentDirectory/pixory/thumbnails/`
- `documentDirectory/pixory/exports/`
- `documentDirectory/pixory/temp/`

导入时会：

1. 校验目标 IP / 分组是否存在
2. 为原图生成内部文件名
3. 将原图复制到 app 私有 originals 目录
4. 单独生成缩略图到 thumbnails 目录
5. 写入 SQLite 记录

## original / thumbnail 分离

Pixory 明确区分：

- `originalFileUri`：原图真实文件
- `thumbnailFileUri`：预览缩略图

原则：

- 原图不压缩
- 原图不裁剪
- 原图不重编码
- 原图不被缩略图替代

## 图片导入流程

主实现位于 `src/services/imageImportService.ts`。

流程：

1. 请求媒体库权限
2. 选择多张图片
3. 校验目标 IP / 分组
4. 为每张图片构建待导入记录
5. 复制原图到本地私有目录
6. 生成缩略图
7. 写入 `image_assets`
8. 写入 `image_tags`
9. 写入并完成 `import_batches`
10. 执行导入后校验

## 导入批次整理

`import_batches` 是新导入图片的追溯入口。新导入图片会写入 `image_assets.importBatchId`，用户可以从 IP 详情进入最近导入批次，也可以回到任意新批次继续整理。

旧图片不会被强行补批次；`importBatchId` 为空的图片仍按普通图库、全部图片、分组、标签等入口整理。

批次整理台会显示：

- 本批整理度
- 未分组数量
- 无标签数量
- 无备注数量
- 疑似重复数量
- 自动分堆与真实缩略图预览

自动分堆只影响视图和选择范围，不会静默改写图片数据。

后续整理流程也应使用自动分堆作为辅助能力。自动分堆不应只在首次导入或导入批次整理时出现；当用户在普通图库、IP 图片、分组图片、标签结果、收藏、最近查看等入口进入批量整理时，也应能按相同的本地规则获得分堆建议、快速选择范围和真实缩略图预览。

分组页内的“移出分组”应默认作用于当前分组。因为页面上下文已经确定 `groupId`，用户选择图片后点击“移出分组”不应再要求选择要移出的分组；其他跨分组或混合来源页面仍可保留“选择要移出的分组”的通用流程。

批量选择规则应采用可解释、可撤销的交互。用户点击“未分组”“无标签”“同尺寸”“同文件名前缀”“本次导入”等规则后，系统应清楚显示当前规则的基准和结果数量；再次点击同一规则，或点击规则激活后出现的“取消本次选择/取消该规则”按钮，应能取消由该规则选中的范围。对于“同尺寸”这类需要基准图片的规则，基准应明确展示为“以当前已选第一张图片为基准”；如果没有已选图片，应避免默默使用列表第一张，改为要求用户先选一张，或在 UI 中明确标出所采用的基准图片。

IP 详情页的信息组织应更一体化，尤其是“当前 IP 整理度”“待整理”“最近导入批次”这一组内容。它们都服务于同一个目标：理解当前 IP 的整理状态并继续整理；视觉上应更像一个连续的管理摘要模块，而不是多个孤立卡片堆叠。

标签页应同时支持浏览、搜索、创建和管理标签。当前“搜索标签 + 已有标签展示 + 长按管理”是基础能力；后续应提供明确的新增标签入口，并复用本地 SQLite 标签能力，不引入复杂分类、别名、合并规则或云同步。

我的页面应把“本地空间”作为一个综合状态卡片。卡片上方展示 `本地原图存储：大小`，下一行直接展示 `IP数量`、`图片总数`、`收藏数`、`回收站` 等统计；这些统计不应作为单独卡片割裂展示。`本地原图存储` 只展示真实容量数字，不展示进度条；在没有明确容量上限或阈值时，进度条会制造“会涨满”的误解。

## 疑似重复

当前疑似重复仅在当前导入批次内检查，规则为：

- 同尺寸
- 同文件大小

疑似重复页只展示对比，不自动删除、合并、替换、收藏或移动到回收站。

## 软删除 / 回收站流程

默认删除不是物理删除，而是软删除：

1. 将 `image_assets.deletedAt` 写入时间戳
2. 页面默认查询排除 `deletedAt IS NOT NULL`
3. 回收站页读取已删除图片
4. 恢复时把 `deletedAt` 置空
5. 清空回收站时：
   - 删除 `originalFileUri`
   - 删除 `thumbnailFileUri`
   - 删除数据库记录

实现位置：

- `src/database/repositories/imageRepository.ts`
- `src/services/trashService.ts`

## 页面与状态

当前主导航为四个 Tab：

- 首页
- 分组
- 标签
- 我的

页面通过 repository + local service 直接读取真实数据，不存在远端 API 层。

## dev-only 工具说明

当前仍保留少量 `dev-only` 回归辅助：

- `DevOnlyCard`
- 导入页开发预设
- 编辑页开发预设
- 批量管理页开发预设
- `/dev/import-check` 对应的导入 smoke test 路由常量

约束：

- `DevOnlyCard` 在 `__DEV__` 之外返回 `null`
- `import-development` 页面在 `App.tsx` 中受 `isDevToolsEnabled` 保护
- 当前主首页路径没有正式入口直接暴露这些 dev-only 工具
- 正式提测前可移除这些 dev-only 辅助
