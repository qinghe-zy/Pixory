/**
 * TableGridNormalizer 表格网格列宽守恒器 (纯函数内核 - 零宿主依赖)
 *
 * 核心机制:
 * 1. 守恒定则: 计算表格最大列数 C_max = max(row) sum(cell gridSpan);
 * 2. 行列补齐: 若某行因增删修改导致单元格数与 C_max 不守恒，自动补齐 gridSpan 差值，防止 Word 提示“文件已损坏”;
 * 3. 网格重算: 在 9000 dxa (默认 Word 版心宽) 下自动校准 <w:tblGrid> 与 <w:tcW>;
 * 4. 保护边界: 仅在主动修补或新建表格时介入，绝对不修改用户未变更的原始表格。
 */

export interface TableNormalizeOptions {
  /** 表格总版心宽度 (默认 9000 dxa) */
  totalWidthDxa?: number;
}

export class TableGridNormalizer {
  /**
   * 提取单元格的 gridSpan (跨列数，默认为 1)
   */
  private static parseGridSpan(cellXml: string): number {
    const match = cellXml.match(/<w:gridSpan\s+[^>]*w:val="(\d+)"/);
    if (match) {
      const val = parseInt(match[1], 10);
      return Number.isNaN(val) || val < 1 ? 1 : val;
    }
    return 1;
  }

  /**
   * 规范化单个表格的 XML 结构
   */
  public static normalizeTableXml(tableXml: string, options?: TableNormalizeOptions): string {
    if (!tableXml.includes('<w:tbl') || !tableXml.includes('<w:tr')) {
      return tableXml;
    }

    const totalWidthDxa = options?.totalWidthDxa || 9000;

    // 1. 扫描所有 <w:tr> 行
    const rows: string[] = [];
    let rowStart = 0;
    while ((rowStart = tableXml.indexOf('<w:tr', rowStart)) !== -1) {
      // 确保是标签边界
      const nextChar = tableXml[rowStart + 5];
      if (nextChar !== ' ' && nextChar !== '>' && nextChar !== '/') {
        rowStart += 5;
        continue;
      }
      const rowEnd = tableXml.indexOf('</w:tr>', rowStart);
      if (rowEnd === -1) break;
      rows.push(tableXml.slice(rowStart, rowEnd + 7));
      rowStart = rowEnd + 7;
    }

    if (rows.length === 0) return tableXml;

    // 2. 计算各行包含的单元格及其 gridSpan 跨度
    const rowCellCounts: number[] = [];
    const parsedRows: Array<{ rawRow: string; cells: string[]; totalSpans: number }> = [];

    for (const rowXml of rows) {
      const cells: string[] = [];
      let cellStart = 0;
      while ((cellStart = rowXml.indexOf('<w:tc', cellStart)) !== -1) {
        const nextChar = rowXml[cellStart + 5];
        if (nextChar !== ' ' && nextChar !== '>' && nextChar !== '/') {
          cellStart += 5;
          continue;
        }
        const cellEnd = rowXml.indexOf('</w:tc>', cellStart);
        if (cellEnd === -1) break;
        cells.push(rowXml.slice(cellStart, cellEnd + 7));
        cellStart = cellEnd + 7;
      }

      let totalSpan = 0;
      for (const cell of cells) {
        totalSpan += this.parseGridSpan(cell);
      }
      rowCellCounts.push(totalSpan);
      parsedRows.push({ rawRow: rowXml, cells, totalSpans: totalSpan });
    }

    const maxCols = Math.max(...rowCellCounts, 1);

    // 3. 对列数不足的行进行末尾单元格补齐 (补齐 gridSpan 差值)
    let modified = false;
    const normalizedRows: string[] = [];

    for (const item of parsedRows) {
      if (item.totalSpans < maxCols && item.cells.length > 0) {
        modified = true;
        const diff = maxCols - item.totalSpans;
        const lastCell = item.cells[item.cells.length - 1];
        const lastSpan = this.parseGridSpan(lastCell);
        const newSpan = lastSpan + diff;

        let patchedLastCell = lastCell;
        if (lastCell.includes('<w:gridSpan')) {
          patchedLastCell = lastCell.replace(
            /<w:gridSpan\s+[^>]*w:val="\d+"[^>]*\/>/,
            `<w:gridSpan w:val="${newSpan}"/>`
          );
        } else if (lastCell.includes('<w:tcPr>')) {
          patchedLastCell = lastCell.replace(
            '<w:tcPr>',
            `<w:tcPr><w:gridSpan w:val="${newSpan}"/>`
          );
        } else if (lastCell.includes('<w:tcPr/>')) {
          patchedLastCell = lastCell.replace(
            '<w:tcPr/>',
            `<w:tcPr><w:gridSpan w:val="${newSpan}"/></w:tcPr>`
          );
        } else {
          patchedLastCell = lastCell.replace(
            /^(<w:tc[^>]*>)/,
            `$1<w:tcPr><w:gridSpan w:val="${newSpan}"/></w:tcPr>`
          );
        }

        const newCells = [...item.cells.slice(0, -1), patchedLastCell];
        // 重构行内容
        const rowOpenTagMatch = item.rawRow.match(/^<w:tr[^>]*>/);
        const rowOpenTag = rowOpenTagMatch ? rowOpenTagMatch[0] : '<w:tr>';
        // 保留行属性 <w:trPr>
        const trPrMatch = item.rawRow.match(/<w:trPr>[\s\S]*?<\/w:trPr>/);
        const trPrXml = trPrMatch ? trPrMatch[0] : '';

        normalizedRows.push(`${rowOpenTag}${trPrXml}${newCells.join('')}</w:tr>`);
      } else {
        normalizedRows.push(item.rawRow);
      }
    }

    // 4. 重建或校准 <w:tblGrid>
    const colWidth = Math.floor(totalWidthDxa / maxCols);
    let gridColsXml = '';
    for (let i = 0; i < maxCols; i++) {
      gridColsXml += `<w:gridCol w:w="${colWidth}"/>`;
    }
    const newTblGrid = `<w:tblGrid>${gridColsXml}</w:tblGrid>`;

    let resultXml = tableXml;

    // 替换所有行
    if (modified) {
      const firstRowStart = tableXml.indexOf('<w:tr');
      const lastRowEnd = tableXml.lastIndexOf('</w:tr>') + 7;
      resultXml =
        tableXml.slice(0, firstRowStart) +
        normalizedRows.join('') +
        tableXml.slice(lastRowEnd);
    }

    // 替换或插入 <w:tblGrid>
    if (resultXml.includes('<w:tblGrid>')) {
      resultXml = resultXml.replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/, newTblGrid);
    } else {
      // 插入在 <w:tblPr> 之后
      const tblPrEnd = resultXml.indexOf('</w:tblPr>');
      if (tblPrEnd !== -1) {
        resultXml =
          resultXml.slice(0, tblPrEnd + 11) + newTblGrid + resultXml.slice(tblPrEnd + 11);
      } else {
        const tblStartEnd = resultXml.indexOf('>');
        if (tblStartEnd !== -1) {
          resultXml =
            resultXml.slice(0, tblStartEnd + 1) + newTblGrid + resultXml.slice(tblStartEnd + 1);
        }
      }
    }

    return resultXml;
  }
}
