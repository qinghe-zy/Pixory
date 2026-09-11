# Scripts

这里仅放进入公开仓库、可复用且有明确入口的工程脚本。一次性补丁和内部工具位于私有 `scripts/local/`，不会进入 GitHub。

## Android 打包入口

在公开 `main` 分支运行：

```powershell
pnpm release:android
```

执行链路：

1. `build-android-release.ps1` 检查 `main`、预检当前版本文档、执行 Gradle clean 和 release 构建。
2. `version-document-workflow.ps1 -Action FinalizeRelease` 校验并归档当前版本的 PRD、TDD、Test Report、对外/对内发版说明，然后新建下一版本当前文档集合。
3. `version-document-workflow.ps1` 在归档前以当前版本 `PRD.md` 为唯一业务规则源，同步更新根目录公开总 PRD，并维护其中的版本路线图；根目录 `PRD.md` 会随公开 release commit 进入 GitHub。
4. `release-handoff.ps1` 只暂存公开路径，自动创建 release commit 和版本 tag，推送 `origin/main` 与 tag，并用本版本 `Release-Notes-External.md` 创建或更新 GitHub Release、上传 APK。

打包前必须确认：

- `版本文档/当前版本文档/PRD.md` 是本版本业务规则 SSOT；
- 根目录 `PRD.md` 是跨版本公开总 PRD，由打包流程根据当前版本 PRD 同步维护，不能手工复制成互相矛盾的第二份规则；
- `TDD.md`、`Test-Report.md`、`Release-Notes-External.md`、`Release-Notes-Internal.md` 已持续更新；
- `scripts/version-document-workflow.ps1 -Action ValidateCurrent` 通过；
- GitHub CLI `gh` 已登录，且 `origin` 指向 `qinghe-zy/Pixory`。

## 文档与热更新入口

- `version-document-workflow.ps1`：初始化、校验、追加事件、预览和归档版本文档。
- `record-hot-update.ps1`：记录一次热更新，并追加当前版本文档事件。
- `release-handoff.ps1`：打包完成后的公开提交、tag、GitHub 推送和 Release 交接。
- `generate-android-splash-assets.cjs`、`deploy-docs-mist01.ps1`：维护型资源和官网部署脚本。
