const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

test('safeShareFileAsync 契约与防闪退行为审计', async () => {
  const serviceCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/export/exportDocumentService.ts'),
    'utf8'
  );

  // 1. 探针前置防线：在加载 expo-sharing 之前必须存在 requireOptionalNativeModule 或 globalThis.expo.modules 探针预检
  const fnBody = serviceCode.slice(serviceCode.indexOf('export async function safeShareFileAsync'));
  const codeWithoutComments = fnBody.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  const nativeModuleCheckIndex = codeWithoutComments.indexOf("requireOptionalNativeModule('ExpoSharing')");
  const importSharingIndex = codeWithoutComments.indexOf("import('expo-sharing')");

  assert.ok(nativeModuleCheckIndex !== -1, "必须具备 requireOptionalNativeModule('ExpoSharing') 探针");
  assert.ok(importSharingIndex !== -1, "必须具备动态 import('expo-sharing')");
  assert.ok(
    nativeModuleCheckIndex < importSharingIndex,
    '原生模块预检探针必须严格执行在 import(\'expo-sharing\') 之前，杜绝 Metro 顶层抛出致命异常'
  );

  // 2. 预检未命中时必须直接返回 false，绝不尝试动态加载
  assert.ok(serviceCode.includes('if (!hasNativeModule)'), '未命中原生模块时必须直接短路返回 false');

  // 3. 跨应用文档实体分享：必须支持 mimeType、dialogTitle 等选项传递
  assert.ok(serviceCode.includes('await Sharing.shareAsync(fileUri, options)'), '必须透传 options 参数至 shareAsync');
});

test('DocumentExportTarget 在缺失原生分享时平滑降级至系统正文分享', () => {
  const documentExportCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/utils/documentExport.ts'),
    'utf8'
  );

  // 1. 验证短路逻辑：safeShareFileAsync 返回 true 时即刻 return
  assert.ok(documentExportCode.includes('if (shared) {\n      return;\n    }'), '成功调用系统分享后立即结束，不重复弹框');

  // 2. 降级逻辑：未安装底包模块时平滑进入兜底文本分享，保证正文不丢失
  assert.ok(documentExportCode.includes('Share.share({ title, message: fullMessage, url: tempPath })'), '降级时调用 React Native Share.share 并透传完整正文');
});
