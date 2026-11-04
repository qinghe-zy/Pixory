# Document Sandbox Architecture

本目录承载所有文档格式驱动与底层手术修补能力：

## 目录分层与依赖规则

1. **`diff/` (纯算法差异修补)**:
   - 零宿主依赖（Zero-Host-Dependency）。
   - 包含 `fuzzyPatcher.ts`（IndexPreservingFuzzyPatcher），基于 `normToRaw: Int32Array` 实现安全区间逆向映射与逆序修补。

2. **`drivers/` (驱动协议与适配器)**:
   - 定义统一的 `IDocumentDriver` 端口。
   - `markdownDriver.ts`、`docxDriver.ts`、`pdfDriver.ts` 分别实现该协议。

3. **`docx/` (Word OOXML 手术引擎)**:
   - 游标扫描、跨 Run 虚拟文本投影、修订留痕（Track Changes）、表格网格守恒。

4. **`pdf/` (PDF 驱动与沙箱)**:
   - 基于 Headless WebView 沙箱与 看门狗（Watchdog）机制。
   - 原件 100% 只读，派生全新 PDF。
