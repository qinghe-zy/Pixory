# Live2D Runtime Disable Design

## Goal

立即停止 Pixory 内全部桌宠运行时活动，释放聊天页和会话设置页的渲染、计时、事件监听与模型加载资源，同时保留现有桌宠源码、已下载文件和 SQLite 设置值以便未来恢复。

## Scope

- 移除 `AiChatScreen` 对 `Live2DPetView`、模型列表、桌宠动画、PanResponder、定时器、设置读取和事件监听的运行时引用。
- 移除 `AiSessionConfigScreen` 的桌宠开关、模型选择和管理弹窗入口，避免读取或写入桌宠设置。
- 不删除 `Live2DPetView`、管理服务、模型目录或已下载资源；不迁移或清空 `GLOBAL_PET_*` 设置。
- 更新功能矩阵，将桌宠标记为“完全关闭/不上线”。

## Runtime boundary

聊天页不再渲染 WebView、不会创建 Live2D 模型、不会注册 `LIVE2D_MODEL_CHANGED` 监听、不会创建桌宠 idle timer 或手势 responder。会话设置页没有桌宠入口，因此不会触发模型下载、预览或设置写入。

## Verification

新增静态策略测试：聊天页和会话设置页不得导入或引用桌宠运行时、模型表、`GLOBAL_PET_*` 设置和 Live2D 事件；保留组件与服务文件不作为运行时入口。执行目标测试、相关性能策略测试、`pnpm typecheck` 与完整 `pnpm test`。Android 设备仍不可用，设备端内存/帧耗时只记录为未验证。
