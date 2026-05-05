# Pixory Personal System：UI 统一重构交接文档

**文档目的**：本交接文档旨在明确说明 Pixory 隐私系统（Personal System）下一阶段的 UI 层重构方案。确保开发团队在“保留底层双数据库极高安全性”的前提下，彻底消除目前的“双端割裂感”，实现**“一套引擎，两套账本；共用界面，无痕切换”**的最终产品形态。

---

## 1. 核心共识与重构边界（防歧义说明）

*   **绝对不改的（后端逻辑）**：
    *   **不改**底层的双数据库物理隔离架构 (`pixory.sqlite` vs `pixory_personal.sqlite`)。
    *   **不改**文件系统的隔离 (`originals/` 与 `pixory_personal/originals/`)。
    *   **不改**资源导入的底层校验、加密打包(`.pixorypack`)等核心服务链。
*   **必须要改的（前端展现）**：
    *   **删除**目前庞杂且突兀的专属控制台页面 `PersonalSystemScreen.tsx`。
    *   **改造**所有的原生展示页（如首页图库、全局搜索、标签、回收站等），使它们支持“动态切换数据源”。

---

## 2. 界面到底改成什么样？（交互蓝图）

重构后的体验，应完全等同于浏览器的**“开启无痕模式”**。

### 2.1 进入隐私模式的路径
*   **操作**：用户在“我的 (`MeScreen`)” 页面点击“隐私系统”。
*   **反馈**：不再跳转到一个全新的面板。而是弹出一个极简的**密码验证弹窗**。
*   **结果**：密码验证通过后，App **原地切回“首页（HomeLibraryScreen）”**。但此时，首页里显示的已全部是私密图片，且用户可以自由在底部导航栏切换“搜索”、“分类”、“回收站”，看到的全是私密数据。

### 2.2 视觉暗号（极其关键）
既然共用了一套 UI，必须防止用户出现“空间错乱”（不知道自己现在是在外面还是在保险箱里）。
*   **UI 变动**：一旦处于隐私模式，**全局的顶部导航栏（或 Header 背景色）必须呈现出强烈的视觉区分**（例如：原本是白色，现在变成深空灰或带有暗金色的强调色）。
*   **锁定按钮**：界面的显眼位置（如右上角）必须常驻一个**“🔑 已解锁 (点击上锁)”** 的按钮，给予用户随时一键退出的安全感。

### 2.3 操作等权化
*   原本挤在 `PersonalSystemScreen` 里的“导入”、“查重”、“快速整理”功能，直接复用首页右上角的 `+` 号以及相关的通用入口。**用户在普通模式下怎么导入、怎么整理，在隐私模式下就怎么做，0 学习成本。**

---

## 3. 开发落地指引（Technical Spec）

为确保交接无歧义，开发人员应按以下步骤实施代码改造：

### Step 1: 建立全局空间状态 (Global Space State)
*   引入一个全局响应式状态（例如 Zustand Store 或 React Context）：
    ```typescript
    type ActiveSpace = 'normal' | 'personal';
    // 默认启动时必须为 normal
    const currentSpace: ActiveSpace = 'normal'; 
    ```

### Step 2: 改造所有数据承载页面
*   涉及文件：`HomeLibraryScreen.tsx`, `GlobalSearchScreen.tsx`, `FavoritesScreen.tsx`, `TrashScreen.tsx`, `TagsScreen.tsx` 等。
*   **改动点**：将原本代码中硬编码的：
    ```typescript
    runWithDatabaseSpace('normal', ...)
    ```
    全部替换为动态读取全局状态：
    ```typescript
    runWithDatabaseSpace(currentSpace, ...)
    ```

### Step 3: 重构退出与后台保护机制 (App.tsx)
*   一旦用户点击“退出隐私模式”，或者 App 触发了现有的 `AppState` 退到后台事件：
    1.  强制将全局状态 `currentSpace` 设为 `'normal'`。
    2.  触发全局事件总线或状态库刷新，确保所有挂载的 React 组件瞬间清空现有的私密缓存数据。

### Step 4: 备份与导出的兼容
*   原本挂载在隐私控制台的“导出加密包”功能，整合进通用的 `BackupScreen.tsx` 中。
*   逻辑判定：如果进入备份页时 `currentSpace === 'personal'`，则显示加密打包（导出 `.pixorypack`）的 UI 选项；如果是 `'normal'`，则只显示普通备份选项。

---

## 4. 最终交付标准
1. **彻底消失的页面**：不再存在 `PersonalSystemScreen` 这个聚合了大量操作的异形页面。
2. **丝滑的沉浸感**：在隐私模式下浏览图片、长按多选、打标签的操作手感，与普通模式 100% 相同。
3. **安全底线不退让**：切出 App 再切回，必须瞬间回到 `normal` 状态的首页，绝不能在后台多任务卡片中闪过任何一张私密图片。
