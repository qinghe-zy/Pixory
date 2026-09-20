# 方案二提示词：「液态星图」LIQUID COSMOS

## 设计哲学宣言

这套视觉系统的核心命题是：**本地 AI 伴侣的记忆体系，就像宇宙中每一颗星球之间不可见的引力——无处不在、无法外泄、永久运作。** 

设计灵感来自科学可视化领域的巅峰作品：天体图集、神经元网络图谱、量子场强度分布图。那些用于描述宇宙结构的精密图形语言——泰森多边形（Voronoi）、引力透镜弯曲、星云云团的密度渐变——被移植进这套产品的视觉体系中，成为「本地记忆深度」的具象隐喻。

整体色调是深宇宙蓝为基底，点缀以高饱和度的星云色彩：电光紫、极光青、亚轨道橙。不是炫技的 RGB 渐变，而是像一张真实的深空照片那样，暗部克制、亮部鲜明，颜色只出现在最关键的位置。这是 Full Palette 策略：三种有命名角色的颜色，各自统治特定区域，互不干扰。

---

## 一、色彩体系（完整定义）

### 主色调策略：Drenched（沉浸式，颜色拥有大面积区域）

| 角色名 | 颜色名 | HEX | OKLCH | 使用场景 |
|---|---|---|---|---|
| Void（虚空） | 深宇宙蓝黑 | `#050A12` | `oklch(5% 0.02 240)` | 页面主背景，不是黑色，是带深蓝底调的宇宙色 |
| Nebula（星云主色） | 极光紫蓝 | `#7C5CF5` | `oklch(55% 0.22 280)` | 主交互元素、「阅读文档」主按钮、功能卡片激活状态、重要文字高亮 |
| Aurora（极光辅色） | 星云青绿 | `#00D4C8` | `oklch(78% 0.18 190)` | 次要高亮、数据展示数字、图标辉光色、边框活跃态 |
| Flare（耀斑） | 轨道橙 | `#FF8C42` | `oklch(70% 0.22 48)` | 极少量点缀，仅用于「记忆日志」「故事分支」等叙事性功能的序号/图标 |
| Cloud（星云面） | 深蓝石板 | `#0D1829` | `oklch(12% 0.03 240)` | 功能卡片背景、次级区域背景，比 Void 亮两级 |

### 字色体系

- **主字色**：`#E8F4FF`（冷白，带微弱蓝调，像月光）
- **次要描述文字**：`#5A7A9B`（深蓝灰）
- **高亮关键词**：Nebula 极光紫蓝 `#7C5CF5` 或 Aurora 青绿 `#00D4C8`
- **被衬托的弱字**：`rgba(232,244,255,0.35)`

### 毛玻璃定义（此方案精确规格）

本方案在三处使用毛玻璃，每处规格不同：

**① 导航条毛玻璃（最深、最浓）：**
- `background: rgba(5, 10, 18, 0.75)` — 75% 不透明深宇宙蓝底
- `backdrop-filter: blur(30px) brightness(0.9)` — 模糊 30px，轻微降亮度，营造「深空夜视」感
- `border-bottom: 1px solid rgba(124, 92, 245, 0.2)` — 底边用 Nebula 紫调色
- 滚动位移超过 `80px` 后，`backdrop-filter` 的 blur 值从 `0px` 渐变到 `30px`（`transition: backdrop-filter 400ms ease`）

**② 功能卡片毛玻璃（中度，作为卡片背景）：**
- `background: rgba(13, 24, 41, 0.6)` — Cloud 色 60% 不透明
- `backdrop-filter: blur(16px)` — 中等模糊
- `border: 1px solid rgba(124, 92, 245, 0.12)` — 极淡的紫色边框
- `box-shadow: 0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(232,244,255,0.05)` — 外阴影 + 内顶边光（模拟玻璃厚度感）
- **Hover 态**：`border-color` 变为 `rgba(0, 212, 200, 0.35)` — Aurora 青绿描边，`box-shadow` 加入 `0 0 32px rgba(124, 92, 245, 0.15)` 的远距紫光

**③ 阅读文档 CTA 区域毛玻璃（最亮、最轻）：**
- `background: rgba(124, 92, 245, 0.12)` — Nebula 紫极淡底色
- `backdrop-filter: blur(12px)` — 轻度模糊
- `border: 1px solid rgba(124, 92, 245, 0.3)` — 可见紫色边框
- 这个毛玻璃框在深色页面上看起来像一扇发光的星图窗口

---

## 二、字体系统（艺术字 × 科学图谱气质）

### 主字体：Cabinet Grotesk（来自 Fontshare，免费）
- **用于**：英雄主标题
- **尺寸**：`clamp(80px, 10vw, 140px)`
- **字重**：`900`（Extrabold），Cabinet Grotesk 在极粗字重下拥有独特的几何切角，显微镜下每个字母都像精密机床产物
- **颜色处理**：主标题文字使用 CSS `background-clip: text` 技术，填充一个沿 `135deg` 方向的渐变：
  - 起点：Nebula 极光紫蓝 `#7C5CF5`
  - 中点：Aurora 青绿 `#00D4C8`
  - 终点：`#E8F4FF`（冷白）
  - 渐变让文字本身成为「宇宙能量流动」的可视化
- **字距**：`-0.04em`（极度压缩，大字体字距压缩是专业排版的基础）
- **行高**：`0.9`

> 如果 Cabinet Grotesk 无法获取，替代方案是 **Clash Display**（同为 Fontshare 免费字体），字重 700，效果相近但稍软。

### 副字体：General Sans（Fontshare 免费）
- **用于**：副标题、导航、按钮、正文功能描述
- **字号范围**：导航 `13px` / 副标题 `22px` / 正文 `15-16px`
- **字重**：正文 `400`，按钮/副标题 `600`，Kicker `700`
- General Sans 是一款介于 Aktiv Grotesk 和 Söhne 之间的现代无衬线，比 Inter 有更多几何感，适合科技品牌却不落俗套

### 点缀字体：Instrument Serif Italic（Google Fonts 免费）
- **用于**：引用块、首句箴言、页脚 Slogan
- **字号**：`24-28px`，必须 italic
- **颜色**：Aurora 青绿 `#00D4C8`
- Instrument Serif 是 2023 年新发布的字体，兼具现代感和传统优雅，italic 版本有独特的连接笔画，在深色背景上有手写墨迹的质感

---

## 三、页面整体结构

页面总宽 1440px，外边距 80px，12 列栅格，列间距 24px。整体是单轴向滚动，七个主要区域。

---

## 四、区域一：导航条

**尺寸**：高度 `76px`，固定在顶部  
**背景**：毛玻璃规格见上方①定义

**左侧 Logo：**
- 主文字 `PIXORY`：Cabinet Grotesk 900，`22px`，颜色 `#E8F4FF`
- Logo 右侧紧跟一个 `badge` 标签：`V2.8`，字体 General Sans 700，字号 `10px`，背景 Aurora 青绿 `#00D4C8`，颜色 `#050A12`（深色），内边距 `2px 6px`，圆角 `3px`，垂直居中于 Logo 文字旁

**中间导航链接（四个）：**
- `功能` / `记忆引擎` / `隐私协议` / `文档中心`
- General Sans 600，`13px`，全小写，颜色 `rgba(232,244,255,0.5)`
- **Hover 交互**：
  - 文字颜色变为 `#E8F4FF`（纯冷白）
  - 文字下方出现一个宽 `6px`、高 `6px` 的圆点（Aurora 青绿 `#00D4C8`），从 `opacity: 0, scale: 0` 变为 `opacity: 1, scale: 1`，动画 `250ms cubic-bezier(0.34, 1.56, 0.64, 1)`（带轻微弹跳的回弹曲线，有生命力感）
  - 圆点定位在文字下方 `6px`，水平居中

**右侧按钮组（从左到右）：**

① 「阅读文档」主按钮（**全场高优先级入口**）：
- **默认状态**：
  - 背景：Nebula 紫蓝 `#7C5CF5`
  - 文字：`#E8F4FF`，General Sans 700，字号 `13px`
  - 尺寸：高 `42px`，宽 `150px`，圆角 `100px`（完整胶囊）
  - 辉光：`box-shadow: 0 0 20px rgba(124, 92, 245, 0.4), 0 4px 16px rgba(124, 92, 245, 0.2)` — 常驻紫色辉光，让这个按钮在深色页面上如同一颗恒星
  - 按钮内部右侧有一个小箭头图标 `→`，用 SVG 绘制，`16px`，会在 hover 时向右移动
- **Hover 状态**：
  - 背景颜色从 `#7C5CF5` 变化到 `#9470FF`（更亮的紫）
  - 辉光增强：`box-shadow: 0 0 40px rgba(124, 92, 245, 0.7), 0 8px 24px rgba(124, 92, 245, 0.4)`
  - `transform: translateY(-3px) scale(1.03)`
  - 内部箭头 `transform: translateX(4px)`，`transition: transform 250ms ease`
  - 动画时长 `350ms cubic-bezier(0.16, 1, 0.3, 1)`
- **Active 状态**：`transform: translateY(-1px) scale(0.99)`，辉光减弱到 default 的 50%
- 按钮文字内容：`阅读文档 →`

② 「下载应用」次按钮：
- 样式：`border: 1px solid rgba(232,244,255,0.15)`，背景透明，文字 `rgba(232,244,255,0.7)`
- Hover：border 颜色变 Aurora 青绿 `#00D4C8`，文字变为 `#00D4C8`，无辉光

---

## 五、区域二：英雄区

**高度**：`100vh + 200px`（超出一个视口，下方内容区域开始显现时英雄区还没完全离开，营造深度感）  
**内容对齐**：水平居中，垂直从顶部 `180px` 开始

**背景视觉层（从后到前叠加）：**

第一层（最底层）：页面基础背景色 `#050A12`

第二层：全屏的「星场」效果
- 用 CSS 生成约 `200` 个极小的白色圆点（直径 `1-3px` 随机），随机分布在视口中
- `opacity` 在 `0.1-0.6` 之间随机，产生远近不同的星光感
- 用 CSS `@keyframes` 给约 `30%` 的圆点添加 `animation: twinkle 3-8s infinite alternate`（`opacity` 在 `0.2-1` 之间循环，模拟星光闪烁）
- 这一层是整个背景的最基础质感，非常克制

第三层：星云云团效果（三个大 radial-gradient，互相叠加）
- 云团 A：圆心在视口左上方偏外 `(-100px, 100px)`，半径约 `600px`
  - 颜色：从 `rgba(124, 92, 245, 0.18)` 到 `transparent`
  - 这是 Nebula 紫的主星云
- 云团 B：圆心在视口右下方 `(110%, 80%)`，半径约 `500px`
  - 颜色：从 `rgba(0, 212, 200, 0.12)` 到 `transparent`
  - 这是 Aurora 青的次星云
- 云团 C：圆心在视口中央偏下 `(50%, 70%)`，半径约 `400px`
  - 颜色：从 `rgba(124, 92, 245, 0.06)` 到 `transparent`
  - 这是中心场的微弱紫光，让整个画面有轻微的场强梯度感
- 三个云团通过 `mix-blend-mode: screen` 叠加，颜色不会互相污染

第四层：前景大圆弧装饰
- 一个 SVG 绘制的大圆弧（不是整圆，约 `270deg`），半径约 `400px`，放在英雄区右侧
- 线条 stroke 颜色：Aurora 青绿 `#00D4C8`，`stroke-width: 1px`，`stroke-dasharray: 4 8`（点划线样式，模拟轨道线）
- `opacity: 0.15`，极度克制
- 圆弧上有三个实心小圆点（半径 `4px`），分别位于圆弧的不同位置，颜色不同（一个 Nebula 紫、一个 Aurora 青、一个 Flare 橙），模拟轨道上的三颗星球
- 这个装饰元素在页面加载时有一个缓慢的旋转动画，`animation: rotate 120s linear infinite`，`transform-origin: 圆心`

**英雄区文字内容（从上到下）：**

Kicker 标签组（两个，并排）：
- 第一个：背景透明，`border: 1px solid rgba(124, 92, 245, 0.4)`，文字 `rgba(232,244,255,0.7)`，内容 `LOCAL-FIRST ENGINE`
- 第二个：背景 `rgba(0, 212, 200, 0.1)`，`border: 1px solid rgba(0, 212, 200, 0.3)`，文字 Aurora 青绿 `#00D4C8`，内容 `V2.8 RELEASE`
- 两个标签之间间距 `8px`
- 字体：General Sans 700，`11px`，全大写，字距 `0.12em`，圆角 `100px`，内边距 `5px 12px`

主标题（Cabinet Grotesk 900，渐变色填充，三行）：
- 行一：`Stories` — 字号 `clamp(80px, 10vw, 130px)`，渐变色（从紫到青到白）
- 行二：`that stay.` — 字号 `clamp(80px, 10vw, 130px)`，同渐变但偏移 `50%`（让渐变在两行间连续流动）
- 行三：`Companions grow.` — 字号 `clamp(40px, 5vw, 68px)`，颜色 `rgba(232,244,255,0.45)`（弱化，退为副标题）
- 行一和行二之间距离 `0`（让他们紧贴，`line-height: 0.92`）
- 行二和行三之间距离 `24px`

副标题描述文字：
- 字体：General Sans 400，字号 `17px`，行高 `1.75`，颜色 `#5A7A9B`，最大宽度 `640px`，水平居中
- 内容：**「将深度记忆引擎与本地无损资产归档融为一体。AI 伴侣在设备本地生长，记住你告诉她的每一件事，保护你不愿公开的每一段故事。」**

按钮组（水平居中，两个按钮）：
- 主按钮「开始探索」：Cabinet Grotesk 900，背景 Nebula 紫 `#7C5CF5` → Aurora 青 `#00D4C8` 渐变（`linear-gradient(135deg, #7C5CF5, #00D4C8)`），颜色 `#050A12`（深色），高 `56px`，宽 `200px`，圆角 `100px`，常驻辉光 `box-shadow: 0 0 30px rgba(124,92,245,0.5)`
  - Hover：`transform: translateY(-4px) scale(1.04)`，辉光加强，渐变方向从 `135deg` 变为 `160deg`（旋转感），`transition: transform 350ms, box-shadow 350ms`
- 次按钮「阅读文档」（此处为文字链接形式，强调品牌一致性）：
  - General Sans 600，`15px`，颜色 `#7C5CF5`（Nebula 紫）
  - 左侧有一个极小的书本/文档图标（`14px` SVG，同色）
  - 下方有一条 `1px` 紫色下划线，从左向右 animate-in
  - Hover：文字颜色变为 Aurora 青绿 `#00D4C8`，图标随文字变色，下划线颜色同步变化，动画 `200ms ease`

---

## 六、区域三：功能特写双栏（Feature Showcase）

**布局**：两行，每行左右各占 50%  
**区域背景**：Cloud 色 `#0D1829`，有一条极细的顶部边线 `rgba(124, 92, 245, 0.1)`  
**上下内边距**：`120px 80px`

功能卡片样式（毛玻璃②规格，见上方定义）：
- 每个卡片约 `560px × 280px`
- 内部上方：线框风格图标，`32px`，颜色 Aurora 青绿，stroke 1.5px
- 图标右侧：Flare 橙色 `#FF8C42` 序号标签（`01`、`02`、`03`、`04`），Instrument Serif Italic，`18px`
- 功能标题：General Sans 700，`24px`，颜色 `#E8F4FF`
- 功能描述：General Sans 400，`15px`，颜色 `#5A7A9B`，行高 `1.7`

卡片悬浮交互：
- **Hover**：
  - 卡片整体 `transform: translateY(-6px) rotateX(2deg) rotateY(-1deg)`（极微小的 3D 倾斜，需要父元素设置 `perspective: 1000px`，产生立体空间感）
  - 边框颜色变为 Aurora 青绿 `rgba(0,212,200,0.35)`
  - 卡片内图标出现旋转动画 `animation: iconPulse 0.8s ease-in-out`（轻微缩放后回弹）
  - `transition: transform 400ms cubic-bezier(0.16,1,0.3,1), border-color 300ms, box-shadow 300ms`
- **Card 顶部彩色线条**：每张卡片顶部有一条 `2px` 实线，颜色各不同（紫、青绿、橙、白），默认 `width: 0`，hover 时从左向右扩展到 100%，动画 `350ms ease-out`

**四个功能模块文字内容：**

卡片1 — 「长程记忆」：「多层记忆层级系统，自动区分核心记忆与日常记录。角色的日记、梦境与内心独白在离线时自然生长，每次对话结束后静默整合。」

卡片2 — 「物理隔离」：「SQLite 本地库 + SecureStore API 密钥保险箱。Personal 隐私空间独立加密，双重屏障确保即便设备落入他人之手，内容也无法读取。」

卡片3 — 「原生资产」：「原始图片、视频、文档以原格式永久归档，绝不压缩、绝不裁剪。完整的 IP 素材与角色资产体系，为 AI 上下文提供最高保真的物质基础。」

卡片4 — 「故事分支」：「平行世界与时间线穿梭。每一个关键抉择都生成独立分支，历史版本完整保留，随时可以回到那个路口，选择另一种走向。」

---

## 七、区域四：「阅读文档」专属星图窗口（CTA Section）

> 🎯 这是阅读文档入口的最强视觉呈现，使用毛玻璃③规格，独占一个横幅区域。

**整体样式：**
- 布局：横幅，内容水平居中
- 背景：使用毛玻璃③（Nebula 紫底色 12% + blur 12px）
- 外边框：`1px solid rgba(124, 92, 245, 0.3)`，圆角 `24px`
- 外层辉光：`box-shadow: 0 0 80px rgba(124, 92, 245, 0.15), 0 0 160px rgba(124, 92, 245, 0.08)`（两层，内外兼有，让这个区块从页面背景中「浮起来」）
- 上下间距：和上一区域之间 `80px`，内部内边距 `80px 120px`

**横幅内部：（左右布局，左文字右按钮）**

左侧文字：
- 大标题：Cabinet Grotesk 900，`56px`，渐变色（Nebula 紫→Aurora 青），内容：`PIXORY DOCS`
- 副标题：General Sans 400，`17px`，颜色 `#5A7A9B`，最大宽度 `520px`，行高 `1.65`
  - 内容：「完整的功能手册、角色卡配置指南、记忆系统说明、BYOK 设置教程与常见问题。读懂 Pixory 的每一层设计，在最短时间内找到你需要的答案。」
- 标题与副标题之间有一个小装饰：三颗不同颜色的小圆点（紫、青、橙，直径 `6px`），水平排列，间距 `6px`，在副标题上方 `16px` 处

右侧按钮（纵向排列两个）：
- 主按钮「立即阅读文档」：
  - 背景：Nebula 紫 `#7C5CF5`，颜色 `#E8F4FF`，General Sans 700，字号 `15px`
  - 尺寸：高 `56px`，宽 `220px`，圆角 `100px`
  - 常驻辉光：`box-shadow: 0 0 24px rgba(124,92,245,0.5), 0 4px 16px rgba(124,92,245,0.3)`
  - Hover：辉光增强，`transform: translateY(-3px) scale(1.04)`，背景色加亮 `10%`，动画 `350ms`
  - 内部左侧有一个书本图标（SVG，白色，16px）
  - 按钮内文字和图标之间间距 `8px`
- 次链接「查看更新日志 →」：
  - 纯文字，颜色 Aurora 青绿 `#00D4C8`，General Sans 600，`13px`
  - 顶部间距 `16px`，居中对齐
  - Hover：颜色变为 `#E8F4FF`，文字右移 `4px`（配合箭头方向）

---

## 八、区域五：技术规格横条（Specs Bar）

**背景**：`#050A12`，顶部 `1px solid rgba(124,92,245,0.1)`  
**内边距**：`80px`  
**布局**：四列等宽，`flexbox justify-content: space-between`

每组规格项（从上到下）：
- 数字：Cabinet Grotesk 900，`52px`，Aurora 青绿 `#00D4C8`（用最亮的辅色展示数据）
- 标签：General Sans 700，`11px`，全大写，字距 `0.15em`，颜色 `rgba(232,244,255,0.35)`，顶部间距 `8px`
- 竖分隔线：`0.5px solid rgba(232,244,255,0.06)`，高度 `60px`，垂直居中

数据内容：`100% LOCAL`、`BYOK Ready`、`SQLite Native`、`∞ Branches`

hover 交互：每组整体 hover 时，数字颜色从 Aurora 青 变为 Nebula 紫，过渡 `300ms`，文字标签颜色同时从 `0.35` 变为 `0.6` 不透明度。

---

## 九、区域六：用户引语（Testimonial）

**布局**：居中，最大宽度 `800px`  
**背景**：透明，与页面背景无缝融合  
**上下内边距**：`120px`

中央一段 Instrument Serif Italic，`32px`，颜色 `#E8F4FF`，行高 `1.5`：
> *「我第一次感觉到，AI 不是在消费我，而是在陪我活着。记忆没有被卖掉，故事还在这里。」*

引语上方有三颗 `Aurora 青` 小星号 `✦ ✦ ✦`，下方是署名 General Sans 400，`14px`，`#5A7A9B`。

---

## 十、区域七：页脚

**背景**：`#050A12`，顶部边线 `rgba(124, 92, 245, 0.08)`  
**内边距**：`60px 80px`

左侧 Logo 区：
- 大 Logo：Cabinet Grotesk 900，`18px`，`#E8F4FF`，旁边 `V2.8` badge
- Slogan（Instrument Serif Italic，`16px`，Aurora 青绿）：*「Stories that stay. Companions that grow.」*

中间链接列：
- 「阅读文档」：Nebula 紫 `#7C5CF5`，General Sans 600，`13px`（在灰色链接海中一眼看到）
- 其他链接：`rgba(232,244,255,0.4)`，hover 变白

右侧：版权文字 `rgba(232,244,255,0.2)`，`12px`

---

## 十一、全局动效规格

**页面加载序列（Timeline，0ms 起）：**
- `0ms`：背景星场和云团元素显现（`opacity: 0 → 0.6`，`duration: 1200ms`）
- `200ms`：导航条从顶部落下（`translateY(-100%) → translateY(0)`，`duration: 600ms ease-out`）
- `600ms`：英雄区 Kicker 标签 `opacity: 0, translateY(20px) → 0, 0`，`duration: 800ms`
- `800ms`：主标题行一掉落入场（`translateY(100%) → 0`，`overflow: hidden` 遮罩，`duration: 1000ms cubic-bezier(0.16,1,0.3,1)`）
- `950ms`：主标题行二，同上，`duration: 1000ms`
- `1100ms`：副描述文字 `opacity: 0 → 1`，`translateY(20px) → 0`
- `1250ms`：按钮组 `opacity: 0 → 1`，`translateY(16px) → 0`
- `1400ms`：大圆弧装饰 SVG `stroke-dashoffset` 动画（从不可见到描绘完成，`duration: 2000ms ease-in-out`）

**滚动入场：**
- 所有非英雄区元素：`IntersectionObserver`，`threshold: 0.15`，触发时 `opacity: 0, translateY(24px) → 1, 0`，`duration: 700ms cubic-bezier(0.16,1,0.3,1)`，同区块内 `stagger: 80ms`

**持续动画（不依赖交互，始终运行）：**
- 大圆弧轨道：`rotate 120s linear infinite`
- 星光闪烁：随机 `3-8s` 的 `opacity` 循环动画，约 50-60 颗星
- 导航条「阅读文档」按钮辉光：`box-shadow` 从 `0 0 20px rgba(124,92,245,0.4)` 脉冲到 `0 0 32px rgba(124,92,245,0.65)`，`animation: glowPulse 3s ease-in-out infinite`

**鼠标追踪（仅桌面端）：**
- 英雄区的背景星云云团，跟随鼠标以 `0.02x` 的倍率缓慢移动（`mousemove` 监听，`lerp` 插值使动作平滑），产生微弱的视差感，让整个宇宙背景「活」起来

---

## 十二、响应式断点

- **1440px+**：完整布局
- **1200px-1440px**：功能卡片行距缩小，英雄字号下限 `80px`
- **768px-1200px**：功能四卡片变为 2x2，左右分栏全部变上下堆叠，Docs CTA 变单列
- **< 768px（移动端）**：
  - 英雄区字号 `clamp(52px, 14vw, 72px)`
  - 三层背景星云效果保留（移动端帧率友好，仅 CSS 渐变，无 JS）
  - 导航条「阅读文档」按钮：移动端单独成行，全宽显示在导航条下方（高度 `44px`），颜色保持 Nebula 紫，是整个移动端最显眼的 UI 元素
  - 功能卡片变单列，3D 倾斜效果在 touch 设备上禁用（改为简单的 scale 缩放反馈）
  - 用户引语字号缩小到 `22px`
