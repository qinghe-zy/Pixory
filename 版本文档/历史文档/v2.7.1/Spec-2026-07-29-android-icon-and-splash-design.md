# Android 图标与启动图更新设计

## 目标

将 Pixory 的启动图替换为 `icons/04_右下_聊天图标.png`，并解决 MIUI 等启动器对桌面图标过度裁切的问题。

## 已确认事实

- Pixory 当前在 `mipmap-anydpi-v26/` 提供 adaptive-icon XML，并将完整画面放入前景层；Android 启动器会对前景层施加遮罩，导致边缘内容被裁掉。
- LianYu 不提供 adaptive-icon XML，而是直接使用已合成的 `mipmap-* / ic_launcher.png` 与 `ic_launcher_round.png`；桌面图标的圆角和透明角已经由位图本身处理，因此不会再次发生 adaptive-icon 前景裁切。
- Android 12 及以上的冷启动页由系统控制。它必须是纯色窗口背景与居中的图标，不能使用传统的全屏自定义海报。

## 设计

### 桌面图标

1. 使用 `icons/04_右下_聊天图标.png` 生成各密度的预合成 launcher 位图。
2. 让 `ic_launcher` 与 `ic_launcher_round` 指向这些位图。
3. 移除 Android 8+ adaptive-icon XML，使系统不再把完整插画当作可遮罩的前景层。
4. 预合成图标保留聊天图片的完整方形构图；只保留资源本身的圆角/透明角，不增加会让主视觉缩小的透明留白。

### Android 12 启动页

1. 使用 Expo `expo-splash-screen` 配置插件，并将聊天图标设为启动图资源。
2. 继续使用 `#FAFAF7` 作为不透明窗口背景。
3. 使用适合系统中心图标的尺寸；系统圆形遮罩只作用于启动图呈现，不改变桌面图标的位图策略。
4. 通过重新生成原生 Android 资源，使配置、已有原生目录和最终 APK 一致。

## 变更范围

- `app.json`
- `assets/` 内的图标/启动图源资源
- `android/app/src/main/res/` 的 launcher 与 splash 原生资源
- `docs/feature-matrix.md` 的发布/系统资源说明

不修改聊天、数据、权限或网络逻辑。

## 验收标准

1. Android 桌面和 MIUI 应用信息页展示完整聊天图片构图，不再由 adaptive-icon 前景遮罩截断边缘内容。
2. Android 12+ 冷启动显示 `#FAFAF7` 纯色背景和居中的聊天图标。
3. `pnpm typecheck`、`pnpm test` 与 `git diff --check` 通过。
4. 使用 clean 后的 Android release 或已安装的真实 Android 构建验证；Expo Go/开发构建不作为启动屏最终视觉证据。

## 风险与边界

- 不同 OEM 启动器仍可能为 legacy bitmap 添加外形容器，但不会再触发 Android adaptive-icon 对前景层的额外裁切。
- Android 12 系统启动页无法展示桌面图标的完整方形插画，这是平台行为；该限制只影响启动页，桌面图标不受此边界约束。
