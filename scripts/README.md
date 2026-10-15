# Scripts

这里仅放进入公开仓库、可复用且有明确入口的工程脚本。一次性补丁和内部工具位于私有 `scripts/local/`，不会进入 GitHub。

## Android 打包入口

在公开 `main` 分支运行：

```powershell
pnpm release:android
```

执行链路：

1. `build-android-release.ps1` 检查当前分支为 `local-work` 或 `main`，无论是否传入新版本都同步并校验所有当前版本字段，然后预检版本文档、执行 Gradle clean 和 release 构建。
2. `version-document-workflow.ps1 -Action FinalizeRelease` 校验并归档当前版本的 PRD、TDD、Test Report、对外/对内发版说明，然后新建下一版本当前文档集合。
3. `version-document-workflow.ps1` 在归档前以当前版本 `PRD.md` 为唯一业务规则源，同步更新根目录公开总 PRD，并维护其中的版本路线图；根目录 `PRD.md` 会随公开 release commit 进入 GitHub。
4. `publish-dual.ps1` 通过 `sync-clean-repo.ps1` 过滤复制到独立纯净仓库，校验版本与公开路径后，只正常推送该仓库的 `main` 和新 tag，创建 GitHub Release 并部署官网。不会推送私有分支或强制覆盖远端。

版本同步可独立运行：

```powershell
node scripts/update-versions.js 2.8.9.2
node scripts/update-versions.js --check
```

`package.json` 是版本入口。同步涵盖 Expo/Android/runtime、更新服务与两个版本展示页、官网桌面/移动下载地址与备用值、手册缓存、README、功能矩阵、手册与内置手册、站点日期及发布公告。历史记录和独立公告不会改写；缺文件或定位规则会在写入前报错。Android versionCode 单调增加，重复运行不递增。`--date YYYY-MM-DD` 可指定发布日期，兼容旧的双版本参数。

经用户明确要求跳过过程文档的小版本，可传 `-SkipVersionDocuments -NotesPath <简短发版说明>`；`-SkipPublish` 仅构建。Windows 深路径使用 `-BuildDirectory D:\px2892`，该目录必须是相同已提交源码的真实短路径 worktree。脚本验证签名后才发布；失败后应先核查远端状态再继续。

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
