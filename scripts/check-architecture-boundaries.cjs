#!/usr/bin/env node

/**
 * 架构物理隔离边界检查守门脚本 (Architecture Boundary Guard)
 *
 * 检查规则：
 * 1. src/im 内部严禁直接引用 src/ai 中的任何私有业务文件。
 * 2. src/ai 内部严禁直接引用 src/im 中的任何私有业务文件。
 * 3. 双方仅允许依赖下沉的公共模块 (src/core, src/database, src/utils, etc.)。
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const IM_DIR = path.join(ROOT_DIR, 'src', 'im');
const AI_DIR = path.join(ROOT_DIR, 'src', 'ai');

function getFilesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getFilesRecursively(fullPath, fileList);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

let violations = [];

// 1. 检查 src/im -> src/ai 违规依赖
const imFiles = getFilesRecursively(IM_DIR);
for (const file of imFiles) {
  const content = fs.readFileSync(file, 'utf8');
  // 匹配 import ... from '...ai...' or require('...ai...')
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (
      /(from\s+['"][^'"]*\/ai\/[^'"]*['"])|(require\(['"][^'"]*\/ai\/[^'"]*['"]\))/.test(
        line
      )
    ) {
      violations.push({
        file: path.relative(ROOT_DIR, file),
        line: index + 1,
        code: line.trim(),
        reason: 'src/im 严禁直接依赖 src/ai 业务代码，必须通过 src/core 解耦！',
      });
    }
  });
}

// 2. 检查 src/ai -> src/im 违规依赖
const aiFiles = getFilesRecursively(AI_DIR);
for (const file of aiFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (
      /(from\s+['"][^'"]*\/im\/[^'"]*['"])|(require\(['"][^'"]*\/im\/[^'"]*['"]\))/.test(
        line
      )
    ) {
      violations.push({
        file: path.relative(ROOT_DIR, file),
        line: index + 1,
        code: line.trim(),
        reason: 'src/ai 严禁直接依赖 src/im，短长聊天必须保持完全物理隔离！',
      });
    }
  });
}

if (violations.length > 0) {
  console.error('\x1b[31m[架构隔离门禁检查失败] 发现物理隔离边界违规引用：\x1b[0m');
  violations.forEach((v) => {
    console.error(`- ${v.file}:${v.line} -> ${v.code}`);
    console.error(`  原因: ${v.reason}`);
  });
  process.exit(1);
} else {
  console.log(
    `\x1b[32m✔ [架构隔离门禁检查通过] src/im (${imFiles.length} files) 与 src/ai (${aiFiles.length} files) 保持 100% 物理隔离。\x1b[0m`
  );
  process.exit(0);
}
