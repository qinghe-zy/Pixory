const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * 共享 TypeScript 模块加载器 (支持内存转译与多级 Mock)
 * @param {string} targetPath - 待加载的目标文件绝对或相对路径
 * @param {Record<string, any>} mocks - 依赖模块 Mock 映射表
 * @param {Object} options - 转译与加载选项
 * @returns {any} 模块的 exports 对象
 */
function loadTsModule(targetPath, mocks = {}, options = {}) {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(process.cwd(), targetPath);

  if (!fs.existsSync(fullPath)) {
    // 尝试补全扩展名
    const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx', '.js', '.jsx'];
    let foundPath = null;
    for (const ext of extensions) {
      if (fs.existsSync(fullPath + ext)) {
        foundPath = fullPath + ext;
        break;
      }
    }
    if (!foundPath) {
      throw new Error(`[loadTsModule] File not found: ${fullPath}`);
    }
    return loadTsModule(foundPath, mocks, options);
  }

  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  }).outputText;

  const effectiveMocks = {
    'expo/fetch': { fetch: globalThis.fetch },
    'expo-sqlite': {
      openDatabaseAsync: async () => ({
        execAsync: async () => {},
        runAsync: async () => {},
        getAllAsync: async () => [],
        getFirstAsync: async () => null,
      }),
    },
    ...mocks,
  };

  const m = { exports: {} };
  const customRequire = (id) => {
    if (effectiveMocks[id]) return effectiveMocks[id];

    // 处理内部相对路径引用
    if (id.startsWith('.')) {
      const candidate = path.resolve(path.dirname(fullPath), id);
      const candidates = [
        candidate,
        candidate + '.ts',
        candidate + '.tsx',
        path.join(candidate, 'index.ts'),
        path.join(candidate, 'index.tsx'),
        candidate + '.js',
      ];
      for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          return loadTsModule(c, mocks, options);
        }
      }
    }

    try {
      return require(id);
    } catch (e) {
      // 容错: 部分 ESM 优先包 (如 @noble/hashes) 子路径在 CJS 下要求显式 .js 后缀
      if (!id.endsWith('.js') && !id.startsWith('.')) {
        try {
          return require(id + '.js');
        } catch {}
      }
      if (mocks['*']) {
        return mocks['*'](id);
      }
      throw new Error(`[loadTsModule] Failed to resolve require("${id}") from ${fullPath}: ${e.message}`);
    }
  };

  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', transpiled);
  fn(m, m.exports, customRequire, fullPath, path.dirname(fullPath));
  return m.exports;
}

module.exports = {
  loadTsModule,
};
