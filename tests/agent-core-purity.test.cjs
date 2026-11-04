const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * 违规副作用/宿主库黑名单
 */
const FORBIDDEN_MODULE_PATTERNS = [
  /^expo(-|\/|$)/,
  /^react-native(-|\/|$)/,
  /^@react-native/,
  /database(\/|$)/,
  /zustand/,
  /async-storage/,
];

/**
 * 递归收集指定目录下的所有 TS 文件
 */
function collectTsFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 提取源码中所有的 import / export from / require 模块标识符
 */
function extractImportSpecifiers(sourceCode, fileName = 'pure.ts') {
  const sf = ts.createSourceFile(fileName, sourceCode, ts.ScriptTarget.Latest, true);
  const specifiers = [];

  function visit(node) {
    // 1. import ... from '...'
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      // 如果仅是 import type 则安全（TS 编译后会被剥除），但纯算法通常连类型也不应依赖宿主
      specifiers.push({
        module: node.moduleSpecifier.text,
        isTypeOnly: !!(node.importClause && node.importClause.isTypeOnly),
        pos: node.getStart(sf),
      });
    }
    // 2. export ... from '...'
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push({
        module: node.moduleSpecifier.text,
        isTypeOnly: !!node.isTypeOnly,
        pos: node.getStart(sf),
      });
    }
    // 3. require('...') 或 import('...')
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (
        (ts.isIdentifier(expr) && expr.text === 'require') ||
        expr.kind === ts.SyntaxKind.ImportKeyword
      ) {
        if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
          specifiers.push({
            module: node.arguments[0].text,
            isTypeOnly: false,
            pos: node.getStart(sf),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return specifiers;
}

/**
 * 检查模块标识符是否违规
 */
function checkPurity(sourceCode, fileName = 'test.ts') {
  const specifiers = extractImportSpecifiers(sourceCode, fileName);
  const violations = [];

  for (const item of specifiers) {
    for (const pattern of FORBIDDEN_MODULE_PATTERNS) {
      if (pattern.test(item.module)) {
        violations.push(`违规导入宿主/副作用模块: "${item.module}" (isTypeOnly: ${item.isTypeOnly})`);
      }
    }
  }

  return violations;
}

test('G2 门禁自检: checkPurity 必须能识别静态 import、动态 require 及相对路径穿透', () => {
  const badCode1 = `import * as FileSystem from 'expo-file-system'; export const a = 1;`;
  assert.ok(checkPurity(badCode1).length >= 1, '应拦截 expo-file-system');

  const badCode2 = `const sqlite = require('expo-sqlite');`;
  assert.ok(checkPurity(badCode2).length >= 1, '应拦截 require expo-sqlite');

  const badCode3 = `import { initDatabase } from '../../../database/index';`;
  assert.ok(checkPurity(badCode3).length >= 1, '应拦截 database 依赖');

  const goodCode = `
    import { sha256 } from '@noble/hashes/sha2';
    export interface Hunk { target: string; }
    export function runDiff(a: string, b: string): number { return a.length - b.length; }
  `;
  assert.strictEqual(checkPurity(goodCode).length, 0, '纯算法代码不应报违规');
});

test('G2 纯度门禁: 检查纯内核目录下的所有算法文件，严禁任何宿主或副作用依赖', () => {
  const pureDirs = [
    path.resolve(process.cwd(), 'src/services/sandbox/diff'),
    path.resolve(process.cwd(), 'src/services/sandbox/drivers'),
    path.resolve(process.cwd(), 'src/services/sandbox/docx'),
    path.resolve(process.cwd(), 'src/services/sandbox/pdf'),
    path.resolve(process.cwd(), 'src/services/agent/kernel'),
    path.resolve(process.cwd(), 'src/services/agent/orchestrator'),
  ];
  const pureFiles = [
    path.resolve(process.cwd(), 'src/services/agent/tools/cjkFts5Engine.ts'),
  ];

  let totalFiles = 0;
  const allViolations = [];

  const filesToCheck = [...pureFiles];
  for (const dir of pureDirs) {
    filesToCheck.push(...collectTsFiles(dir));
  }

  for (const file of filesToCheck) {
    if (!fs.existsSync(file)) continue;
    totalFiles++;
    const code = fs.readFileSync(file, 'utf8');
    const issues = checkPurity(code, file);
    if (issues.length > 0) {
      allViolations.push({ file: path.relative(process.cwd(), file), issues });
    }
  }

  if (allViolations.length > 0) {
    const report = allViolations
      .map((v) => `文件 ${v.file}:\n  - ${v.issues.join('\n  - ')}`)
      .join('\n\n');
    assert.fail(`[G2 纯度门禁未通过] 纯算法内核检测到非法宿主依赖:\n${report}`);
  }

  assert.ok(true, `已检查 ${totalFiles} 个纯算法内核文件，全部符合零宿主依赖规范`);
});
