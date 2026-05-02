# Pixory Android 测试报告

测试时间：2026-05-02

## 测试环境

- 工作目录：`D:\Project\Pixory\pixory`
- Node 包管理：`pnpm`
- Expo：54.x
- 运行方式：Expo Go + Metro
- fresh bundle 命令：`pnpm exec expo start --android -c`

## 测试设备 / 模拟器

- 设备标识：`emulator-5554`
- 型号：`sdk_gphone64_x86_64`
- Android 版本：15

## 回归目标

- 用 fresh bundle 执行 Pixory MVP 提测前最终 Android 长链路回归
- 不新增功能，只验证现有能力

## 回归链路与结果

1. 停止旧 Metro，启动 fresh bundle
结果：通过。`pnpm exec expo start --android -c` 成功启动，并打开到 Expo Go。

2. 新建 IP：`ReleaseRegressionIP_20260502144714`
结果：通过。

3. 新建分组
- `ReleaseGroupA_20260502144714`
- `ReleaseGroupB_20260502144714`
结果：通过。IP 详情中的分组数量更新为 2。

4. 在 GroupA 下真实导入 4 张图片
- 标签：`tagA`、`tagB`
- 备注：`release regression note`
- 收藏：`true`
结果：通过。系统弹窗显示“成功导入 4 张，失败 0 张”。

5. 导入后页面验证
- GroupA 页显示 `4 张图片`
- 图片详情页原图可预览
- 图片详情页显示 `tagA / tagB`
- 图片详情页显示 `release regression note`
- 图片详情页显示 `已收藏`
结果：通过。

6. 编辑 1 张图片
- 目标：文件名 `release_edited_image.png`
- 目标：标签 `releaseEditA / releaseEditB`
- 目标：备注 `release edited note`
- 目标：收藏 `false`
- 目标：移动到 GroupB
结果：未完整闭环。

说明：

- 文件名精确改写已在编辑页注入成功
- 但 Android 模拟器输入法与自动化注入持续干扰编辑阶段的文本稳定性
- 这导致“编辑页所有目标字段一次性稳定写入并继续完成后续批量/回收站链路”未在本轮全部走完

## 失败项和修复项

- 失败项：Android 模拟器输入法会污染自动化文本注入
  - 影响：标签 / 备注等需要精确字符串的编辑阶段不稳定
  - 性质：更偏回归执行层问题，不是已确认业务逻辑 bug
  - 当前处理：改用按键级注入，已显著提升稳定性，但仍不足以保证整条编辑后长链路一次跑完

## 当前结论

- fresh bundle 成功
- Android 真实导入链路成功
- 首页 / 分组 / 图片详情关键展示成功
- 本轮不能判定“最终 Android 长链路完整通过”

建议：

- 在正式打包 / 截图 / 提测前，再补一轮人工主导的 Android 长链路复核
- 优先在更稳定的输入环境下完成“编辑 -> 批量管理 -> 回收站 -> 标签/收藏/最近查看联动”闭环
