# Pixory 运行手册

## 安装依赖

```bash
pnpm install
```

## 启动 Android

```bash
pnpm exec expo start --android
```

## 清缓存启动

提测前或怀疑 bundle 过旧时，优先使用：

```bash
pnpm exec expo start --android -c
```

## TypeScript 检查

```bash
pnpm exec tsc --noEmit
```

## 推荐提测前流程

1. 结束旧 Metro
2. 确认 `adb devices` 可见目标设备
3. 执行 `pnpm exec expo start --android -c`
4. 确认 Expo Go 进入的是最新 bundle
5. 执行核心 Android 回归

## 固化命令

```bash
pnpm run typecheck
pnpm test
pnpm run doctor
pnpm run acceptance:android
```

## Android P0 长链路验收

必须在真实 Android 设备或稳定模拟器上执行，不能只看 Web 或旧截图。

链路：

```text
创建 IP
→ 创建分组
→ 批量导入
→ 查看首页 / IP 详情 / 分组 / 全部图片
→ 编辑图片
→ 移动分组
→ 批量管理
→ 收藏 / 标签 / 最近查看联动
→ 删除
→ 恢复
→ 清空回收站
→ 物理文件删除核验
```

验收记录必须至少包含：

- 设备 ID、Android 版本、Expo Go / APK 运行方式
- fresh bundle 命令与是否清缓存
- 测试 IP、分组、标签、图片数量
- 编辑、移动、批量操作、删除、恢复、清空回收站的结果截图或日志
- 回收站清空后的独立核验结果

## 回收站清空外部独立核验

清空回收站后，不能只看 UI 消失。必须确认：

- SQLite 中被清空图片的 `image_assets` 记录不存在
- 对应 `image_tags` / `image_groups` 关系不存在
- 原图文件不存在
- 缩略图文件不存在
- 同一 IP 下其他未删除图片文件仍存在

建议流程：

1. 清空前在图片详情或开发日志中记录待删图片 `imageId`、`originalFileUri`、`thumbnailFileUri`。
2. 清空后用 adb 或设备文件检查原图和缩略图路径。
3. 拉取 Expo Go 沙盒数据库副本或通过应用内核验日志确认 SQLite 记录已删除。
4. 随机选一张未删除图片，确认其原图和缩略图仍存在。

## 常见问题

### 8081 端口占用

现象：

- Metro 启动失败
- Expo 打不开最新项目

处理：

- 找到占用 8081 的旧 Node / Metro 进程并结束
- 重新执行 `pnpm exec expo start --android -c`

### Expo Go 旧 bundle

现象：

- 明明已经重新启动 Metro，但页面仍停留在旧状态

处理：

- 强制关闭 Expo Go
- 重新从 fresh bundle 地址打开项目
- 必要时重新执行 `pnpm exec expo start --android -c`

### Android 输入法干扰

现象：

- 自动化输入的标签、备注、文件名被系统输入法改写

处理：

- 优先人工输入
- 自动化时尽量使用按键级注入，而不是普通文本注入
- 这是模拟器 / 输入法层限制，不一定是业务 bug

### 图片选择权限

现象：

- 无法打开媒体库
- 导入流程直接失败

处理：

- 确认系统已授予媒体库访问权限
- 在设备系统设置中重新授权 Expo Go

### Expo Go 沙盒文件路径

现象：

- 想直接检查原图 / 缩略图文件时不容易定位

处理：

- 记住当前运行在 Expo Go 沙盒里
- 文件位于应用私有目录而不是公共图库目录
- 做独立物理删除核验时，建议结合日志或额外 adb 检查

### Dev-only 入口不可见

提测默认不显示开发回归入口。只有显式设置：

```bash
EXPO_PUBLIC_PIXORY_DEV_TOOLS=1 pnpm exec expo start --android -c
```

才允许显示开发回归控件。

## 非目标内容

本项目当前不涉及：

- 服务器部署
- 云环境部署
- 后端发布
- 账号系统上线
- 云存储配置
