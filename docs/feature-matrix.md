# Pixory 功能矩阵

最后更新：2026-11-09（伴聊二楼手势协同、黑白边根除、折叠会话时间流与生长式转场升级：消息列表到顶下拉仲裁与零跳变位移，消除下拉白边与收起黑边；顶栏独立驱动值实现拖动纯白与进入二楼匀速变色；折叠会话时间流排序与乐观移出实时刷新；上线长聊同款长按气泡菜单与二次确认；角色卡从物理矩形自然生长放大进详情，点击开启伴聊秒开进聊天）

思考初始状态：每次发送、重生成、改写及续答均从缩进预览开始，不继承前一条或复用消息的展开状态；生成中仍可随时手动展开/折叠，已有消息保持各自阅读状态。缩进预览使用同一 View/Text 子树，按原生完整行位置显式撑开内容高度并平移至最新七行，避免 Android 容器被限高后无法跟随；字号升级至 14px（比正文 15px 小一号，行高 23px，七行上限 161px），提升可读性同时保持主次层级；引入 300 字符量化步长截断与 ±4dp 字体高度稳定器，彻底消除 Token 吐字折行时的容器高度跳变与边缘字符浮点微抖；溢出时上下边缘均配备 24dp 渐变淡出遮罩（Top & Bottom Dual Fade），中央保证至少 113dp 纯净可视区域；展开取消高度和平移限制、去掉渐隐并恢复阅读竖线，随页面整体滚动。
适用版本：Pixory 2.9.4（上线伴聊沙箱取景框、智能文档 Agent 全链路闭环、真实物理文件分享、表情扩展中心与性能防抖动体系）；下方 2.8.9.1 OTA 收据为历史记录。

打包版本防漏：每次构建都执行统一版本同步和只读校验，覆盖 Expo/Android/runtime、更新服务、关于与阅读文档页、官网桌面/移动下载与备用值、手册缓存、双 README、功能矩阵、公开和内置手册、站点日期与发布公告。缺文件/定位规则在写入前报错；版本码单调增长且重复执行幂等，历史记录和独立公告保留。发布参数动态读取版本/APK，只通过纯净仓库同步脚本发布 main 和新 tag，不再强推或上传私有分支。明确授权的小版本可跳过过程文档，签名仍须验证。覆盖：`release-version-sync.test.cjs`。

本轮已通过 2026-10-14 production Android OTA 发布（运行时 2.8.9.1，更新组 fa0f0973-6190-4443-98b5-fb36283376bc）：系统管家状态区按实际事件逐行展开，折叠箭头紧邻当前阶段，红/绿/灰节点区分失败/已完成/等待；隐藏寒暄和简单本地时间任务进度，移除重复重试/取消操作。首次空草稿可正常讨论，空回包不清除已有设定；临时系统操作暂停共创且清除授权，明确取消终止共创，迟到输出静默忽略。设备时间仅注入本轮动态上下文，保持稳定提示词前缀。系统管家及缓存定向测试 70/70 通过，类型检查通过；按用户要求，本轮只验代码，不要求模拟器。
维护要求：新增、删除或显著改变用户可见功能、后台能力、数据模型、导入导出流程、AI 能力、隐私/备份/发布流程时，必须同步更新本文档。

聊天呈现补充：思考标题无背景且与正文同字号，无实时读秒，结束后显示括号用时并紧邻展开箭头；预览至多七行、不足七行自然撑高，采用同一原生文本树底部裁切显示最新内容，无内部手动滚动，完整展开随整页滚动。深度规范思考展开物理与交互边界（2026-10-24）：彻底移除反转列表顶部 800px 伪垫高层（Scroll Headroom）与异步尺寸变化的滞后跳转，根除展开后上方无消息空白可随意滑动及消息被顶入屏幕底部的严重缺陷；在短对话（未铺满屏幕）中，消息天然靠底并向上借用充裕空白自然平滑展开，确保思考全文 100% 完整可见不被输入框遮挡；在长对话（具备滚动空间）中，严格保持按钮物理 0 位移向下顺延展开，目标偏移严格受限于真实内容最大滚动边界；移除顶层展开状态，实现点击展开思考时主页面零全屏 Re-render。单阶段原子展开锁（Single-stage Expand Lock）在生成大段文本展开时先锁住预览视口，待全量文本原生测量完成一次性展开，杜绝两阶段展开导致锚点计算跑飞；展开操作即时清空发送后残留的 700ms 自动跟随定时器。伴侣提示词补充约定轻量化：日常交流、Markdown 排版与局部 HTML/JS 教学示例按常规自由输出无需完整外壳，仅制作完整应用时才生成自包含 HTML5，消除伴侣在开空对话时频繁过度输出 HTML 的倾向。切换在布局阶段补偿标题位移，取消下一帧纠偏、容器替换及点击触发的尾部回放，Android 切换时放宽原生裁剪。首个正文包到达即独立结束并折叠思考，时间写入现有 generationMetrics 快照，不包含正文输出；续写保留原思考边界。回前台主动发布任务持有的最新内容，无后续数据包也可恢复；已结束任务对齐持久记录，订阅重连回放最新补丁，卸载清理与监听依赖更新分离。空间/线程/生成代次守卫拒绝旧异步结果。白底用户消息、填充编辑按钮和正文对称边距保持。历史缺失阶段时间继续兼容旧数据，不能补算精确用时。

操作卡片纠正：页面跳转、昵称确认、IP 选择恢复原有 `SystemActionConfirmCard` / `SystemIpSelectCard` 展示和原有间距；角色创建结果复用同一既有卡片。状态区的简化只作用于进度时间线，操作确认卡保留取消、查看详情、再次前往及有效撤销。共享卡片样式文件与改动前一致；失败和简单任务仍不增加重复状态操作。定向测试 72/72、类型和差异检查通过。纠正于 2026-10-14 19:10:14 +08:00 发布 production Android OTA，runtime 2.8.9.1，更新组 dcb87ef6-f89a-464d-ad0b-ffb0ea19d3ac，源码提交 597f8616e1072551e62e3ac7ca6dd91f00b07a41；update:view 与最新 production 列表核对成功。

---

## 1. 文档用途

本文档是 Pixory 的全量功能索引，用于：

- 快速理解当前产品范围。
- 支撑后续需求拆分、测试计划、发布说明和交接。
- 防止功能迭代后文档滞后。
- 帮助 review 时判断改动是否遗漏相关模块、数据、测试或隐私边界。

本文档依据当前源码、测试和发布配置整理。若与代码冲突，以代码和可运行行为为准，并优先修正文档。

本文档同时承担最新能力基线；公开 `main` 中不再保留功能矩阵快照或旧版 Spec、Plan、Review、规划、算法、调研文档。版本过程证据由本地私有 `local-work` 分支的 `版本文档/` 按正式版本归档，独立开发的新 AI 软件不属于 Pixory 功能矩阵，两者不默认共享产品定位、数据或发布计划。

### 状态定义

| 状态 | 含义 |
| --- | --- |
| 已实现 | 已存在完整用户入口和主要业务闭环，代码与现有验证均支持该声明 |
| 部分实现 | 主链路可用，但存在明确缺口、边界或尚未闭环的文件/数据/恢复路径 |
| 实验/不上线 | 仓库中存在代码或内部入口，但当前不属于正式发布范围，不应写入用户宣传或发布说明 |
| 规划 | 仅有方向、设计或预留接口，不能作为现有能力宣传 |
| 待验证 | 代码或文档存在，但缺少足够的运行时、设备端或端到端证据 |

---

## 2. 顶层功能域

| 功能域 | 当前状态 | 主要用户价值 | 关键入口 |
| --- | --- | --- | --- |
| AI 陪伴聊天 | 已实现，重点方向 | 长聊天、角色扮演、记忆、资料上下文、分支和流式回复；支持推挤缩放式（Push & Scale，默认，含 1300px 超长焦微透视、恒定 28dp 大圆角、-4dp 天际线对齐、54% 光学哑光景深雾化、视口通底零截断与纯白悬浮岛屿收纳）与经典覆盖式侧边栏双样式切换；长聊与伴聊消息列表统一摘要净化（`formatMessagePreview`，规范语音为 `[语音] xx` 或 `[语音] 3"`、图片为 `[图片] xx` 或 `[图片]`、表情为 `[表情名称]`、文件为 `[文件] xx`，彻底剥离结构化 JSON 与内部系统提示/控制标签，杜绝技术细节与内部提示词泄漏）；思考过程推理可视化与平滑折叠展开；发送图文时图片在 AI 开始回复时即时呈现无需等待生成结束；支持长按彻底删除生成失败或卡住的梦境卡片；临时会话支持一键保存为新角色卡并立即应用；移出隐私空间提供双层风险提示和确认面板；DeepSeek V4 官方识图模型白名单支持；解开私密空间（Personal Space）后台记忆维护挂起锁，确保隐私会长聊正常提炼摘要与画像；剥离通用 System Prompt 开篇的代码外壳强偏置（STABLE_INTERACTIVE_GIFT_POLICY 净化），置顶角色人设沉浸框架与情感共鸣约束，彻底消除模型态度敷衍与冷淡问题；新增「文件传输助手」（`pixory-file-transfer`）系统特权会话，与系统管家并列带有「系统」微标与专属静态/SVG绿色文件矢量头像，提供随手记与文件/媒体极速暂存中转，纯本地直存且不调用大模型；底部输入区集成相片、文档、剪贴板快捷上传条，右侧专属精简中转抽屉支持搜索、按媒体/文档/文本分类速查、置顶及清空记录；左上角保持无缝开启综合记录抽屉；全新「系统会话」设置页与全局搜索联动独立控制系统管家和传输助手启停；系统管家与传输助手欢迎卡片全面采用纯净矢量图标，全域杜绝 Emoji | `AiHomeScreen`, `AiChatScreen`, `AiPushScaleDrawerStage`, `AppearanceSettingsScreen`, `SystemSessionsSettingsScreen`, `FileTransferDrawer`, `FileTransferAvatar`, `src/ai/`, `formatMessagePreview`, `SettingsScreen`, `DeveloperModeSettingsScreen`, `DiagnosticsSettingsScreen` |
| AI 伴侣短聊天（IM 模式） | 已实现，核心突破 | 类似微信的高拟真即时陪伴交流；五层不间断上下文装填（Layer 1 永固人设与正例协议、Layer 2 多源融合连续记忆快照［合并持久化 L1_SLOT + 世代槽位 + 常驻置顶/高权核心事实 Core Profile Facts，预算扩展至 900 tok，彻底消除初始 `{}` 空对象遮蔽与污染］、Layer 3 锚定历史［完整保留 N 个双边对话轮次］、Layer 4 绝对生活时钟、动态气泡形态软提示、关联召回场记与人设稳态末尾锚点 Persona Anchor，预算扩展至 360 tok 且增加 `<memory_data>` 防注入包裹、Layer 5 闭合用户输入，KV Cache 命中率 ≥ 90%）；拟人化认知记忆新陈代谢与遗忘引擎（四级生命周期治理［L0 钢印层、L1 状态层、L2 褪色层、L3 瞬时层］、准入大筛网语态过滤［拦截夸张情绪宣泄与戏谑约定，杜绝生活画像误污染，放行共情倾诉至情景事件］、写前候选冲突检索与语义演进覆写［SUPERSEDE 指令同步软删除与 FTS5 剔除，解决零字面重叠下的旧偏好与事实演化覆盖］、动态半衰期衰减与记忆清晰度［优先取 createdAt 物理起点避免双重奖励叠加，移除 720h 上限与 0.40 铁底，retentionBoost 命中拉伸，解耦断头台防误杀模糊区］、模糊褪色召回 Fuzzy Recall［0.30~0.65 模糊带剥离精确日期前缀并注入自然口吻约束提示，杜绝张口报年月日之机械感］、深度睡眠代谢服务［会话挂载/夜间心跳/手账反哺异步代谢，L3 瞬时清理、L1 槽位降级、内存倒排索引远期零散情节聚类折叠升华至 L2_FACT、L2 僵尸记忆淘汰、FTS5 optimize 瘦身］、显式遗忘闭环［FORGET_REQUEST 即时截断批处理队列并软删除近 30 分钟未锁定记录］）；拟真回复形态规划（`burstShapePlanner` 彻底打破 2~3 条机械模式，按输入字数、时段与负荷动态规划极简单句、经典双句、连环短促发、完整长段与事后追聊，严格防连续同形态）；真人打字时间线调度（`humanTypingTimeline` 模拟首句阅读思考耗时、按字数动态击键、思考停顿与快速顺发，忙碌状态延迟响应，整轮 14s 软上限）；复合记忆召回与短文本强化（`recallQueryBuilder` 自动吸纳前文实体强化“嗯/然后呢”极短输入召回，记忆使用冷却防重复；`commitmentExtractor` 自动提取未来待办约定）；首句 0 延迟即刻分发与语义端点检测（`InputAggregator` 0ms 即刻发出完整句，消除 2s 机械等待，首气泡 0ms 闪电上屏，紧凑打字节律 180~600ms）；老用户数据清洗（自动归零 SQLite 中残留的旧 `debounceWaitSec: 2` 历史默认值）；72h 不间断心跳伴随守护（彻底废除连续 3 次未回永久休眠，唯一休眠判定放宽至断连超过 72 小时，永不静默关闭）；前台高粘度三阶自适应伴随引擎（Stage 1: 3.5~5s 顺势追聊；Stage 2: 8~12s 趣味互动；Stage 3: 25~35s 温柔留白并平滑衔接后台预约闹钟）；伴聊人设稳态与自主随机性加固（`imContextBuilder` 引入 `PROACTIVE_INPUT_PREFIX_REGEX` 100% 拦截并阻断前台追聊指令泄露至 Layer 5 用户节点，消除角色权限倒错与人格崩塌；重构三阶前台伴随提示词彻底清除“炸鸡还是烤肉/偷笑/好啦不吵你啦”等 Few-shot 语义引力井，转为世界观与角色相处界限自适应的心理可供性指引并充分捍卫 `[PASS]` 自主留白权与随机性；`imProactiveFallbackPlanner` 彻底去除“喝美式/戴耳机/看手机”等现代特定消费道具，重构为跨时代 24 小时中立在场生活状态；唤醒与杀后台断联补偿全链路透传 `personaAnchor` 稳态末尾锚点）；输入草稿感知避让（Draft Sensing，输入框正在打字 0ms 挂起追聊计时器绝不抢话）；消除后台预埋 `staged` 闹钟误杀前台 3.5s~5s 续话的死锁bug，确保前台续聊即刻生效；Markdown 代码块与 HTML/SVG 气泡防碎片化完整性保护（`tagAwareStreamParser` 代码栅栏追踪、未闭合围栏自闭合自愈与嵌入裸 HTML 整块保护，彻底杜绝输出 HTML 时碎裂成数十个单行小气泡）；HTML/SVG 气泡独立沙箱即时运行入口（`extractSandboxExecutableCode` 容错提取嵌入 HTML 与未闭合代码，气泡右侧微型圆圈三角形运行按钮直接呼起全屏沙箱）；长按消息操作菜单“选择文本”并复用长对话选择文本页面（划词选词、源码/预览、复制与导出）；顶栏移除通讯录图标并实现靠左对齐极简排版；消息列表回复视口错位上移与滚动抖动根除（彻底移除 JS 竞态定时器，引入 FlashList v2 原生 `maintainVisibleContentPosition: { autoscrollToBottomThreshold: 250, animateAutoScrollToBottom: false, startRenderingFromBottom: true }`；全域 `React.memo` 优化，流式生成时历史气泡重绘率降低 95%；接入「回到最新」动效按钮与未读定位 3 秒高亮提示；SQLite 访问层增加指数退避防死锁重试）；手账日记本地时区与版本撤销重构（`diaryDayWindow` 彻底根除 UTC 本地跨日错位 bug、非对话杂音清洗；凌晨 00:00~06:00 自动人性化向前回溯锁定昨夜对话；`imDiaryGenerator` 联动当前会话模型与全局 Key 探测链，彻底根治模型连接失败；`imDiaryRepository` 自动备份上一版历史手账栈并支持撤销恢复，同日聊天信封卡片幂等更新；`ImDiaryBookModal` 重做操作菜单支持重写、补写与撤销，重写后停留在当前页不跳末页）；系统通知管理中心（`NotificationSettingsScreen`，提供系统权限检测与跳转、通知总开关、防偷窥模式［隐藏消息详情正文，仅提示‘你收到了一条伴侣消息’］、隐藏角色真实名称与身份、夜间勿扰免打扰时段 23:00~08:00、振动提醒；点击系统通知 Deep Link 直达对应伴聊会话）；双空间未读数物理隔离（`FloatingRootFooter` 严格按 activeSpace 独立计算未读红点，彻底解决普通空间消息标记进入隐私空间 Bug）；隐私空间视觉极净化（全面移除右上角蓝色‘隐私模式’药丸浮标与全屏白色遮罩）；清空聊天记录深度联动与选项弹窗（用户自主选择“清空全部［含日记与记忆簿］”或“仅清空消息”，同步置空顶栏生活状态跑马灯与 Epoch 锚点，杜绝旧上下文残留）；气泡专属配色“+ 自定义”弹窗（`ImCustomBubbleColorModal`，12 款精选调色板、十六进制色号大写格式化输入、实时气泡预览、基于 YIQ 亮度加权自适应对比度黑白字色）；六大鲜明说话风格（自然亲切、温柔共情、元气幽默、傲娇口嫌、甜糯粘人、清冷酷飒）与专属称谓全链路生效（占位符移除“宝贝/主人”不良词汇，`companionCallName` 深度注入角色认同契约）；纪念日输入框软键盘弹起遮挡修复（`KeyboardAvoidingView` + `paddingBottom`）；抽屉无缝直切伴侣（消除动力学共享值初始跳变为 0 引起的视觉闪烁）；微信级全链路未读红点（底栏 Tab 红点、顶部标题 `伴聊 (N)`、会话行 Badge、联系人抽屉徽标）与右下角悬浮“↑ X 条新消息”回弹气泡（`ImUnreadJumpBubble`）；独立解耦高拟真表情系统（`src/components/emoji/`，纯极简黑白线框图标无文字导航 Tab、7 列严格栅格排布、实事求是动态渲染最近使用［未发时 0 高度隐藏，真实发送最多 2 行 14 格 LRU 淘汰］、内置 49 款高清 3D 动态大表情［5 行 35 格经典小黄脸+第 35 格横向三点更多按钮，2 行 14 格精选萌宠/道具/手势贴纸，256×256 WebP/APNG 无框透明单发上屏，触发伴侣情绪感知］、15 行 105 格静态 Emoji［插入光标图文混排］、11 行 77 格固定 3 列强对齐精选颜文字库、Tab 2 采用 MaterialCommunityIcons 线框酷炫墨镜笑脸 `emoticon-cool-outline`（具备完整圆形脸庞、墨镜与笑脸微弯线条，彻底消除旧单副眼镜无脸的突兀感）聚合全量超级表情瀑布流无多余小标题、表情面板高度升至 365px 展现更多内容、输入条引入 520ms 极慢平缓贝塞尔下落曲线（`Easing.bezier(0.25, 0.1, 0.25, 1)`）与平稳高度接力（文字键盘升起时表情容器平缓降落，落到键盘位置即停，彻底根除切换时的下落与剧烈弹跳）、按需下载大表情扩展中心［`StickerMarketModal` 与 `StickerPackDownloadService`，四大 30+ 扩展包总计 125 款按需下载释放空间，以小黄脸进阶包为主体，无任何装饰性 Emoji 符号，下载的超级表情实时汇聚于超级表情 Tab 2 纯净瀑布流呈现并支持长按删除］、聊天列表空白处与滑动交互联动折叠表情窗口（通过 `ImInputBarRef.collapse` 触发 520ms 丝滑慢速缓动滑入底栏）、Tab 4 顶部平铺三独立按钮［拍照制作、相册选图、导入 ZIP 包］免弹窗直达、内置 `ImageManipulator` 毫秒级中心 1:1 安全裁剪［320×320 PNG，彻底根除系统原生 uCrop 白底白字冲突］、输入条快捷表情按钮复刻微信原生切换［展开表情时切换为微信同款圆形键盘图标 `WeChatKeyboardIcon`，收起时切回笑脸］、输入栏与软键盘无感接力调度［切文字延后卸载表情面板直到软键盘就位，输入框停在键盘高度绝不触底弹跳；切表情从键盘高度平滑升起］、表情面板退格键支持单击与长按连续快速连删［350ms 延时，75ms 极速连删伴随触感振动］、全面达标 >= 44dp 触控标准、`StickerBubbleRenderer` 大贴纸渲染器与快捷退格键，零耦合可跨场景任意迁移）；AI 双向表情感知与自主发送系统（`StickerSemanticResolver` 16 核心中性情绪桶与中英文别名匹配、可拓展自定义表情包即插即用注册与注销机制［`registerCustomStickers`, `unregisterCustomSticker`, `unregisterPackStickers`］、角色排他［`styleExclude`］与 Unicode Emoji 补偿映射；`imContextBuilder` Layer 1 协议追加 58 Token 极简常量协议［16 中性二字锚点、防出戏约束、保留普通 Emoji 杜绝情绪截肢，保住 95%+ Prefix Cache］；Layer 3 基于真实用户轮次的双轨滑窗剪枝［<= 2 轮原样保留强化输出格式遵循，> 2 轮静默剪枝切断复读雪崩］与单回合多气泡合并保证角色严格交替契约；Layer 5 用户单发/连发表情拟真互动旁白；`TagAwareStreamParser` 全半角容错隐式气泡独立切分与 15 字符 Buffer Hold；`BurstMessageDispatcher` 确定性冷却物理硬锁［`turnsSinceLastSticker` 风格档位 1/3/5 轮］、尾部锚定［Tail-Anchor，文字在前大贴纸在队尾 +250ms 延迟］与冷却拦截时的无感 Unicode Emoji 补偿；承诺提取［`commitmentExtractor`］与手账日记［`diaryDayWindow`］物理隔离防记忆污染）；代码物理隔离（`src/im` 与 `src/ai` 0 依赖，`ImChatScreen` < 150 行）；伴聊首页两楼物理弹性下拉抽屉与二楼角色库瀑布流（`ImRoleSecondFloor` / `RadialOrbitHeroTransition`：微信级一体化单物理轴推拉、亮暮灰高对比底座 `#4A4668` 配合顶部 1px 微光分界线 `rgba(255, 255, 255, 0.22)`、文字垂直居中、彻底删除 240px 护盾死空间、根容器 `onLayout` 真实物理高度驱动停靠精准适配全面屏手势条、瀑布流底部避让 paddingBottom 提升至 insets.bottom + 116 彻底杜绝卡片遮挡；列表随下拉平滑透明度淡出消除深色断层与白块；二楼上推增加 10px 死区并在上推时显露出会话列表幕帘；列表滚动容差放宽至 4px 消除长列表手势冲突；开启伴聊直接秒开聊天页并在后台静默复位二楼；角色卡点击直接 1 步放大绽放入详情页、下滑退出详情才滑入 3D 长廊左右切卡、退回瀑布流单调减速曲线消除尺寸跳变；上线长按会话管理弹窗与折叠聚合二级列表页，支持置顶、折叠、软删除、彻底清空聊天记录，折叠会话正常收发消息）；首页初次进入提供零文字物理微动窥视 Entrance Peek & Rebound 配合 36x3.5px 极简微透明把手指示线，点击任意角色头像直达角色卡详情页；角色横滑轨组件化抽象为通用 `AiRoleCardRail` 并在长聊与伴聊统一复用） | `AiHomeScreen` (伴侣消息), `ImHomeScreen`, `ImChatScreen`, `ImThreadList`, `AiRoleCardRail`, `ImRoleSecondFloor`, `RadialOrbitHeroTransition`, `ImContactDrawer`, `ImInputBar`, `BubbleRegistry`, `zeroVectorRetriever`, `imContextBuilder`, `imRolePromptResolver`, `formatImPreviewText`, `formatMessagePreview`, `burstDispatcher`, `imDiary`, `ImDiaryDatePickerModal`, `ImDiaryPageSpread`, `imDiaryPagination`, `imAgencyEngine`, `imTagParser`, `ImMarqueeText`, `GlobalHeartbeatEngine`, `imWakeupGenerationService`, `imBackgroundStreamService`, `imProactiveFallbackPlanner`, `turnNormalizer`, `imEpochRepository`, `epochLockstepCoordinator`, `ImCompanionPersonaModal`, `ImCustomBubbleColorModal`, `memoryExtractionBatcher`, `ImUnreadJumpBubble`, `ImNotificationHelper`, `MessageTextSelectionModal`, `burstShapePlanner`, `humanTypingTimeline`, `recallQueryBuilder`, `commitmentExtractor`, `diaryDayWindow`, `useDiaryActions`, `NotificationSettingsScreen`, `EmojiPickerPanel`, `StickerBubbleRenderer`, `EmojiRecentService`, `StickerSemanticResolver`, `CustomStickerService`, `customStickerRepository`, `StickerMarketModal`, `StickerPackDownloadService`, `WeChatKeyboardIcon`, `memoryMetabolismService`, `memoryIntentClassifier`, `ImThreadActionSheet`, `ImFoldedThreadsModal` |
| AI 交互式沙箱系统 | 已实现，创新核心 | 伴侣为本、沙箱为器的轻量按需架构；长聊与伴聊（IM）双域全打通；支持 2D 小游戏、WebGL/Three.js 动效、动态图表与可交互网页；伴聊气泡智能拦截 HTML/SVG 源码并收拢为 292dp 黄金比例工件卡片与取景框，彻底终结源码刷屏；三段式隔离前置情话与后置交待，最新消息原位白底取景框（Mini-Stage 0.42x 相机等比视口，流式首行嗅探即时占位与极光 HUD 线框舞台）；全会话单例互斥调度保证物理级至多 1 个活跃 WebView，极速省电与低端机显存保护；原地方框无缝形变展开/收拢与全屏畅玩、横屏旋转；全域沙箱入口覆盖；纯净独立离线可执行 HTML5/SVG 制品导出 | `src/services/sandbox/`, `AiSandboxArtifactViewfinder`, `AiSandboxArtifactCard`, `AiSandboxViewerModal`, `AiCodeBlockView`, `AiRichHtmlBlock`, `AiMessageTextSelectionModal`, `AiMessageContent`, `TextBubbleRenderer`, `ImChatList` |
| 角色日记 | 已实现，首版 | 以北京时间和角色为单位保存当日私密日记；手动、自动和后台唤醒均通过同一准备链路冻结当前已采纳分支、角色提示、线程摘要和来源消息，持久 wake 真正到期时会重新解析用户此刻采用的分支，再创建不可变生成快照。内容优先使用今日完整问答，不足时从历史补齐到最近 30 个完整轮次，并为消息附北京时间；模型会明确区分“今日证据”和“历史背景”，无证据时不得虚构。自动日记由应用初始化/回前台统一协调，Personal 仅在已解锁且任务令牌有效时运行；精确本地口令仅在已启用且绑定角色卡的会话中提供非打扰确认。任务由独立运行时持有，退出聊天页仍会完成，长时间中断的 `generating` 任务在前台恢复；Android 通过 AlarmManager、receiver 与带低打扰系统常驻提示的短时 `dataSync` 前台服务启动 Headless JS，无法使用精确闹钟时退化为 inexact alarm，若系统仍拒绝后台启动则保留 SQLite 任务并在下次前台协调时恢复。完成卡片保存冻结来源版本及有效消息哈希，始终锚定在对应触发消息之后，刷新、分页和重进页面不漂到列表底部；用户确认纳入上下文的最近日记会独立注入，不会被较新未选择日记覆盖 | `src/ai/diary/`, `DiaryChatCard`, `DiaryDeckPager`, `DiaryReaderScreen`, `CompanionInnerLifeScreen`, `PixoryMediaModule` |
| 陪伴内心运行时（情绪、梦境、思绪） | 已实现，V1 核心 | 情绪/关系投影、角色梦境、离线思绪、内心产物仲裁和后台恢复均已进入主分支；思绪是给 AI 的低权限一次性动态材料，梦境只有用户明确允许才可进入后续上下文，情绪与关系状态不直接暴露内部数值；聊天页支持长按彻底删除失败或卡住的梦境卡片 | `src/ai/companion/`, `src/ai/dream/`, `src/ai/thought/`, `CompanionInnerLifeScreen`, `CompanionRuntimeManagerScreen`, `DreamReaderScreen` |
| 陪伴手帐与数据面板 | 部分实现 | 关于页保留“故事开始”介绍，并在“岁月有声”下按“启程 / 心灵触碰 / 时光守候 / 世界共建 / 光影整理”展示可验证成就；分类可独立展开，单条成就详情互斥展开，成就来源失效后重新投影或隐藏，支持未读点与可用来源跳转；关于页提供随天数数字自增播放的成就彩蛋，带有日期、跳转指示器并在焦点切换时自动暂停恢复 | `AboutScreen`, `JournalAchievementChapter`, `JournalAchievementRow`, `journalAchievementService.ts`, `journalAchievementRules.ts`, `MilestonesDetailScreen`, `milestoneService.ts`, `DaysPlaybackEgg` |
| IP 资产库 | 已实现，基础能力 | 按 IP 管理图片、视频、分组、标签、备注和封面；首页 IP 卡片更多弹窗支持“开始聊天”快捷入口以快速进入对应 IP 会话；首页、分组和标签总览采用 SQLite 分页与虚拟列表，IP 详情分组预览在数据库层限制为 4 条；首页冷启动只显示 1 个与真实卡片共用宽高/radius token 的 skeleton 并叠加 shimmer，不再显示“正在读取本地资产库”提示；IPCard 列表热路径已移除传感器/超大镜面高光，首卡与后续卡使用同一轻量渲染路径；仅首卡使用 high priority 与 0ms transition，其他卡 normal + 120ms，减少第二卡先显示、首卡后闪 | `HomeLibraryScreen`, `IPCard`, `IPCardSkeleton`, `IpDetailScreen`, `GroupOverviewScreen`, `GlobalGroupsScreen`, `TagsOverviewScreen` |
| 创意视觉动效与反馈 | 已实现，按性能门禁收敛 | 边缘极光入场（ParallaxLightSweep）、AI 档案行星与星轨系统（OrbitalSpectralRing）、聊天声纹频谱反馈（RhythmBars）、磁性流体拉伸交互（MagneticLiquidContainer）继续用于非列表热路径；ParallaxLightSweep 在不可见或应用后台时取消循环。原 3D 陀螺仪卡片组件仍保留源码，但首页 IPCard 已不挂载传感器和超大镜面层，避免首卡延迟闪现与滚动抢手势 | `ParallaxLightSweep`, `OrbitalSpectralRing`, `RhythmBars`, `MagneticLiquidContainer`, `IPCard` |
| 图片/视频导入 | 已实现，Android 删除确认待真机验收 | 批量导入、复制原文件、生成独立缩略图、重复检查、导入批次；相册素材按来源创建时间记录来源序号，ZIP/PIXORYPACK 按压缩包条目顺序记录来源序号；Android 11+ 使用系统删除确认，取消/不支持时保留原文件并回退；图片+视频混选共享一次 1000 文件/单文件/32GB/磁盘余量 gate 和同一实际写入 commit budget，并在 metadata 文件 I/O 前按数量和已知大小早拒绝；缺失 metadata 固定最多 4 worker，实际复制字节变化时在数据库提交前复查；整次混合导入进入 Personal task barrier；DocumentPicker cache URI 只有被明确标记为本页所有且仍位于 Expo cache 时才在移除/离页清理 | `ImportImagesScreen`, `mediaFilePickerService`, `mediaImportPreflight`, `mediaImportPreflightRuntime`, `boundedFileConcurrency`, `imageImportService`, `videoImportService`, `mediaSourceDeletionService`, `PixoryMediaModule` |
| 图片浏览与整理 | 已实现，真机压力待验证 | 全部素材、分组素材、标签素材、收藏、回收站和批量管理统一采用 48 项 keyset cursor 与有界 FlatList window；筛选阅读器携带完整查询 scope，不会在当前已加载页停止。全部素材与分组素材缩略图长按响应延迟调整，减少下拉滚动时误触长按菜单；图片阅读器使用 81 项锚点窗口、40 项边界游标页、自适应编码/解码预取、并发上限、Personal 内存会话缓存、退出位置恢复和浏览记录合并写 | `VirtualizedAssetCollection`, `useMediaCursorCollection`, `AllImagesScreen`, `ImageViewerScreen`, `mediaPrefetchPolicy`, `mediaReaderSessionCache` |
| 视频体验 | 已实现，真机音频/解码压力待验证 | 视频详情、沉浸播放、横竖屏、进度偏好；竖滑使用 previous/current/next 三槽封面视觉、可中断跟手 settle，单播放器在新视频首帧渲染后撤除封面，避免换源黑帧和封面跳变；队列使用 61 项锚点窗口/40 项边界页；0.5×–3× 统一先启用保音高再写 playbackRate | `VideoDetailScreen`, `VideoPlayerScreen`, `videoSwipePolicy`, `videoPlaybackRate` |
| 分组与标签 | 已实现 | 全局分组、IP 分组、标签管理、多选、筛选和结果页；分组采用 SectionList，标签采用双列 FlatList，热门/最近标签由 SQLite 排序并限制返回数量 | `GlobalGroupsScreen`, `GroupOverviewScreen`, `TagsOverviewScreen` |
| 搜索 | 已实现 | 全局素材搜索、全局搜索历史（支持年/月/日三级树状分组与统计，无缝路由返回）、AI 聊天搜索；全局功能卡片与系统管家导航入口共享单一数据源注册表（`searchActionCatalog`，含性能设置、外观设置、聊天视觉定制、个人信息、密码与安全、更多设置等全量入口自动联动）；全局素材搜索约 250ms 防抖，并在 SQLite 层按 IP、分组、标签、素材分类筛选且每类限制 20 条，避免先全量载入再由 JS 过滤 | `GlobalSearchScreen`, `GlobalSearchHistoryScreen`, `AiChatSearchScreen`, `searchActionCatalog`, `searchActionService`, `ipRepository`, `groupRepository`, `tagRepository`, `imageRepository` |
| 批量管理 | 已实现 | 多选、批量移动、批量打标签、批量整理、撤销；主列表 cursor/虚拟化，“当前已加载”选择范围明确；软删除后的数据库记录一次批量回读，文件核验最多 4 worker | `BatchManageImagesScreen`, `BatchImageOrganizePanel`, `boundedFileConcurrency`, `tagRepository`, `videoMoveService` |
| 重复检测 | 已实现 | exact hash、visual hash、重复审查、跳过导入；exact 分组先由 SQLite `GROUP BY contentHash HAVING COUNT(*) > 1` 缩小候选，再读取完整素材行；visual 路径保持原召回语义 | `imageRepository`, `DuplicateReviewScreen`, `duplicateDetectionService` |
| 回收站 | 已实现 | 软删除、恢复、清空、过期清理 | `TrashScreen`, `trashService` |
| 备份/导入导出 | 已实现，Manifest V2 | 普通、单 IP 与隐私包覆盖数据库、原图/视频、缩略图、AI 文档、聊天附件和角色头像；导出关系使用 400 ID 分块 bulk map，托管文件读取/哈希最多 4 worker、复制去重顺序提交；恢复前校验相对路径、大小与 SHA-256，按内容去重并事务合并，SecureStore 密钥不进入备份 | `BackupScreen`, `BackupExportManagerScreen`, `backupService`, `managedBackupService`, repositories |
| 消息与长文本导出 | 已实现 | 消息选区与沙箱弹窗支持多格式导出（Markdown、纯文本 TXT、完整 HTML、标准化 JSON、PDF）；智能区分普通文档与独立可执行 HTML/SVG 制品，导出纯净可运行无转义零水印文件并自动补全 UTF-8 声明；支持一键复制到剪贴板、系统原生文件分享及 SAF 保存到系统目录 | `DocumentExportModal`, `exportDocumentService`, `exportDocumentGenerators`, `AiMessageTextSelectionModal`, `AiSandboxViewerModal` |
| AI 文档流与智能文档 Agent | 已实现，核心突破 | 支持四大模型提供商（DeepSeek / Claude / Gemini / OpenAI 兼容中转）统一 Tool-calling 编排；纯函数内核零宿主依赖（FCIS）与 G1/G2 机器门禁；VFS 工作区与 CAS 检查点原子快照与回滚；Word OOXML 原位手术引擎（5.2MB 单行 XML 13ms 双指针游标扫描、跨 Run 虚拟文本双向投影、公章与图片半开区间字节守恒保护、表格网格列宽守恒、企业级修订留痕）；PDF 盒内弹性微缩拟合（二分字号缩放与字间距微调）与 3000ms 心跳看门狗；原件 100% 只读与全新独立派生 PDF/DOCX 生成；支持新建流与补丁流双轨协议（`[DOCUMENT:]` 与 `[DOCUMENT_PATCH:]`，彻底消除局部切片输入与全量标签输出的结构性数据丢失矛盾，仅输出差量块并原位合成，未提及章节 100% 字节保留）；三态流式生命周期实时感知（流式骨架脉冲态、编译器排版烘焙态、常态就绪态，彻底根除 30s 假死白屏感）；CAS 直连存储池直入（`casBlobStore.ingestFileUri`，彻底切断大 Base64 膨胀 SQLite 路径，SQLite 单条仅存 <1KB 元数据指针）；智能双链表文档锚点寻址（`resolveTargetDocumentMessages`，支持族系寻根、版本回退与标题匹配）；微信经典极简文档卡片一比一复刻（`DocumentBubbleCard` 与 `WeChatFileIcon`，严格参考微信原生原型 1:1 像素级复刻：宽度固定 265px、最小高度 78px、圆角 5px、中性纯白底色配合 0 1px 2px 细致阴影与微边框；左侧 15px 标题中位截断保留扩展名 + 12px 文件大小；右侧 42x52px 矢量切角翻折图标与居中原生粗体字标；覆盖 Word/PDF/HTML/MD/Excel/PPT/TXT/ZIP/图片/代码/未知 13 大格式自适应分类与通用兜底；尖角使用 `ImBubbleBeak` 纯白对称贴合且顶偏移统一为 14px；解除系统文件选择器格式白名单限制；动画状态组件隔离与全量记忆化性能加固）；极简平铺沉浸式文档阅读器（`ImDocumentMinimalViewer`，坚决摒弃厚重外壳与深黑浮层遮罩，Clean 正文模式与 Diff 留痕模式一键切换、字数/段落统计与一键导出；内置智能防伪与 CAS/本地文件自愈回溯，Markdown 平滑兜底展示零报错）；数据完整性与持久化（`SerializedImDocumentPayload` 完整双向序列化 `content` 正文，彻底根治 SQLite 重新加载后正文丢失退化为标题的故障；CAS 存储与原件二进制解算闭环）；系统级物理文件分享（`exportDocumentToShare` 接入 ECMA-376 OOXML 纯 JS Store 模式免 Native 依赖打包，并通过 `expo-sharing` 直调 Android FileProvider 发送真实带 MIME 的物理文件实体，杜绝单行文件名文本分享）；标签过滤与隔离（流式未闭合文档侦测与三段式剥离，聊天气泡仅承载对话语，文档正文完全由卡片承载，严禁刷屏和暴露 `[/DOCUMENT]` 标签）；短伴聊与长聊天（`AiChatScreen`）全域统一高内聚复用，完整支持发送真实文件、文档卡片渲染、即开即读与一键分享导出 | `src/services/agent/`, `src/services/sandbox/`, `src/components/document/`, `ImDocumentMinimalViewer`, `DocumentBubbleCard`, `DocumentBubbleRenderer`, `ImChatScreen`, `AiChatScreen`, `AiMessageBubble` |
| 统一工业级多格式文档阅读器 | 已实现，核心突破 | 高内聚低耦合统一架构，支持 DOCX、PDF、Markdown、HTML、PPTX、TXT 6 大主流格式端侧本地高保真离线渲染；DOCX 引入 `docx-preview` 现代渲染引擎（支持精确页边距自适应覆盖、复杂表格与图像宽度百分百防溢出、Consolas/Courier 等宽代码保留缩进与换行，暗色主题文字自适应反色，告别纯文本折叠；修复页眉负边距削顶、单节连续滚动防表格截断，并引入毫秒级纯 TS 语义大纲双引擎智能自愈兜底）；PPT/PPTX 引入 `pptx-preview` 空间几何与母版主题引擎，支持【全部幻灯片纵向流（对齐 WPS 移动预览）】与【16:9 全屏居中高保真放映（配备底部胶囊控制器与切页手势）】双模无缝切换；段落行高注入 `Math.max(1.25, m)` 与样式层 `line-height: 1.35 !important` 双重防御彻底杜绝文字垂直挤压重叠；SQLite 数据库层原生支持 PPTX 附件类型热迁移与持久入库；Native/Chromium 高速 Base64 解码与 WebView `injectJavaScript` 状态热同步（切换 Aa 字号与主题不白屏重刷）；WebView 统一采用 about:blank 本地安全源，彻底根除 Android SSL 报错；PDF 接入原生 C++ `PdfRenderer`，升级 2.75x~3.5x 视网膜高分采样率（彻底消灭文字模糊），通栏铺满全屏，支持页码跳转与大纲索引；Markdown 采用 `marked.js` + `KaTeX` 毫秒级离线渲染；HTML/SVG 支持【运行沙箱预览】与【源码等宽行号】极简分段双模切换（视觉对齐沙箱标准）；全格式支持响应式宽表格横向滚动渐变阴影指示器；高级原生外壳支持 4 大护眼阅读主题（纸质 Paper、暖阳 Sepia、极夜 Dark、纯白 White）、3 套排版字体族（系统黑体、人文宋体、等宽代码）与 A-/A+ 字号微调；内置文档内实时全文搜索（Prev/Next 匹配定位与序号计数）与浮动目录大纲抽屉；配备系统级真实物理文件分享、Android Intent.ACTION_VIEW 外部应用打开、离线矢量 PDF 导出（接入 `expo-print` 原生打印引擎，彻底解决选区/文档导出 PDF 不可用问题）、多格式导出（SAF/Downloads、TXT/MD/HTML）以及强制手动改类型（纠正无后缀或误标文件）；聊天文档阅读器 `ImDocumentMinimalViewer` 全面收拢由统一架构驱动；统一入口 `useDocumentReader`，无缝覆盖聊天附件即时预览、素材知识库阅览、系统外部文件 Intent 离线秒开三大场景 | `UniversalDocumentViewer`, `AiDocumentReaderScreen`, `ReaderHeader`, `ReaderPreferencesSheet`, `ReaderExportSheet`, `ReaderSearchOverlay`, `ReaderTocDrawer`, `workingCopyManager`, `useDocumentReader`, `universalReaderHtml`, `docxPreview`, `pptxPreview`, `pptxParser`, `ImDocumentMinimalViewer`, `AiPdfReader` |
| Live2D 桌宠 | 完全关闭/不上线 | 已移除聊天页与会话设置页的运行时入口：不会加载模型、渲染 WebView、注册事件监听、启动动画/手势或提供下载与预览入口。保留源码、模型列表、已下载文件和既有 SQLite 设置值，供未来在独立验收后恢复 | `Live2DPetView`, `Live2DPetManagerModal`, `live2dManagerService`, `petModels` |
| 隐私空间 | 已实现 | normal/personal 双空间、独立九宫格图案锁/数字密码、生物识别（指纹/面容）、防爆破失败锁定、6 字符自定义恢复密钥、隔离数据库和文件；解锁时只激活当前根分页，避免四个库页面同时读取隐私库，首页/整理/全部素材/分组素材/批量管理首屏查询延后到交互完成。Personal 图片只使用内存图片缓存；锁定会清内存图片、reader session、聊天预取和 Personal 临时文件，但不清普通空间磁盘缩略图。Personal 成功建立会话后才授权后台任务；锁定先使 task token 失效，等待生成/陪伴/记忆/日记/备份恢复/导入任务停稳，再关闭数据库 | `App.tsx`, `SecureImage`, `PersonalUnlockModal`, `PasswordAndSecurityScreen`, `RecoveryKeyModal`, `SecurityUnlockModule`, `useScreenLoad`, `personalSystemService`, `personalTaskToken`, `aiGenerationManager`, `companionMaintenanceQueue`, `diaryGenerationManager`, `aiMemoryMaintenanceService` |
| 外部分享/打开 | 已实现 | Android share/open-with 接入，导入外部图片、视频、包文件 | `ShareCollectScreen`, `ArchiveReaderScreen`, native media module |
| 存储统计与维护 | 已实现 | 原图、缩略图、缓存、备份、回收站空间统计和清理；预览目录一次 inventory 同时计算总量/图片/视频，备份枚举最多 4 worker；按 normal/personal 隔离的 epoch+TTL 快照先显示后刷新 | `StorageUsageScreen`, `storageUsageService`, `storageUsageSnapshotCache` |
| 更新与公告 | 已实现 | 远程版本检查、公告、官网下载、GitHub fallback | `updateCheckService`, `announcementService` |
| 官网与发布 | 已实现 | 官网下载页、更新 JSON、release notes、Android release workflow、关于页内置产品文档入口与应用内 Markdown 阅读；进入关于页会后台预取官网产品文档图片并持久缓存到应用内，后续阅读优先复用本地缓存 | `docs/`, `docs/repository-workflow.md`, `AboutScreen`, `ProductDocumentationScreen`, `productDocumentationService` |
| 设计系统/基础组件 | 已实现 | 统一移动端 UI、空状态、按钮、表单、toast、action sheet；所有页面背景图统一采用 cover 模式，全面支持平板及宽屏设备自适应等比铺满 | `src/components/`, `src/design/tokens/`, `src/design/backgrounds.ts` |

### 2.1 2026-08-20 性能加固逐项索引

完整根因、文件级清单、Review、Spec 与 Plan 已归入本地私有 `版本文档/当前版本文档/`，正式打包成功后随 v2.8.2 移入历史目录。下表中的“源码/自动化已验”不等同于真机帧率、内存、codec 或声学验收。

| ID | 功能/能力变化 | 实现边界 | 当前验证状态 |
| --- | --- | --- | --- |
| PERF-HOME-01 | 首页首帧只显示一个真实卡片几何 skeleton + shimmer，移除加载提示 | skeleton/真实卡共享宽高比、圆角、padding 和 caption 几何；Reduce Motion 停 shimmer | 源码/自动化已验；Android 像素差待验 |
| PERF-HOME-02 | 第一张 IP 卡片不再晚于第二张参与显示 | 仅首卡 high priority + 0ms transition，其他 normal + 120ms；首项不挂传感器/重型高光 | 源码/自动化已验；冷启动和回收滚动待真机 |
| PERF-DB-01 | 媒体/聊天热路径索引与稳定 keyset cursor | normal/personal 幂等建索引；created/recent/source 使用 sort value + id tie-breaker | 100k host SQLite plan 已验；Android SQLite 延迟待验 |
| PERF-DB-02 | scope-aware LRU/TTL/data epoch | media epoch 按 global + normal/personal 组合；DB handle 注册空间，结构写按所属空间 bump；last-view 不 bump；未知 handle 走 global fail-safe | 单元/集成已验 |
| PERF-IMG-01 | 图片阅读器从全量上下文改为 81 项锚点窗口 + 40 项游标补页 | 距边界 10 项内补页；`initialScrollIndex` 首帧定位 | 源码/自动化已验；200 项 fling 待真机 |
| PERF-IMG-02 | 图片预取不固定三页，改为速度/方向/内存自适应 | encoded 8/4、16/6、32/8；decoded 最多前 6/后 3；并发 4/2；generation 防旧任务回写；Android trim 后本屏 sticky encoded-only 并释放 decoded refs；预解码同时限制 viewport pixel width/height | 单元/集成/Kotlin compile 已验；RSS/掉帧待真机 |
| PERF-IMG-03 | 阅读器退出再进恢复当前位置且不重新全量加载 | session 最多 81 项、TTL 10 分钟、LRU 容量 8；结构 epoch 变化后失效 | 单元/集成已验 |
| PERF-VID-01 | 上下切换采用短视频式 previous/current/next 三槽 | 封面在拖动阶段跟手；距离/速度决策；settle 可中断反向 | 源码/自动化已验；手感/帧率待真机 |
| PERF-VID-02 | 5-player 有界池和预加载 | current + 方向前方 3 + 反向 1；仅 current 有音频；prepare 最大并发 3 | 单元已验；低端机 codec/RSS 待验 |
| PERF-VID-03 | 0.5×–3× 倍速统一保音高 | 创建、换源、普通倍速、长按倍速都先 `preservesPitch=true` 再设 rate | 源码/自动化已验；扬声器/耳机/蓝牙声学待验 |
| PERF-CHAT-01 | 已知线程入口利用路由时间预取首个 60 条消息页 | 只保留最近预取；consume 删除；revision 校验；创建时收敛 reject；Personal 锁定清理 | 源码/自动化已验 |
| PERF-CHAT-02 | 初次进入使用同槽位 readiness skeleton，不做可见后纠偏 | 清旧线程数据；空线程直接 ready；非空在首次 content layout 后揭开；普通入口不跑延迟 jump | 源码/自动化已验；真实长聊天闪烁待真机 |
| PERF-CHAT-03 | 超长历史页使用稳定 O(n) 去重合并 | `(createdAt,id)` 有序合并，当前窗口覆盖重复 ID，不对累计数组反复 sort | 6000 条/100 页单测已验 |
| PERF-CHAT-05 | 锚点定位使用单条 SQLite statement | 一个 CTE statement 读取 latest/before/anchor/after、SQLite 内去重并按 `(createdAt,id)` 排序；anchor 缺失自然返回 latest；不在同连接 `Promise.all` | 6000 条/100 页 repository benchmark 和 query plan 已验 |
| PERF-CHAT-04 | 聊天附件在复制/Base64 前限流限额 | 8 项、图片 12MB、文档/metadata 24MB、总量 32MB；读取并发 2；视频不转 Base64 | 单元/集成已验；设备内存峰值待验 |
| PERF-IO-01 | 图片+视频混合导入共享总量 gate 与实际写入账本 | 1000 项、图片 256MB、视频 20GB、批次 32GB、未知 256MB、保留 512MB；metadata I/O 前早拒绝；图片/视频服务复用同一 `MediaImportCommitBudget` | 单元/集成已验 |
| PERF-IO-02 | 导入/目录扫描/相册 metadata 使用有界并发和 commit 前复查 | 文件 worker 最大 4；复制后校验实际 size；失败走既有回滚；不改原件 | 源码/自动化已验；OEM/低存储竞态待真机 |
| PERF-IO-03 | DocumentPicker 临时副本有显式所有权 | 只删除本次 picker 创建、明确 temporary 且仍位于 Expo cache 的 URI | 源码/自动化已验；OEM URI 生命周期待验 |
| PERF-PRIV-01 | Personal 媒体缓存与长任务锁定边界收紧 | 图片只进 memory；导入纳入 task barrier；锁定不误清普通磁盘缓存 | 源码/自动化已验；锁定竞态待真机 |
| PERF-UX-01 | 图片/视频混选贯通批量整理和系统相册保存 | mp4/mov/mkv/webm/avi/m4v/3gp 走 native video MediaStore；其他素材不误走视频桥 | 源码/自动化已验；Android MediaStore 待验 |
| PERF-SCALE-01 | 启动交接与隐藏根页工作收敛 | 原生 Splash 等数据库/关键字体/首屏提交后隐藏；目录与 SQLite 并行初始化；Playfair/手写字体延迟；根页错峰预热；隐藏频谱/循环动画取消 | 源码/自动化已验；冷启动耗时待设备验收 |
| PERF-SCALE-02 | 六个大素材入口统一 cursor + FlatList | 全排序 `(sortValue,id)` 稳定分页，48 项页、12 项 render batch、window 7；回收站统计使用 SQL aggregate | 源码/自动化已验 |
| PERF-SCALE-03 | 备份、存储和批次数据库往返批量化 | 关系/批次按 400 ID 分块；预览一次 inventory；导入批次状态单次聚合；exact duplicate SQL 预筛 | 源码/自动化已验 |
| PERF-SCALE-04 | AI 收藏和长期数据按需呈现 | AI 收藏切换分段后才以 `(createdAt,id)` keyset 读取；材料按 20 来源/40 条分页，总库每来源固定 4 份预览且可进入完整列表；内心生活只查询当前 tab | 源码/normal+personal SQLite 自动化已验 |
| PERF-SCALE-05 | AI 会话历史 SQL 分页与列表虚拟化 | 标题/最后消息搜索下推 SQLite；按 `(lastMessageAt,createdAt,id)` 稳定 keyset、40 条/页；`FlatList` 有界渲染；请求代际阻止旧筛选结果回灌 | 源码/SQLite integration 自动化已验 |
| PERF-REV-01 | 全面 review 修复 26 项二次/补强问题 | Hook 顺序、刷新循环、space epoch、内存 trim/像素预算、预取拒绝、池并发、混合 quota/共享账本、Personal barrier、聊天单 statement、AI 历史分页竞态等 | 全量 1161：1146 pass / 0 fail / 15 skipped；TypeScript、聚焦测试、diff 通过；Android 设备门禁待验 |

---

## 3. AI 功能矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| Provider | DeepSeek、OpenAI/OpenAI-compatible、Gemini、Claude；真实当前模型验证、辅助模型列表、不可枚举模型的手动 ID/历史成功模型、聊天流；配置可用的默认 Embedding 模型与密钥后，材料导入/重解析会尝试生成本地向量索引，请求使用上限为 3 的有界并发且暂未引入重试/退避；普通聊天不会无条件调用 Embedding，记忆检索无向量时使用 FTS/词面回退；DeepSeek 官方端点支持展示并自动同步最新模型（如 v4.1、v5 等），已弃用的 `deepseek-chat` / `deepseek-reasoner` 对存量会话兼容迁移但不再出现在模型列表，自定义中转网关不受该限制 | `src/ai/aiProviderService.ts`, `src/ai/providers/`, `src/ai/deepseekModelPolicy.ts`, `src/ai/aiEmbeddingService.ts` |
| Provider 设置 | 全局默认 provider/model、连接 JSON 导入、保存/刷新/测试拆分、验证状态、手动模型 ID、中转网关模型别名、按空间隔离的 API Key SecureStore、当前会话模型复用全局配置/独立保存/测试/新增候选模型、删除手动/同步模型并清理默认值与会话悬挂引用、长按多选批量删除与同来源一键清理；设置页静态说明 API Key 本地保护、对话请求发送给所选模型服务商，且单次测试成功不代表永久可用 | `AiProviderSettingsScreen`, `AiSessionConfigScreen`, `secureAiSettingsService`, `aiProviderService`, `aiProviderRepository` |
| 聊天线程 | normal/IP/knowledge-base 上下文，标题、模型快照、角色快照、归档、删除 | `aiChatService`, `aiThreadRepository` |
| 聊天记录恢复与可见性 | 空分支范围严格表示主干路线，不会放宽成混入隐藏分支的无约束查询；有限消息页在内层查询显式导出 SQLite `rowid` 排序别名，外层不直接访问不可见的隐藏列；最近历史通过单条递归 SQL 按每个线程已采纳路线计算排序和预览；没有有效完成消息的空线程不会进入侧栏、首页、搜索或历史，同时避免逐线程 SQLite statement 竞争；历史读取失败时显示可重试错误而不是伪装成初始化空会话；发送事务创建消息 ID 后立即显示已落库的用户消息和 assistant placeholder；所有已知 thread 路由在 push/replace 前启动 revision-safe 首消息页预取，预取创建时即把失败收敛为 null，消费前校验 route revision；普通进入依赖 inverted offset 0 和首个非空列表布局提交揭开骨架，不再执行 50–700ms 可见纠偏；加载更早消息使用有序 O(n) 去重合并而不对累计历史反复 sort | `AiChatScreen`, `aiThreadMessagePrefetch`, `aiMessagePageMerge`, `aiThreadRepository`, `aiGenerationManager` |
| 陪伴卡片版本与删除 | 日记、梦境卡片按稳定产物组锚定在原聊天位置，重生成仅追加新版本；卡片下方可切换 `1/2`，长按复用消息气泡的触点锚定菜单以重新生成或仅从当前聊天移除。同一梦境组生成期间会禁用重复重生成，完成后默认切到新版，失败保留旧卡片并显示错误。聊天移除写入线程级隐藏状态，不会删除内心独白或历史消息；只有当前梦境版本可进入后续上下文。内心独白展示日记/梦境全部版本，外显序号按剩余版本连续重排；长按进入当前标签的多选模式，统一确认后以单事务直接永久删除所选版本，不进入回收站 | `AiChatScreen`, `DiaryChatCard`, `DreamChatCard`, `AiAnchoredContextMenu`, `CompanionInnerLifeScreen`, `companionArtifactChatStateRepository` |
| 发送与生成 | 创建用户消息、assistant placeholder、stream provider、stop、continue、retry、regenerate、rewrite；已停止/失败且有正文的 assistant 回复可在原正文中继续生成，续写阶段保留已有正文/思考上下文但只追加正文；已完成的 assistant 回复在当前末尾保持“续答”，会在下方生成一条新的 assistant 消息继续往下说且不写入伪造的 user/system 历史；当该 assistant 下方已经有后续消息时，同一入口改为“回复”，允许用户从这条历史 AI 消息重新接话并切出新的分支路线；聊天输入区新增 `AI 帮答`，使用思考参考实现中的灯泡图标；聊天输入框可扩展到最多 8 行并在清空后立即收回；聊天附件会在本轮发送中进入上下文，图片按支持视觉的 provider 作为多模态 payload 发送，文档导入线程材料并注入摘录，聊天页不提供视频附件入口；附件统一限制 8 个、单图片 12 MB、单文档 24 MB、总计 32 MB，未知大小占用保守预算，在复制/Base64 前拒绝；图片读取固定并发 2、保持选择顺序并隔离单张读取失败；assistant 正文取消气泡并使用列表等边距全宽排版，字体行高提升；流式正文按段落即时整理，保持与完成态一致的段间距；气泡内图片与文档附件统一采用 120×120 尺寸宫格并列对齐，发送时立即乐观渲染文档与图片，消除文档后台提取造成的渲染延迟 | `aiChatService`, `aiAttachmentPolicy`, `aiBoundedConcurrency`, `aiGenerationManager`, `AiChatComposer`, `AiMessageBubble`, `AiChatScreen`, `providers/*` |
| 生成崩溃恢复 | V55 持久恢复 | 每次主聊天生成在 Provider 请求前持久化 job，首个 delta 转为 streaming，并按现有合批节奏同步部分正文/思考与 content-free 事件；完成、失败、超时、用户停止及恢复强停时，消息、思绪消费/释放与 job 均在同一事务结算，恢复重试耗尽不会遗留不可消费的思绪预留。进程重启后按空间单航班协调：无部分正文时对同一 assistant 占位最多自动重试一次，有部分正文时最多续写一次且不新增思考、做重叠去重；续写前及最终落盘前会重新验证停止前引用的来源可见性、版本、片段哈希和 claim span，失效引用不再展示；保存原人设/模型/分支快照但重新读取 SecureStore 密钥。普通空间初始化后恢复，Personal 仅成功解锁后恢复且锁定会取消并等待任务；跨空间迁移保留 job/event 且清除 lease | `src/ai/generation/`, `aiChatService`, `aiGenerationManager`, `App.tsx`, `ai_generation_jobs`, `ai_generation_events` |
| Android 语音输入 | 已实现，直接 SpeechRecognizer | 麦克风入口独立于聊天 Provider/模型；点按切换，长按开始、松开结束、上滑或轻提示取消，只有 final result 写入输入框且仍由用户手动发送。API 31+ 优先设备端识别，否则明确使用系统识别并请求离线优先；区分权限永久拒绝、服务不可用、忙、超时、无语音、网络/音频与取消，页面离开、后台和发送时释放 recognizer | `AiChatComposer`, `AiVoiceInputStatus`, `AiChatScreen`, `pixoryMediaModule`, `PixoryMediaModule.kt` |
| 声音与朗读系统 (TTS / Voice) | 已实现 | 全通栏设计、无内嵌悬浮卡片与无内部滚动条；以语音供应商为主体的配置体系（自定义 API 服务 / 内置推荐 / 本机离线，支持 SiliconFlow、OpenAI、MiniMax 快速模版与端点模型列表获取）；系统内置推荐预设享受免 Key 极速试听保障（未填 Key 或云端报错时自动平滑降级至 Android 本机离线 TTS，绝不上抛 401）；伴聊支持单会话（抽屉）与全局聊天设置一键开启/关闭所有会话的模型语音回复开关（默认开启），关闭后动态屏蔽语音发送协议与意图提示；长聊最后一条 AI 消息底部操作栏朗读交互深度重构（加载态展示 60fps 原生驱动 360° 匀速持续转圈环、播放态展示 4 柱动态频率振幅跳动声波均衡器、播毕或轻触即刻复原为静止线框喇叭，具备加载中点击秒级取消防并发与 activeSpeakTicket 门禁）；底栏浮动中性灰迷你播放胶囊；伴聊支持像素级 100% 复刻微信原生拟真语音条（72~232dp 对数伸缩公式、3 弧阶梯声波跳动动画、伴侣未读红点、手风琴下挂转文字面板），气泡外观与圆角完全跟随用户个性化设置；内置 5 款广播级专业调音声学预设 + 1 款本机离线兜底；三重平滑降级链；流式分句器 TagAwareStreamParser 与 imTagParser 全面宽容适配 [VOICE:...]、[VOICE]:、[VOICE]：、[语音]: 等全格式变体彻底杜绝技术标签泄露，配合 sanitizeCompanionBubble 兜底熔断；Layer 1 伴侣协议注入语音能力与情绪表达认知（支持 [VOICE: 语气风格 | 台词]、前置神态联动 (动作描写) 与副语言拟声）；全新引入 prosodyModulator 情绪声学自适应计算引擎，动态调节发音语速 (rate 0.9x~1.15x) 与音高 (pitch)，让伴聊发声具备细腻的情绪温度与呼吸起伏感 | `src/voice/`, `prosodyModulator`, `VoiceBubbleRenderer`, `VoiceMiniPlayer`, `VoicePresetPicker`, `VoiceSettingsScreen`, `VoicePresetEditorSheet`, `tagAwareStreamParser`, `imContextBuilder`, `burstDispatcher`, `imSettingsRepository`, `PixoryMediaModule.kt` |
| 流式性能与恢复 | generationId 防旧流污染、首 token live 显示、外部 streaming store；Provider chunk 累积，显示与 SQLite 独立合批，最后一个 delta 后仍可 drain。回前台主动发布当前任务最新内容，已完成任务对齐持久记录，重连订阅回放合并补丁；后台 flush 使用任务数据，空间/线程/生成代次拒绝旧回调。generation metrics 记录内容无关的 Provider/UI/backlog/persist/tail 指标与独立阶段时间，不进入普通页面或提示词。思考预览自然高度至多五行、底部裁切跟进最新文本且禁止手动内滚；展开同一文本树完整随页面滚动，布局阶段补偿标题，Android 放宽裁剪；首正文包独立结束、落库并折叠思考，不等待正文输出结束，续写保留原思考边界。正文与 tail 使用等边距连续排版和原有 45/30/24fps 档位。查看历史保留 measured tail occupancy、FlatList spacer、block 测量/cache、reasoning/content lane 隔离、稳定 ordinal key、feature flag/kill-switch；真正拖动才进入既有 detached 策略，单纯点击思考不切换 renderer。滑回底部须原生 offset 进入 `32px` 安全区、手势稳定、尾块提升测量和高度债清零后再确认恢复 live renderer。业务终态即时发布，不等待 replay 离屏；完整 tail 清理仍须离屏及测量条件，reload 绑定对应线程和生成。idle timeout 走 failed，用户停止走 stopped；错误后的前台刷新不得重启 generating。当前优先 bug，正文算法和网络层不作额外性能改造；高风险 tail 架构迁移仍需 Android 验证，不把代码测试作为真机零闪烁证据 | `aiStreamingRuntime`, `aiStreamingPerformanceDiagnostics`, `aiStreamingMessageStore`, `aiGenerationManager`, `aiGenerationMetrics`, `aiStreamingTailModel`, `aiStreamingTailRenderContract`, `aiStreamingTailFeatureFlags`, `aiStreamingTailContinuation`, `aiStreamingBlockSplitter`, `aiStreamingHeightCache`, `AiChatScreen`, `AiThinkingBlock`, `AiStreamingMessageText`, `AiStreamingTailSpacer`, `AiMeasuredStreamBlock`, `AiStreamingTailMessageSegment`, `AiStreamingTailContinuationBubble` |
| 系统管家 | 已实现，内置专属链路；新增能力待 Android 验收 | 专属线程 `pixory-system-assistant`；普通操作极简回复，注册表限定导航入口，IP 操作在客户端校验目标空间。用户明确要求创建角色卡后自然共创，每轮最多一个关键问题；完整草稿随可见助手生成版本存入对应空间 SQLite，重新生成/切分支只继承前序版本，不读取未来草稿。保存需当前用户明确指令；否定执行优先，简短确认仅在上一轮明确询问创建且草稿完整时生效。角色/草稿/任务事务提交，任务 ID 防重复，30 分钟内仅未修改且未被会话引用的角色可撤销。时间/日期/星期通过设备时钟与 Intl 本地计算，无模型费用，支持已注册城市、IANA 时区及 UTC/GMT 偏移；未知地点、含混或无效格式明确追问。原思考位置展示可折叠真实任务进度，运行、等待、成功、错误、停止和撤销有独立反馈，不展示模型内部推理。初始化和时间写入失败进入可重试失败状态。继续禁用系统管家记忆抽取；任务草稿不读取其他伙伴/隐私记忆，不跨空间。普通历史保留 10 分钟任务截断和继续入口，共创草稿独立于历史裁剪保留；清空系统聊天同时删除任务和草稿版本快照。联网搜索和资料加工暂不接入。 | `src/ai/systemAssistant/`, `systemAssistant.ts`, `aiChatService`, `SystemAssistantProgress`, `SystemAssistantTaskCard`, `AiChatScreen`, `AiMessageBubble` |
| 聊天输入与安全区 | Android 聊天页锁定进入页面时的底部安全区，键盘开合不重复推高输入框；仅减少输入框到屏幕底部的外部留白 `8dp`，不改变输入框内部 padding；顶部安全留白减少 `8dp`；聊天标题使用系统字体并与正文同为 `14px/22px`，模型名称保持 `12px/18px`；IP 聊天支持从附件弹窗呼出双行滚动多选的 IP 素材图片面板；输入框上方所有图片附件统一采用横向滚动宫格展示，隐藏详细文本并支持右上角单张轻触删除 | `AiChatScreen`, `AiChatComposer`, `AiComposerAttachmentBar`, `AiIpImagePickerPanel`, `AppScreen`, `SafeAreaProvider` |
| AI 交互式沙箱系统 | 已实现 | 伴侣为本，沙箱为器的轻量按需架构；聊天流内至多 1 个活跃 WebView（仅挂载于最新消息取景框，历史消息默认收拢为微缩控制台白卡）；支持 2D 小游戏、WebGL/Three.js 动画、物理模拟与交互式 SVG；纯白极简黑白灰商务级 UI（无 Emoji/无说教/标准 Ionicons）；单行零换行前置熔接（Zero-Newline Prepend）实现物理级绝对零行号偏移；动态子域名隔离（https://${id}.sandbox.pixory.local/）防止 Storage 污染；四段式双轨装填保持前两段 100% 静态冰冻，大模型 Prefix Cache 命中率 95%+；历史消息自动脱水为 XML 存根；支持 Aider 级 SEARCH/REPLACE 模糊差分写时合入（Merge-on-Finish）与横竖屏安全复位守卫；全域入口泛化：原生富文本 HTML（AiRichHtmlBlock）右上角极简运行按钮、气泡长按弹窗微秒级零开销沙箱运行入口、“选择文本”全屏弹窗（AiMessageTextSelectionModal）左上角智能 [预览 / 源码] 双模无缝切换；以及超长 HTML / Markdown 折叠状态栏（foldedControlBar）与代码块头部的快捷 [▶ 运行] 按钮；取景框与卡片形变系统（2026-10-22）：最新完结消息渲染 160dp 极简白底取景框（Mini-Stage 0.42x 相机等比视口映射，ParallaxLightSweep 极光扫弦占位骨架，强制 AudioContext 静音，全屏沙箱展开时主动卸载取景框 WebView 实现全局单物理实例防御）；严苛一票否决黑名单与首帧白屏/致命报错自动降级回代码块；Prompt 彻底抹除“沙箱”字眼，建立自然伙伴“可交互礼物”契约；小卡片取消 4px 限制对齐取景器 radius.lg 圆角，高度增至 82dp 呈现压扁取景器和谐黄金体态，运行按钮对齐全屏同款黑色胶囊；以高阶变速动力学（320ms spring 展开、260ms ease 缓出）无缝平滑形变，过渡半程全程点亮全息极光扫弦与拟真线框舞台；流式即时占位与美学线框舞台（2026-10-22）：代码块刚开口的前 60 字符内触发微缓冲挂起（~150ms），首行契约嗅探命中 `<!DOCTYPE html>` 或 `<svg viewBox...` 根节点后，在内存中静默接收代码并原位挂载极光骨架取景框（0 源码刷屏，0 WebView 并发显存占用）；内嵌拟真线框舞台（Faux HUD 状态指示、发丝级三线坐标网格、中央白玻立体几何中枢、虚拟触控台与极光扫弦），动态提取 `<title>` 实时上屏，底栏实时跳动累积代码行数；闭合后微缩视口平滑揭幕，后文与光标无缝续流；中途打断自动安全退化回普通代码块；Claude 风格黄金比例小卡片与纯被动折叠取景框（2026-10-22）：卡片态重构为高质感三栏杂志风排版（左侧 42×42dp 圆角图标徽标、中栏 15px 半粗主标与 12px 极简副标、右栏 34dp 大气方框展开与黑色胶囊运行），彻底剔除卡片态底部的“xxx行代码 · 自包含独立运行”整行文字；取景框展开态顶部彻底移除折叠按钮，折叠生命周期 100% 交由单例互斥协调器在打开其他取景框时被动触发收拢，确保全会话物理活跃 WebView 严格至多 1 个；Claude 方案 A 纯净质感复刻与被动折叠抗错位（2026-10-22）：纯白亮底 `#FFFFFF`、发丝细线 `#E2E8F0`、彻底移除阴影（`elevation: 0`）、32dp 同频浅灰温润幽灵胶囊按钮（`#F1F5F9` 浅底与细边框，告别纯黑药丸），收拢态与展开态操作按钮双向 32dp 物理尺寸绝对锁死；独立 Key 隔离（`sandbox-collapsed-card` vs `sandbox-expanded-viewfinder`）杜绝 React Native Android 跨结构 ViewTag 错位复用，被动折叠防动画冲突（`performCollapse(activeId === null)`），彻底根除被动关闭时的按钮变大错位缺陷；聊天页彻底移除消息列表加载骨架屏浮层，保持极简直出；AI 首页会话列表接入后台并发预加载（`preloadAiHomeData`），实现 0ms 瞬间直出，彻底消除切换 Tab 时的一瞬间空白。 | `src/services/sandbox/`, `AiSandboxArtifactViewfinder`, `AiSandboxArtifactCard`, `AiSandboxViewerModal`, `AiCodeBlockView`, `AiRichHtmlBlock`, `AiMessageTextSelectionModal`, `AiMessageContent`, `AiChatScreen`, `AiHomeScreen` |
| 回到最新交互 | 右下角 18px 低干扰圆钮，保留 44px 触控热区；离开最新位置 200px 后显示，生成中使用连续三点动效，结束后切回箭头；只有手势明确向下至少 8px 且进入 160px 时提前吸底，上滑手势不会被流式布局波动误吸附；原有 32/48/70px 流式尾部规则保持不变 | `AiChatScreen`, `AiScrollToLatestButton`, `aiScrollToLatestPolicy` |
| 生成指标 | prompt/memory/retrieval/provider/first delta/UI patch/final persist 等 content-free metrics；记录对话覆盖是否完整、已验证摘要数、原文桥/本地临时摘要数量、分支路线 hash 与动态段 token 估算，不记录正文 | `aiGenerationMetrics` |
| 回复呈现计划与多正文气泡 | 规划/暂缓；当前保持单一思考区和连续正文渲染，不启用 `ResponsePresentationPlan`、多气泡拆分或模型输出格式约束。重新启动前需先完成输出协议、思考区布局、终态恢复和 Android 性能验收；历史研究资料已移入本地版本档案，不作为当前能力证据 | `AiChatScreen`, `src/ai/` |
| Prompt | stable/dynamic layer、角色卡 frame、material rules、history window、current user request；会话滑杆数值作为阶梯窗口目标：增大时扩展原文窗口，减小时保留缓冲区并等待连续、来源版本/分支/lineage 均验证通过的摘要后再替换旧原文；摘要未就绪时保留原文，预算不足时仅从最旧完整轮次降级为有来源记录的骨架桥，并在消息快照记录最终覆盖计划 | `promptBuilder`, `conversationCoverage`, `conversationCoverageService`, `contextPlanner`, `aiChatService` |
| Prompt/cache | stable prefix hash、retrieval hash、cache key、Anthropic breakpoint、禁止 diagnostics 污染 prompt/cache；稳定记忆快照按内容、空间和分支范围生成复用身份，记忆内容变更会失效对应缓存；稳定摘要参与 stable hash，易变的角色观察/用户画像处于 dynamic layer；DeepSeek 官方 V4 及以上模型使用服务商原生前缀缓存并在流式请求中开启 usage 观测，不发送 OpenAI `prompt_cache_key`，其他 provider 策略保持原样 | `aiPromptCache`, `aiMemoryService`, `openAiCompatibleProvider` |
| 首 token pipeline | fast-path classifier、normal skip retrieval、资料模糊引用 fail-closed、keyword/full retrieval 分层、IP 资料引用按细分类型 (分组/导入记录/素材/基础资料) 精准跳转对应目标页面 | `aiChatFastPath`, `aiRetrievalService`, `AiChatScreen`, `App.tsx` |
| 上下文预算 | 使用真实模型窗口并为输出留预算；一问一答作为完整轮次，滑杆值动态控制阶梯窗口及摘要缓冲，摘要缺失或因编辑/切分支失效时不静默丢弃原文；DeepSeek 回放扩展、附件及最终用户请求统一进入发送前预算核验，超限时按完整轮次降级并记录覆盖缺口，不符合安全预算则拒绝发送 | `aiContextBudget`, `aiContextSettings`, `AiContextSlider`, `conversationCoverageService`, `contextPlanner`, `providerRequestBudget` |
| 角色卡 | 手动角色、SillyTavern PNG/JSON/V1/V2/V3 导入、sourceJson 保留、头像、标签、首句；角色卡编辑和会话设置共用头像选择器，可从系统相册或当前空间的 IP 素材选择并复制到受管存储 | `sillyTavernRoleCardParser`, `aiRoleCardRepository`, `AiRoleCardEditorScreen`, `AiAvatarPicker` |
| 角色卡导出 | SillyTavern PNG 导出、续聊 Markdown、系统人设/记忆/上下文分离 | `sillyTavernRoleCardExporter`, `aiRoleCardContinuityExport` |
| 连续性导入 | 原生 Markdown 精确导入、外部文档接回、解析不足时模型辅助结构恢复、导入后分支接续、10 轮观察回退窗口、外部导入记忆审读门禁、显式 summary/profile/memory fan-out；外部路径将候选抽取与独立审核分开，模型建议还需 evidence/scope/manual-lock 确定性校验；待审读任务有同进程去重并可由下一次后台维护续跑，失败状态不自动重复烧调用；给外部软件的迁移提示词只允许 user/assistant transcript，违规 system/developer/tool 内容在解析侧继续隔离为 untrusted context；Personal 外部导入必须逐次授权远程整理 | `aiContinuityImport*`, `AiSessionConfigScreen`, `AiChatScreen` |
| 记忆导入/导出 | 默认导出 Pixory Memory Package v2（JSON，确定性导入；兼容旧版 Markdown/v1 与外部文本审查）；包只包含当前会话可见 scope 的 Claim、关联账本事件与证据，避免带出其他线程记忆；原生导入先 pending、失败可复用原分支幂等续跑，导入消息 ID 映射后保留 Claim 证据引用并跳过悬空消息引用，已删除/抑制 Claim 由本地投影、删除证书和包内墓碑共同拦截，Claim/episode/关系/profile 随会话一起完整回滚；外部审核画像也同步进入 v1 profile 账本，外部回滚按 import session 精确隔离 | `aiRoleCardContinuityExport*`, `aiContinuityImport*`, `src/ai/memory/nativeMemoryPackage*` |
| 深度记忆 | v1 事件账本 + Working/Confirmed/Archive 三车道；每条消息即时写 current-turn observation，回答落盘后本地轻抽取，重维护异步批处理；Claim/episode/关系/profile 可从账本重建；无 Embedding 时 FTS/词面检索可用且无相关证据不注入，Confirmed 容量回收、冲突/安全边界、用户确认锁定和 ContextPlan 可追溯；稳定提示仅注入 Confirmed，当前轮 forget/correction 会排除目标 Claim，分支 Claim 仅在当前祖先 lineage 可见；看板仅展示长期记住/最近对话（自动过滤瞬态 ephemeral 琐事）并支持真实编辑、确认、删除、作用域修改；【认知级记忆演进（2026-10-22）】：落地 ACT-R 检索反馈闭环（memory_claim_feedback 表跟踪注入与 2-gram 采纳，连续 5 次无视自动压低检索分并归档）、检索硬相关性短路（无向量 lexical >= 0.20，有向量 baseRelevance >= 0.12）、历史窗口去重惩罚（redundancyPenalty 1.0）、显著性抽取门禁 shouldExtractMemory 拦截瞬态动作/生理状态、伴侣情感权重 signalWeight 动态锚定门槛，以及后台碎片聚类（>= 3条同 predicate 自动升维并清理冗余）。 | `aiMemory*`, `src/ai/memory/*`, `AiMemoryBoardScreen`, `memoryFeedbackService` |
| 陪伴事件与时间连续性 | 已实现，V1 核心 | 当前完成的用户消息先经无网络本地观察器生成追加式 Companion Event，保存精确消息版本、证据跨度、speech mode、置信度、分支路线和幂等键；引用、否定、假设、玩笑、角色扮演与第三方转述不会形成高影响事件；明确边界/纠正当前轮进入动态约束。时间短语按原时区保存 UTC 范围和本地 date key，共同约定形成 branch-scoped OpenLoop；完成、取消、“别再问”及默认期限可结算，每项最多主动提及两次且未回应后静默七天；每轮最多一个旧事项作为可选动态话题，不发送主动消息或通知。含混强信号才创建带 SQLite lease 的后台丰富任务，无模型、离线或 Personal 未授权时本地路径继续工作 | `src/ai/companion/`, `aiChatService`, `companion_events`, `companion_temporal_anchors`, `companion_open_loops`, `companion_runtime_jobs` |
| 关系投影与修复 | 已实现，V1 核心 | 以追加式事件重建线程/角色双层投影，内部维护好感、信任、紧张、亲密和交往阶段，但不向用户暴露数值；明确边界和事实纠正即时生效，高影响的接受、冲突、越界、伤害、道歉与修复采用证据门禁、幅度上限和冷却，修复后的行为约束会进入动态提示。设置页可查看来源、忽略误判、执行可审计重置或明确清空；重置事件之后的投影才能继续参与上下文 | `companionProjection*`, `companionAffectPolicy`, `companionRelationshipPolicy`, `companionRepair*`, `CompanionRuntimeManagerScreen` |
| 角色梦境 | 已实现，V1 核心 | 本地宽候选检测覆盖梦中、共同入睡、角色入睡、晚安与角色扮演睡眠场景；明确睡眠质量/产品讨论本地零成本排除，其余候选只进行一次结构化语义分类，再使用持久化确定性 roll 按 55%/40%/30%/10%/10% 概率决定。自动梦境按角色至少间隔 50 个完整问答轮、北京时间每天最多两次成功，失败不占成功配额或冷却；任务预留会记录所属北京日期，成功提交按实际完成日再次原子校验上限，因此跨午夜旧预留不能形成第三次成功。跨日重试不要求新聊天轮，并把重新预留与任务恢复放在同一 SQLite 事务；手动“做个梦”先确认且不占自动冷却/日配额。生成种子持久冻结当前分支触发证据与会话角色快照，后续编辑线程配置或角色卡不会改变同一任务重试输入；消息从当前证据与历史完整轮补齐到最近 20 个完整问答，附北京时间且禁止无证据补写。线程删除或跨空间移动后的 counter 重建只统计自动成功梦境。任务具备 lease、幂等、消息版本/分支/空间复核和 Personal 远程授权边界；生成卡提供可操作取消，取消会中止活动请求、释放预留并刷新持久卡片；运行提示只从当前 branch/lineage 的 SQLite 状态恢复，不采用线程级内存兜底。分类与生成 token 仅记录数量；解析可剥离一层代码围栏或短前后说明，但提取后的字段/evidence/scope 仍按严格 schema fail closed。格式纠错后仍失败保留可操作失败态；重试复用冻结来源，来源变化时明确提供“按当前消息重新生成”，频率阻断、状态变化或异常均给出可见反馈。完成卡片与日记一样按冻结来源消息锚定，刷新、分页和重进页面位置稳定；阅读器使用 9:13 纵向、最多三层预览且不首尾循环的有限分页梦境卡，最后一页只有用户明确选择“是”才以低权限、非事实、非记忆、非预言材料进入同线程同分支后续上下文 | `src/ai/dream/`, `DreamChatCard`, `DreamDeckPager`, `DreamReaderScreen`, `companion_dream_*` |
| 离线思绪 | 已实现，V1 核心 | 只在完整问答后由本地规则识别脆弱、受伤、和解、道歉、赞美与冷淡事件，十分钟会话窗口统一批量生成；每角色北京时间每天最多三条，允许模型返回零条。思绪是给 AI 的一次性低权限短念头，不在聊天页直接展示；选择时原子预留，生成失败可释放，同一回复重试复用，回复、generation job 与消费状态在同一事务完成，来源消息/当前已采纳分支仍有效才消费，生成期间切换分支会在同一终态事务释放预留，启动维护还会回收历史 terminal 消息遗留的预留，之后不再注入。任务具备 lease、退避、幂等、Personal 隔离和内容无关 token 计量；用户在“内心独白”中长按进入多选并以单事务永久删除，新删除不进入回收站，升级前已处于 `soft_deleted` 的旧数据仍保留恢复入口 | `src/ai/thought/`, `companionArtifactService`, `CompanionInnerLifeScreen`, `companion_thought_*` |
| 内心产物仲裁 | 已实现，V1 核心 | 每轮最多选择一个日记/梦境/思绪动态段；用户明确允许的同线程同分支梦境或日记优先于待消费思绪，全部使用统一 artifact contract，并标注为不可信、低权限、非事实/非指令内容。跨空间移动按依赖顺序保留投影、梦境、思绪、任务与来源版本，运行中任务清 lease 后恢复，源角色删除时清理孤立计数与角色投影 | `companionArtifactAdapter`, `companionArtifactService`, `aiThreadRepository`, `aiChatService` |
| RAG/材料 | thread material、IP snapshot、knowledge base、keyword/hybrid retrieval；每次请求按实际片段顺序分配 `S1...`，模型只有实际使用资料才输出隐藏引用标记，流式阶段不会闪现半截标记；完成、停止、失败及中断续写时按回答句子位置落库并复核来源可见性、文档/素材版本、片段 SHA-256、claim span 和本地词面支撑，无标记不生成引用，失效引用不展示；文档删除使用 citation 子查询清理，embedding 写入按最多 100 条一批执行，同一 chunk/provider/model 的重复输入保持最后写入生效 | `aiDocumentService`, `aiRetrievalService`, `aiCitationProtocol`, `aiKnowledgeRepository`, `aiThreadRepository` |
| 文档解析 | manual text、txt、markdown、pdf、docx、pptx；chunking、reader | `documentParsers/`, `AiDocumentReaderScreen` |
| 文档生命周期 | 已支持手动文本/TXT/MD/PDF/DOCX/PPTX 导入、受管目录复制、解析重试、切片、线程/IP/知识库归属、检索引用、阅读、跨空间移动、删除和原文件备份恢复；存在可用默认 Embedding 配置时，导入/重解析会自动补全向量，最多并发 3 个请求且不含重试/退避，并只 upsert 本轮缺失 chunk、保留同模型已有向量；尚无统一收件箱、全局跨资料搜索、来源更新检测和同步状态 | `aiDocumentService`, `aiDocumentRepository`, `AiMaterialLibraryScreen`, `AiDocumentReaderScreen`, `managedBackupService`, `aiEmbeddingService` |
| 沙箱动态查询与文档固化 | 已实现 | 未配置向量时支持 CSV/Excel (≤5MB) 确定性两步 (Two-Step) SQL 临时表查询，只读 `SELECT` 安全检索，8 秒超时安全退避为语义切片；临时会话附件默认单轮脱水使用不污染记忆库，支持消息气泡一键“存入资料库”；短设定（≤2500字）固化时直接注入提示词稳定区享受 Prefix Cache；误触 5 秒全系统统一顶部毛玻璃 Toast 可逆撤销；点击已存入胶囊唤起统一 AppActionSheet 查看与管理 | `docQueryIntentDetector`, `tableSchemaParser`, `sqlSafetyGuard`, `tempTableService`, `aiDocQueryCoordinator`, `aiDocumentPinService`, `AiMessageBubble`, `AiChatScreen` |
| 产品帮助文档 | 关于页进入应用内 Markdown 阅读，官网图片后台预取并持久缓存；这是产品帮助链路，不会自动作为用户知识库或系统 RAG 材料 | `AboutScreen`, `ProductDocumentationScreen`, `productDocumentationService`, `productManualMarkdown` |
| Live2D 桌宠 | 完全关闭/不上线；已移除聊天页与会话设置页的运行时入口，不加载模型、不渲染 WebView、不注册事件监听、不启动动画/手势，也不提供下载或预览入口；保留源码、模型列表、已下载文件和既有 SQLite 设置值，恢复前必须重新完成 Android 性能验收 | `Live2DPetView`, `Live2DPetManagerModal`, `live2dManagerService`, `petModels` |
| 分支 | edit/regenerate 分支、message versions、branch route metadata、分支树、采用主线；聊天首屏预取、正式加载、下拉/后台刷新、聊天搜索、路线树与“最近聊天”均从同一持久采用路线投影读取，预取结果以 lineage 版本复核后才显示；显式空路线始终表示主线，不会退化成“所有分支”。采用路线指针与元数据在同一 SQLite 事务落盘，最近聊天的预览/排序只使用该路线的最后一条完成消息，不会被更晚的隐藏兄弟分支挤占。创作路线树入口位于会话设置的当前会话模块；【路线树性能与体验深度重构】建立 `idx_ai_message_versions_thread` 索引并精简 `listBranchTreeCandidates` 聚合比较字段，消除全库大字段哈希对比；引入 10 秒短期树内存缓存与会话设置抽屉滑出预取（prefetch）；单版本节点快速直通缓存；Android 路线树避免全画布 SVG/bitmap，长路线用局部连线、预算化采样点阵与超视口裁剪降低卡顿和闪退风险；首帧预居中无跳动闪烁，新增浮动缩放/回正悬浮岛（+/-/回正），节点卡片升级微立体质感（角色徽章/版本Chip/HEAD勋章），全面健全 UX 骨架/空态/重试四态闭环。 | `aiThreadRouteSnapshotService`, `aiThreadRepository`, `aiBranchTreeService`, `AiChatScreen`, `AiChatSearchScreen`, `AiBranchTreeScreen`, `BranchTreeCanvas`, `BranchTreeNodeCard`, `BranchTreeGrid`, `AiSessionConfigScreen` |
| 聊天搜索 | 当前路线 local exact/fuzzy 搜索，定位回聊天 | `AiChatSearchScreen`, `aiThreadRepository` |
| 收藏 | assistant 消息收藏、分支 scope 收藏、收藏列表 | `aiThreadRepository`, `AiMessageBubble` |
| Usage | provider usage 归一化、cached token ratio、线程/总览用量；DeepSeek 官方原生 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 进入缓存命中、未命中与命中率观测，Provider 未返回缓存字段时明确显示“未观测”；梦境分类/生成和思绪生成分别保存 content-free prompt/completion token 数，不落库 prompt 或模型正文副本 | `aiProviderUsage`, `aiUsageAnalytics`, `AiUsageSummary`, `companion_dream_jobs`, `companion_thought_jobs` |
| 消息渲染 | Markdown (全新标记解析器防注入)、代码块、表格、原生图片附件画廊展示、HTML/CSS WebView、数学块、citation、thinking block、render cache；rich-HTML 判定按内容 memo，数学块按公式 memo KaTeX 编译与 WebView HTML；【极速渲染与免疫盾】历史气泡绝对免疫盾（`areAiMessageBubblePropsEqual` 切断流式生成期历史气泡唤醒，实现 0 陪跑）、纯文本极致 Fast-Path（非流式且无 Markdown 触发符时单层原生 Text 直出，0 AST 解析，0 额外 View）、非最新历史消息超长文（>14行/深历史>10行且含复杂Markdown）支持智能折叠与纯白自然淡出，保留展开阅读全文和收起；普通长代码块（>12行）支持轻量折叠至前 8 行并带展开/收起按钮；选择文本全屏弹窗（AiMessageTextSelectionModal）富文本预览态默认免折叠（`AiMessageContent` 扩展 `disableFolding` 与 `defaultExpanded`），彻底根除全屏选区长文被截断为 280px 或长 HTML 被折叠成 8 行纯代码块的体验缺陷。 | `AiMessageContent`, `AiMessageBubble`, `AiMathBlock`, `AiMarkdownReader`, `useSmoothStreamingText`, `AiMessageTextSelectionModal` |
| AI UI | 工作台、聊天、会话设置、角色库、角色详情、材料、知识库、文档 reader、历史；【外观设置、聊天视觉定制与极简模式升级（2026-10-23）】：外观设置支持推挤缩放（`push_scale`）与经典覆盖（`classic`）双模切换，5 档 3D 空间透视（0°~16°）彻底移除 2.6°「推荐」徽章与冗长卡片文案，外观页新增「我的」页面风格切换（默认极简 `minimalist`，可选经典 `classic`）与「聊天视觉定制」二级入口；独立二级页 `ChatAppearanceSettingsScreen` 顶部常驻 168dp 纯白拟真聊天预览视口（带真实系统管家头像与用户气泡实时联动），提供微信绿（`#95EC69`）等 7 色色卡、气泡圆角滑杆（4~28dp，14dp微信风格）、头像圆角滑杆（0~20dp，6dp微信风格）、5 档文本排版微调（字号、字距、行距、段间距），排版默认严格处于第 2 档标准档位；气泡底部操作栏重排与自动补位：左侧放 `< 2/2 >` 批次按钮，单版本时下一个按钮（复制）自动补位到最左侧无空白间隙，重新生成按钮居最右侧；「我的」页面极简模式重构：彻底去除大面积彩色存储进度条与堆砌数字，纯粹使用 10px 极窄空行物理分隔白色 Inset Group（两边严格 8px 边距，无容器外边框），统一 20px 黑白矢量图标，坚决不写分类文字标题；设置页首行新增「个人信息」管理（`ProfileInfoScreen`）：支持修改昵称、更换头像、佩戴星轨流光头像框开关、头像圆角滑杆与顶部微缩即时预览；新手引导恢复单次触发限制；推挤缩放模式下主屏幕等比缩小至悬浮大圆角（28dp）卡片并向右推开，底层透出 `#ECEEF1` 高级冷灰画布，完全移除黑幕遮罩与子卡片内阴影黑圈；外观设置预览框扩大至 148dp 并延长推进态停留时间至 2.6s 配合实时 3D 偏转；在推拉展开态下点击左侧抽屉切换历史会话或“开启新对话”时全程保持推拉态不收起，右侧缩放主卡片原地加载新会话并同步左侧高亮；工作台消息列表对于从 IP 开始的会话在聊天名右侧显示精致灰底 IP 标记，会话头像复用对应 IP 卡片封面并支持在 IP 封面更新后实时同步；工作台移除“选择IP开聊”与“会话历史”入口卡片，整体上移贴近状态栏，最近聊天列表改为全屏宽并取消五条数量限制；工作台和角色库头像统一采用小圆角矩形；聊天消息与日记按北京时间自然日插入独立 `dateSeparator` 列表项，当天/前一天显示“今天/昨天”，每个自然日只出现一次且不会进入 reasoning 或正文节点；聊天首屏将消息页与非关键模型/外观/记录读取分阶段加载，并合并模型图标与名称查询，返回工作台优先显示内存快照再后台刷新；聊天页支持左侧菜单按钮和全屏右滑打开综合记录抽屉、左滑打开会话设置抽屉，顶部搜索靠近抽屉入口，右侧提供会话设置与聊天气泡形态的新会话入口；会话设置抽屉固定显示线程标题与用量入口，快捷操作随内容滚动，模型名称精简展示，角色指令以只读预览进入全屏编辑，并可展开共用头像选择器；消息长按菜单按手指所在屏幕半区在触点上方或下方 `5px` 弹出，键盘压缩视口时操作列表在菜单内滚动并保持触点锚定，流式回复的正文/思考尾段和降级 continuation 路径同样可长按；用户消息提供复制、全屏选择文本和修改，AI 消息保留复制、全屏选择文本、收藏、继续生成、续答/回复、重新生成的独立入口，菜单底部始终显示 `HH:mm`；非最新消息不显示常驻操作栏，只有版本切换继续留在气泡下方，最新 AI 回复可保留原操作栏；输入框左下角模型图标右侧提供小灯泡 `AI 帮答` 入口，弹出固定高度的底部阅读器式候选面板，支持短句/长句切换、刷新保留历史页与左右翻页；聊天输入区首次进入时以 420ms 淡入并从下方轻移 20px，动画层使用页面同色合成底以避免 Android elevation 阴影产生黑色中间帧；“我的头像”默认开启，显式关闭按会话保留 | `src/screens/Ai*.tsx`, `src/components/ai/`, `src/screens/SettingsScreen.tsx`, `src/screens/AppearanceSettingsScreen.tsx`, `src/screens/ChatAppearanceSettingsScreen.tsx`, `src/screens/ProfileInfoScreen.tsx` |

---

### 3.1 聊天运行时性能（P0/P1，更新至 2026-08-20）

- 聊天记录以 `(createdAt, id)` 作为稳定顺序和 keyset cursor；首屏与“加载更早”均读取 `limit + 1` 条基础消息，精确计算 `hasEarlierMessages`，不会随已加载总量累计重查历史。分支根消息仍只作为水合依赖，不参与分页边界。
- 路线快照携带分页 cursor，只有 `lineageVersion` 和 `thread.updatedAt` 均未变化时才直接采用，避免预取后立刻进行完整重载或额外计数查询。
- 流式 UI 发布与 SQLite 持久化合批解耦：每一个已发布字符计数对应真实可见文本；普通附着流终态直接提交 canonical patch，不再重载整段消息。阅读历史时的 buffered tail 仍保留 canonical reload，保障恢复一致性。
- 生成结束后的远程模型标题改为按空间/线程串行的后台 best-effort 任务，终态和输入恢复不再等待该请求；标题变更通过会话级事件回写页面。首次 memory notice 在交互空闲后读取，最近聊天仅在记录抽屉打开时加载，参与者外观读取保持共享 SQLite 连接串行。
- 普通线程打开在路由提交前预取首消息页；进入页先清除旧线程可见数据并覆盖聊天骨架，非空列表只在首个 content-size 布局提交后揭开，空/失败路径显式结束 ready。普通进入不再调用 latest-jump retry，搜索/分支/编辑仍保留命名定位重试。
- 超长历史的旧页与当前窗口按 `(createdAt, id)` 线性合并，当前窗口版本在 id 重叠时胜出；around-anchor 使用单条 CTE statement 读取 latest/before/anchor/after，不再在同连接并发多条读取或在 JS sort；100 页/6000 条 repository benchmark 验证不重不漏。隐藏或后台的 ParallaxLightSweep 会取消无限循环。
- 媒体/聊天热查询由 normal/personal 初始化共同确保复合索引；媒体列表使用 keyset cursor、`limit + 1` 和 id tie-breaker，查询缓存按 scope、LRU、TTL 与 global+space data epoch 失效。100,000 行媒体及 6000 消息内存 SQLite 基准记录延迟与 query plan。
- 当前仍未发现 ADB 设备；Android 真机的 20k 消息首次进入/高速往返、键盘切换、流式 detached tail、RSS/帧时间门禁均标记为“待验证”，不是已通过。

## 4. IP 与素材库矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| IP 创建/编辑 | 创建 IP、编辑名称/说明、封面、最近查看、收藏统计 | `CreateIpScreen`, `EditIpScreen`, `IpDetailScreen`, `ipRepository` |
| IP 列表/首页 | 首页 IP 卡片、最近/收藏/统计入口；冷启动只挂载 1 个与真实卡片共享尺寸 token 的 skeleton + shimmer，无文字加载提示；首卡和后续卡统一轻量路径、封面 priority 由可见位置决定，不再为第一张单独启动传感器/高光 | `HomeLibraryScreen`, `IPCard`, `IPCardSkeleton`, `componentTokens.ipCard` |
| IP 删除 | IP 软删除、永久删除、本地文件清理 | `ipDeletionService`, `TrashScreen` |
| IP 封面 | 自定义封面、个人空间 blur fallback、封面选择 | `IpCoverPickerScreen`, `GroupCoverPickerScreen` |
| 图片详情 | 原图、备注、标签、分组、收藏、最近查看、资产编码 | `ImageDetailScreen`, `EditImageScreen`, `imageRepository` |
| 视频详情 | 视频元数据、播放入口、保存到系统相册、删除 | `VideoDetailScreen`, `videoImportService`, `videoMoveService` |
| 原文件安全 | 原图/视频复制到 app storage，不压缩、不覆盖、不依赖临时 URI | `fileStorageService`, `imageImportService`, `videoImportService` |
| 缩略图/预览 | 图片缩略图、视频缩略图、缺失预览重建；缩略图始终为独立派生文件，不覆盖原件；大批量导入顺序生成以限制解码峰值，列表/阅读器各自使用受限 cache/预取策略 | `thumbnailService`, `previewMaintenanceService`, `SecureImage`, `mediaImagePrefetchCoordinator` |

---

## 5. 导入与批次矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 图片导入 | 多选图片、读取 metadata、复制原图、缩略图、创建记录；预检 1000 文件/256 MB 单图片/32 GB 总量/未知大小预留/512 MB 存储余量，实际字节变化时提交前复查；混合批次与视频共享同一实际写入账本 | `ImportImagesScreen`, `imageImportService`, `mediaImportPreflight` |
| 视频导入 | 多选视频、读取时长/尺寸、复制原视频、生成视频缩略图；预检 20 GB 单视频与批次/存储预算，复制、hash、封面和数据库写入均保留取消检查及显式回滚；混合批次与图片共享同一实际写入账本 | `videoImportService`, `mediaImportPreflight`, native media module |
| 导入目标 | 导入到指定 IP、创建新 IP、选择分组和标签；导入页支持在同一流程中搜索并切换目标 IP，顶部归属卡片、分组列表和最终写入目标会随选择同步更新 | `ImportImagesScreen`, `ImportResultScreen`, `ipRepository` |
| 导入批次 | 批次记录、批次复盘、当前批次 duplicate review；最近 30 批的 success/failed/skipped 由一条分组查询聚合，不读取每批明细；批次默认按来源顺序展示，支持来源正/逆序 | `ImportBatchHistoryScreen`, `ImportBatchReviewScreen`, `BatchManageImagesScreen`, `importBatchRepository` |
| 导入模板 | 管理导入模板，复用分组/标签等导入配置 | `importTemplateRepository` |
| 素材来源与移动 | 图片和视频分别记忆“相册/文件”来源，文件入口支持批量选择且保持 `copyToCacheDirectory: true`；只有选择器返回、显式标记 owned 且仍位于 Expo cache 的 URI 会在移除/取消/成功离页时清理，相册原件不进入该路径；相册移动在全部成功素材完成 Pixory 本地持久化后，合并图片/视频 assetId 发起一次 Android 系统删除确认，取消、assetId 缺失或删除失败时保留导入结果并明确提示 | `ImportImagesScreen`, `mediaFilePickerService`, `mediaSourceDeletionService`, `imageImportService`, `videoImportService` |
| 资源包导入 | zip/cbz 包选择、zip-slip 防护、图片识别、按文件夹映射分组；Personal 入口将整个资源包任务注册到锁定屏障，并把会话 token 贯通普通素材导入及识别出的 Pixory 备份恢复路径 | `ImportImagesScreen`, `packageImportService`, `ArchiveReaderScreen` |
| 分享接入导入 | Android 分享图片/视频/文件到 Pixory | `ShareCollectScreen`, native media module |

---

## 6. 浏览、整理与检索矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 全部素材 | 全部图片/视频列表、排序、视图模式、筛选、多选；支持来源顺序排序 | `AllImagesScreen`, `assetListPreferences`, `SortMenuButton` |
| 分组素材 | IP 分组页、全局分组页、分组结果页 | `GroupOverviewScreen`, `GroupImagesScreen`, `GlobalGroupsScreen` |
| 标签素材 | 标签总览、标签结果页、标签多选、标签创建/删除 | `TagsOverviewScreen`, `TagResultScreen`, `tagRepository` |
| 收藏 | 图片收藏 cursor/虚拟列表与筛选；AI 消息收藏按分段懒加载并以 `(createdAt,id)` keyset 继续分页，不再默认 80 条静默截断 | `FavoritesScreen`, `imageRepository`, `aiThreadRepository` |
| 最近查看 | 最近查看列表、清空本地查看历史 | `RecentViewedScreen` |
| 全局搜索 | 素材搜索、建议、历史记录展平按单层级日期显示、范围自定义删除、高亮词面片段、极光加载动画、结果跳转；输入防抖、分类 SQL 查询和每类 20 条结果上限 | `GlobalSearchScreen`, `GlobalSearchHistoryScreen`, `searchHistoryService`, `ipRepository`, `groupRepository`, `tagRepository`, `imageRepository` |
| 快速整理 | 未整理提示、按顺序快速设置 IP/分组/标签/备注 | `QuickOrganizeScreen`, `OrganizeScreen` |
| 批量整理 | 批量移动、打标签、收藏、选择规则、撤销快照；图片/视频可混选后批量移动到其他 IP | `BatchManageImagesScreen`, `BatchImageOrganizePanel`, `videoMoveService`, `batchUndoService` |
| 选择规则 | 全选、同前缀、相似图、多规则交集 | `batchSelectionRules` |

---

## 7. 图片与视频体验矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 图片查看器 | 翻页、沉浸 reader、filmstrip、设置、zoom 手势、反向顺序；81 项初始锚点窗口 + 40 项边界 keyset page，按速度/方向在 8/4、16/6、32/8 编码窗口间自适应，解码封顶前 6/后 3、并发编码 4/解码 2；预解码使用 viewport 双维像素上限，Android trim/low-memory 后本屏切 encoded-only 并释放 decoded refs；重叠预取去重、换代释放、退出恢复 last-viewed，Personal 只保留内存会话并在锁定清除 | `ImageViewerScreen`, `mediaPrefetchPolicy`, `mediaImagePrefetchCoordinator`, `mediaReaderContextQuery`, `mediaReaderSessionCache`, `mediaLastViewedQueue`, `pixoryMediaModule` |
| 系统相册保存 | 保存单张/多张图片或视频到系统相册；mp4/mov/mkv/webm/avi/m4v/3gp（含 query URI）统一走 native video MediaStore，其余图片走 image 路径 | `mediaLibraryService`, `AlbumSaveDialog`, `PixoryMediaModule` |
| 视频播放器 | 自动播放、顺序/随机播放模式、循环、播放/暂停、进度拖动、横竖屏、锁定、末尾恢复保护；61 项锚点窗口 + 40 项边界页，previous/current/next 封面槽位跟手切换，单播放器换源后等待首帧再移除中心封面；底部提示作为独立浮层固定在进度条上方，进度条与控制按钮保持贴底，播放列表限制约 4 条可视高度并使用虚拟列表；切换回调使用令牌防止旧动画覆盖新视频；Android 变换场景使用稳定 TextureView 降低换源闪烁 | `VideoPlayerScreen`, `mediaExperiencePreferences` |
| 视频手势 | 双击播放/暂停、左右区域切换、长按快进、scrub；竖滑为 previous/current/next 三槽跟手、速度/距离决策、可从当前 transform 中断反向；0.5×–3× 统一 `preservesPitch=true` 后设置速率 | `VideoPlayerScreen`, `videoSwipePolicy`, `videoPlaybackRate` |
| 视频偏好 | 播放器偏好持久化、图片 viewer 偏好持久化 | `mediaExperiencePreferences` |
| 外部视频 | open-with 外部视频进入播放器 | `App.tsx`, native media module |

---

## 8. 重复检测与回收站矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| Exact 重复 | SHA-256/content hash 扫描和 exact duplicate 分组 | `duplicateDetectionService`, native media module |
| 相似重复 | image dHash/visual hash、Hamming distance 相似组 | `duplicateDetectionService`, `batchSelectionRules` |
| 导入跳过 | exact duplicate 导入跳过、统计 skipped count | `imageImportService`, `DuplicateReviewScreen` |
| 重复审查 | exact/similar tabs、多选、软删除 | `DuplicateReviewScreen` |
| 回收站 | soft delete、长按多选批量操作、恢复、清空、30 天过期清理 | `TrashScreen`, `trashService` |
| 删除结果 | 数据库删除和文件删除结果分开记录 | `trashService` |

---

## 9. 备份、恢复与存储矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 普通备份 | Manifest V2 包含空间 SQLite、原图/视频原件、缩略图、AI 文档原文件、聊天附件和角色头像；所有文件只使用相对路径，按内容 SHA-256 去重并在复制后复核大小与哈希，必需文件缺失时整次备份失败而不伪报成功 | `backupService`, `managedBackupService`, `backupManifestProtocol`, `BackupScreen`, `fileStorageService` |
| 单 IP 备份 | 指定 IP 的数据库快照和素材文件使用 Manifest V2；恢复只导入该 IP 及素材，不意外合并快照中的其他 AI 数据 | `backupService`, `managedBackupService` |
| 隐私备份 | personal plain、personal encrypted、all encrypted pack | `backupService`, `personalSystemService` |
| 备份导入 | 兼容旧 plain backup，并支持 Manifest V2 plain/personal encrypted merge：解包后先校验版本、空间、相对路径、大小和 SHA-256，再把文件写入受管目录；SQLite 事务按依赖合并 AI/记忆/陪伴记录、重写文档/附件/头像与 IP/图片引用。角色、线程、消息、文档、日记版本、摘要 provenance、continuity anchor、memory evidence、generation alternate ID 与任务等 logical ID 冲突时按数据库内容哈希建立持久导入会话映射，递归重写外键、声明式无外键引用和 JSON 引用；分支 scope 会拆分并重写根消息 ID，memory event 的多态 aggregate、事件 replay payload 内嵌实体 ID/canonical unique key/二次 JSON provenance 数组、continuity rollback 前后快照 ID 都按“表 + JSON 列 + discriminator”规则与 canonical 行同步映射，真实 V47 rebuild replay 后仍同时保留目标与导入投影，既不覆盖目标编辑也不留下旧来源 ID。FTS virtual/shadow 表不直接导入，canonical 行完成映射后统一重建三个 FTS 并执行完整性检查；失败、取消或锁定均回滚数据库并清理本次新建文件（包括尚未返回给外层的 AI staging 文件）；Personal 明文 staging 仅位于 Personal temp 且 finally 清理，从资源包入口识别出的备份同样注册统一任务屏障并贯通 token，锁定会中止 checkpoint 并等待恢复任务退出 | `ImportImagesScreen`, `packageImportService`, `backupService`, `managedBackupService`, `managedBackupIdMapping`, `backupManifestProtocol` |
| 系统目录导出 | SAF 目录选择、导出到系统文件夹、进度 | `BackupExportManagerScreen`, native media module |
| 存储统计 | 原图、缩略图、缓存、备份、回收站、IP 存储明细；预览单次 inventory、备份有界枚举和空间隔离快照 | `StorageUsageScreen`, `storageUsageService`, `storageUsageSnapshotCache`, `IpStorageDetailScreen` |
| 缓存清理 | image memory/disk cache、temp cache、daily startup cleanup；目录体积递归与相册 metadata 均走固定最多 4 worker，单条失败隔离，不再按目录宽度创建无界 Promise | `cacheCleanupService`, `boundedFileConcurrency`, `mediaImportOrderService` |
| SQLite 游标与缓存 | normal/personal 初始化幂等创建媒体/聊天复合索引；created/recent/video 使用稳定 keyset cursor 与 id tie-breaker；查询缓存采用 scope-aware LRU + TTL + global/normal/personal data epoch，结构写只推进所属空间，last-view 不推进；聊天 around-anchor 用单 CTE statement；`bench:media-db` 固定 100,000 行，`bench:chat-db` 固定 6000 消息/100 页并验证索引 plan | `database/db`, `databaseSpaceRegistry`, `imageRepository`, `assetRepository`, `aiThreadRepository`, `scopedLruCache`, `dataEpochService`, `scripts/benchmark-media-database-performance.cjs`, `scripts/benchmark-ai-message-repository.cjs` |

当前备份边界必须按以下方式理解：

- 实现层已覆盖 AI 数据库记录、文档原文件、线程附件和角色头像，并在恢复时重新分配受管 URI，不复用旧设备绝对路径。
- SecureStore 中的 Provider API Key 不进入备份；恢复后相关服务商密钥需要用户重新填写。
- 自动化测试已覆盖 Manifest 结构、路径穿越拒绝、哈希/大小门禁、事务合并和 URI 重写策略；在真实 Android 设备完成“导出 → 清空/重装 → 导入 → 打开文档/附件/头像”验收前，能力矩阵只声明实现完成，不声明真机换机链路已验证。

---

## 10. 隐私空间矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 空间模型 | normal/personal 双数据库/双文件目录，route 携带 space | `database/db`, `route-space-policy`, `App.tsx` |
| 聊天跨空间迁移 | 普通且已停止生成、未使用会话专属 API Key 的线程，可连同消息、分支、引用、附件与文件、收藏、线程材料、线程记忆/摘要/维护状态、线程画像、角色卡完整配置/头像/角色记忆、续聊导入元数据，以及 Companion Event、时间锚点、OpenLoop、后台任务和内容无关 trace 按依赖顺序迁移；运行中的 companion job 在目标空间清除旧 lease 并转为可恢复 retry；共享角色按稳定 `roleCardId` 去重，同批或分批移动到已有目标角色时复用目标卡并只补齐缺失记忆，不重复建卡或覆盖目标侧编辑；同一角色仍被源空间其他线程使用时保留源副本，无引用时才清理源角色及未共享头像；跨空间后清除仅在源数据库有效的素材数字引用，源空间同步清理线程记忆和独立 FTS，旧续聊回退窗口在目标空间锁定；IP/知识库绑定线程暂不跨独立空间数据库移动，避免静默错绑 | `aiChatService`, `aiThreadSpaceMovePolicy`, `aiRoleCardRepository`, `aiThreadRepository`, `aiDocumentService` |
| 密码 | 设置、验证、修改、重置隐私系统 | `personalSystemService`, `PersonalUnlockModal` |
| 锁定 | 后台 grace period、解锁 modal、普通/隐私路由隔离 | `App.tsx`, `PersonalUnlockModal` |
| 隐私任务 token | 长任务中校验 session token，防止锁定后继续写入 | `personalTaskToken` |
| 隐私渲染 | SecureImage、个人封面 blur fallback | `SecureImage`, `privacy-cover-viewer-policy` |
| 隐私备份 | normal 备份排除 personal，personal 备份需验证 | `backupService` |

---

## 11. 系统、发布与运维矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 远程更新 | `update-version.json` 拉取、版本比较、官网下载 fallback、GitHub latest fallback；关于页与「我的」页面最底端「检查更新」统一闭环（显示当前版本号并支持 APK 与 OTA 热更新双轨检测下载） | `updateCheckService`, `docs/update-version.json`, `AboutScreen`, `MeScreen` |
| 远程公告 | `announcement.json` 拉取、一次性公告 id | `announcementService`, `docs/announcement.json` |
| 用户身份与发号系统 (UID) | 基于服务器端 (Node+PM2) 自增发号器，客户端 SecureStore 永久固化。支持基于原生整数 (raw ID) 的纯离线 A/B 测试基建；支持通过直接修改服务器端 `counter.txt` 游标实现“靓号锁仓”（如调至10即可雪藏前10号），并在客户端配合隐藏彩蛋强行覆写 SecureStore 实现定向发放；支持弱网 3 秒熔断，无感挂载于 App 启动期。 | `src/services/uidService.ts`, `server.js` (服务器端) |
  | OTA | Expo update 配置、生产 OTA 下载提示；本地热更新记录通过 PowerShell 调用结果判断成功，避免未设置原生命令退出码时误报失败，已写入记录不盲目重复 | `app.json`, `scripts/record-hot-update.ps1`, `update-check-policy`, `version-document-workflow-policy` |
| 官网 | 首页下载、updates、sitemap、release-facing docs | `docs/index.html`, `docs/updates.html`, `docs/sitemap.xml` |
| Android release | version 同步、clean 后仅构建 ARM 真机 ABI、产物 ABI/签名校验、官网部署、GitHub Release；每个迭代必须持续维护 PRD/TDD/Test Report 与对外/对内发版说明；打包前预览本次本地过程文档，只有 APK 成功复制后才将当前文档平铺归档到对应版本、固化版本更新说明并开启下一补丁区间，失败不移动、重复执行不覆盖；交接脚本自动生成/更新 GitHub Release 说明并上传 APK；功能矩阵只保留本文件最新版，待办目录不随打包移动；桌面图标使用预合成 legacy launcher bitmap，避免 adaptive-icon 前景遮罩裁切；Android 12+ 启动屏使用 transparent compact 前景和 `#4a7bf7` 纯色底，原素材缩小 12.5% 后按实际内容居中并保留至少 24% 透明边距，中心聊天气泡及图库、视频、相机、爱心、轨道和星点外围装饰完整保留；Expo 配置与原生五档密度资源由同一脚本/compact master 生成，避免 clean prebuild 与直接 Gradle 构建效果分叉 | `docs/repository-workflow.md`, `.gitignore`, `app.json`, `icons/splash_foreground_compact.png`, `scripts/version-document-workflow.ps1`, `scripts/generate-android-splash-assets.cjs`, `scripts/build-android-release.ps1`, `scripts/release-handoff.ps1`, `scripts/README.md`, `android/app/build.gradle` |
| Native bridge | SAF copy、zip entry、PDF render/text、video metadata、thumbnail、hash、可取消 direct speech recognition、share/open intent、`ComponentCallbacks2` memory-pressure event；原生 Activity/主题/媒体模块均由版本化 Expo config-plugin 模板生成 | `src/native/pixoryMediaModule.ts`, `plugins/withPixoryAndroidIntents.js`, `plugins/pixory-android-intents/templates/` |
| UI 基础组件 | toast、dialog、action sheet、empty state、form、header、cards、chips、sort menu、IpRail（长按拖拽避让排序、防竞态同步测量、无级变速边缘自滚动） | `src/components/` |
| 设计 tokens | spacing、rhythm、colors、radius、typography、metrics | `src/design/tokens/` |

---

## 12. 主要测试覆盖

| 领域 | 代表测试 |
| --- | --- |
| AI 聊天/Prompt/缓存/RAG/记忆/角色卡 | `tests/ai-*.test.cjs`, `tests/ai-context-budget-unit.test.cjs`, `tests/ai-bounded-concurrency-unit.test.cjs`, `tests/ai-embedding-service-integration.test.cjs`, `tests/ai-knowledge-repository-performance-integration.test.cjs`, `tests/ai-chat-performance-hardening-policy.test.cjs`, `tests/ai-message-repository-performance-policy.test.cjs`, `tests/ai-chat-streaming-tail-policy.test.cjs`, `tests/ai-chat-streaming-tail-contract.test.cjs`, `tests/ai-chat-streaming-tail-render-contract.test.cjs`, `tests/ai-chat-streaming-runtime-policy.test.cjs` |
| 生成崩溃恢复/Android 语音 | `tests/ai-generation-recovery.test.cjs`, `tests/ai-generation-repository-integration.test.cjs`, `tests/ai-direct-speech-policy.test.cjs`, Android `:app:compileDebugKotlin` |
| 陪伴运行时/日记/关系/梦境/思绪 | `tests/companion-*.test.cjs`, `tests/role-diary-*.test.cjs`, `tests/chat-and-diary-runtime-completeness-policy.test.cjs`, `tests/ai-conversation-coverage-repository-integration.test.cjs`, `tests/ai-thread-space-move-repository-integration.test.cjs` |
| Android 图标与启动图 | `tests/android-icon-splash-policy.test.cjs`, Android `:app:processDebugResources` / `:app:assembleDebug` |
| 资产导入与重复检测 | `asset-duplicate-v1-policy.test.cjs`, `package-import-policy.test.cjs`, `bounded-file-concurrency-unit.test.cjs`, `media-import-preflight-unit.test.cjs`, `media-import-extreme-integration-policy.test.cjs`, `media-import-file-picker-unit.test.cjs` |
| 批量整理 | `batch-organize-ux-policy.test.cjs` |
| 隐私系统 | `privacy-system-policy.test.cjs`, `final-personal-system-policy.test.cjs`, `route-space-policy.test.cjs` |
| 备份 | `backup-export-ux-policy.test.cjs`, `managed-backup-v2.test.cjs`, `backup-storage-batching-policy.test.cjs` |
| 存储与回收站 | `storage-usage-policy.test.cjs`, `backup-storage-batching-policy.test.cjs`, `trash-clear-policy.test.cjs`, `cache-cleanup-policy.test.cjs` |
| 启动与大数据页 | `app-startup-performance-policy.test.cjs`, `media-collection-virtualization-policy.test.cjs`, `media-cursor-pagination-integration.test.cjs`, `ai-long-list-performance-policy.test.cjs`, `ai-knowledge-repository-performance-integration.test.cjs`, `batch-import-duplicate-performance-policy.test.cjs` |
| 媒体体验 | `mature-media-experience-policy.test.cjs`, `privacy-cover-viewer-policy.test.cjs`, `media-prefetch-policy-unit.test.cjs`, `media-reader-session-cache-unit.test.cjs`, `video-swipe-policy-unit.test.cjs`, `video-preload-pool-unit.test.cjs`, `video-pitch-preservation-unit.test.cjs`, `media-db-benchmark-policy.test.cjs` |
| 更新与官网 | `update-check-policy.test.cjs`, `website-flow-policy.test.cjs` |
| 版本文档与打包交接 | `version-document-workflow-policy.test.cjs`（必需 PRD/TDD/测试/双版本说明、持续追加、当前有效规则、冲突变更记录、本地归档隔离、单层目录、拒绝覆盖、幂等归档、APK 成功后交接和 GitHub Release 说明） |
| 仓库布局与推送边界 | `repository-workflow-policy.test.cjs`（公开分支、本地私有分支、路径布局和 pre-push 约束） |
| 安全风险 | `security-risk-mitigation.test.cjs` |
| 可访问性/UX | `accessibility-policy.test.cjs`, `v2-ux-enhancement-policy.test.cjs`, `current-ux-fixes-policy.test.cjs` |

---

## 13. 后续维护规则

每次改动如果触及以下任一情况，必须同步更新本文档：

1. 新增或删除页面、入口、导航路径。
2. 新增、删除或重命名核心 service/repository/native 能力。
3. 新增 AI 能力、prompt/cache 行为、provider、memory/RAG/角色卡逻辑。
4. 改变导入、备份、隐私、删除、存储、发布等高风险流程。
5. 修改用户可见功能名、发布说明中提到的能力、验收测试覆盖范围。

建议更新方式：

- 小改动：更新对应矩阵行。
- 新模块：新增功能域小节，并补充主要入口、文件和测试。
- 功能下线或暂不上线：保留条目并标记“实验/不上线”或“移除”，说明原因和替代路径，避免仓库残留代码被误判为已发布能力。
- 发布前：检查本文档是否与 release notes、README、测试文件和源码入口一致。
- 官网手册正文以 `docs/manual.md` 为事实源；`docs/manual.html` 在运行时读取该文件。应用内手册 `src/content/productManualMarkdown.ts` 是独立内嵌副本，修改用户手册时必须在同一变更中同步。

### 下次升级的增量复核方法

1. 先读取本矩阵；如需历史决策证据，再读取本地 `版本文档/历史文档/vX.Y.Z/` 对应版本目录，不要默认重新全仓扫描。
2. 从基线提交到当前提交列出变更文件：`git diff --name-only <baseline-commit>..HEAD`。
3. 优先核对变更涉及的页面/导航、service/repository、数据库迁移、原生桥、导入导出、隐私/存储/发布配置和测试。
4. 对每项用户可见变化更新矩阵状态、入口、边界和证据；代码存在但未发布的功能必须保持“实验/不上线”。
5. 运行 `pnpm typecheck`、`pnpm test` 和 `git diff --check`，并把结果与未验证项写入当前 `LOCAL_UPDATES_LOG.md` 和必要的版本过程文档。
6. 只有基线缺失、可信度不足、发生大规模架构重写或增量范围无法确定时，才重新进行全仓扫描。

## 14. 留给未来的数据拓展接口

2.5.6 版本重构了 `milestoneService.ts` 与 Markdown 生成引擎，并预留了以下扩展点；这些内容属于规划，不是当前已上线功能：

1. **更多数据聚合接口**
   目前底层已经通过 `runWithDatabaseSpace` 支持跨空间的 SQLite 聚合。未来如果要增加“最长连续聊天天数”“总使用时长”等维度的统计，可以在 `getAppMilestones` 中增加相应查询。
2. **多模态图表/年度报告接口**
   `generateMilestonesDetailMarkdown` 可继续扩展图表输出；在实现渲染器、移动端性能和可访问性验证前，不应把热力图或情感图表列为现有能力。
3. **沉浸式深链分发机制 (Deep Link Interception)**
   当前 WebView `onLinkPress` 已支持 `pixory://ip/...` 和 `pixory://thread/...`。未来可扩展 Memory/Image 深链，但仍需补充路由权限、隐私空间隔离和失效目标处理。



### 2.2 2026-09-05 诊断与聊天显示收尾

| ID | 功能/能力变化 | 实现边界 | 当前验证状态 |
| --- | --- | --- | --- |
| DIAG-CHAT-01 | 聊天页加载与流式显示性能诊断 | 记录历史首屏、分页、首个内容布局、500ms 流式渲染窗口及终态；不逐 token 写 SQLite | 类型检查、定向测试已验；真机时序待验 |
| DIAG-HOME-01 | 首页与资料库性能诊断 | 记录首页线程/角色加载、资料库首屏与分页耗时、数量和错误类型 | 类型检查、定向测试已验；真机加载数据待验 |
| DIAG-SQL-01 | 诊断批写避免事务嵌套 | 诊断事件批次不再自行开启 SQLite 事务，避免与聊天最终落库事务冲突 | 截图错误路径回归测试已验；真机 OTA 待验 |

| DIAG-EXPORT-01 | 诊断包文件分享与设备保存 | Android 使用文件分享 API 传递 ZIP；新增系统目录保存入口并校验 ZIP 存在且非空；不再仅分享一行描述文本 | 类型检查、导出文件契约测试已验；Android 真机文件管理器待验 |




