const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * 递归收集指定目录下的所有 TS/TSX 文件
 */
function collectTsFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 检查代码文本与 AST 是否包含“空架子/占位/未实现”模式
 * @param {string} filePath - 文件名用于报错提示
 * @param {string} sourceCode - 源码文本
 * @returns {string[]} 违规原因列表
 */
function detectStubPatterns(filePath, sourceCode) {
  const violations = [];
  const sf = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);

  // 1. 扫描所有真实注释中的 TODO / FIXME / unimplemented / placeholder
  // 使用 TypeScript Scanner 精准提取注释 Token，避免误伤正则字面量或字符串常量
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, sourceCode);
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const commentText = scanner.getTokenText();
      const match = commentText.match(/\b(TODO|FIXME|unimplemented|not\s+implemented|placeholder)\b/i);
      if (match) {
        // 如果是单测中显式写明说明或防御机制，可按规则判断；但在产品代码中一律禁止残留
        const pos = scanner.getTokenPos();
        const { line } = sf.getLineAndCharacterOfPosition(pos);
        violations.push(`[Line ${line + 1}] 注释包含未完成占位关键字: "${commentText.trim().slice(0, 80)}"`);
      }
    }
    token = scanner.scan();
  }

  // 2. AST 检查：检查空函数体或恒抛出 unimplemented 的假实现
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      if (node.body) {
        if (ts.isBlock(node.body)) {
          const statements = node.body.statements;
          // 空函数体拦截 (除了纯 interface/type 或故意允许的空钩子，但纯模块不应存在空方法)
          if (statements.length === 0) {
            const name = node.name ? node.name.getText(sf) : 'anonymous';
            violations.push(`[AST] 发现空函数体: ${name} (line ${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1})`);
          } else if (statements.length === 1) {
            const stmt = statements[0];
            // 拦截 throw new Error("unimplemented")
            if (ts.isThrowStatement(stmt) && stmt.expression) {
              const exprText = stmt.expression.getText(sf).toLowerCase();
              if (exprText.includes('unimplemented') || exprText.includes('not implemented') || exprText.includes('todo')) {
                violations.push(`[AST] 发现抛出未实现异常的假函数: ${exprText}`);
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return violations;
}

test('G1 门禁自检: detectStubPatterns 必须能够精准识别空函数、未实现异常与 TODO 占位', () => {
  const badCode1 = `
    export function calculateBudget(text: string) {
      // TODO: implement token calculation
      return 0;
    }
  `;
  const violations1 = detectStubPatterns('test1.ts', badCode1);
  assert.ok(violations1.length >= 1, '应检出 TODO 关键字');

  const badCode2 = `
    export class FakeDriver {
      applyPatch() {
        throw new Error('Not implemented yet');
      }
    }
  `;
  const violations2 = detectStubPatterns('test2.ts', badCode2);
  assert.ok(violations2.length >= 1, '应检出 Not implemented 桩函数');

  const badCode3 = `
    export const emptyHandler = () => {};
  `;
  const violations3 = detectStubPatterns('test3.ts', badCode3);
  assert.ok(violations3.length >= 1, '应检出空函数体');

  const goodCode = `
    export function add(a: number, b: number): number {
      return a + b;
    }
  `;
  const violationsGood = detectStubPatterns('good.ts', goodCode);
  assert.strictEqual(violationsGood.length, 0, '正常实现不应报任何违规');
});

test('G1 无占位门禁: 检查 src/services/agent 与 src/services/sandbox 下的所有文件', () => {
  const targetDirs = [
    path.resolve(process.cwd(), 'src/services/agent'),
    path.resolve(process.cwd(), 'src/services/sandbox'),
  ];

  let totalFiles = 0;
  const allViolations = [];

  for (const dir of targetDirs) {
    const files = collectTsFiles(dir);
    totalFiles += files.length;
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      const issues = detectStubPatterns(file, code);
      if (issues.length > 0) {
        allViolations.push({ file: path.relative(process.cwd(), file), issues });
      }
    }
  }

  if (allViolations.length > 0) {
    const report = allViolations
      .map((v) => `文件 ${v.file}:\n  - ${v.issues.join('\n  - ')}`)
      .join('\n\n');
    assert.fail(`[G1 门禁未通过] 发现以下文件存在空实现或占位代码:\n${report}`);
  }

  assert.ok(true, `已检查 ${totalFiles} 个文件，全部符合无占位铁律规范`);
});
