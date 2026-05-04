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
