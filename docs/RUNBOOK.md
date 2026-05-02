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

## 非目标内容

本项目当前不涉及：

- 服务器部署
- 云环境部署
- 后端发布
- 账号系统上线
- 云存储配置
