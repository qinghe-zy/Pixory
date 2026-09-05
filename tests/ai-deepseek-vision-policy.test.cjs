const test = require('node:test');
const assert = require('node:assert/strict');

test('DeepSeek vision policy keeps text models separate from the official vision model', async () => {
  const policy = await import('../src/ai/deepseekVisionPolicy.ts');
  assert.equal(policy.isOfficialDeepSeekVisionModel('deepseek-v4-flash-vision-exp'), true);
  assert.equal(policy.isOfficialDeepSeekVisionModel('deepseek-v4-flash'), false);
  assert.equal(policy.supportsDeepSeekVision({ modelId: 'deepseek-v4-flash' }), false);
  assert.equal(policy.supportsDeepSeekVision({ modelId: 'deepseek-v4-flash-vision-exp' }), true);
});
test('DeepSeek vision policy rejects oversized images and unsupported models before encoding', async () => {
  const policy = await import('../src/ai/deepseekVisionPolicy.ts');
  assert.throws(() => policy.assertDeepSeekVisionRequest({ modelId: 'deepseek-v4-pro', imageSizes: [1] }), /不支持图片/);
  assert.throws(() => policy.assertDeepSeekVisionRequest({ modelId: 'deepseek-v4-flash-vision-exp', imageSizes: [33 * 1024 * 1024] }), /32 MiB/);
  assert.equal(policy.isSupportedDeepSeekVisionMimeType('image/webp'), true);
  assert.equal(policy.isSupportedDeepSeekVisionMimeType('image/heic'), false);
});
test('DeepSeek vision policy validates declared MIME against file signature', async () => {
  const policy = await import('../src/ai/deepseekVisionPolicy.ts');
  assert.doesNotThrow(() => policy.assertDeepSeekVisionAttachment({ mimeType: 'image/png', size: 8, base64Data: 'iVBORw0KGgo=' }));
  assert.throws(() => policy.assertDeepSeekVisionAttachment({ mimeType: 'image/png', size: 8, base64Data: '/9j/4AAQ' }), /声明类型不一致/);
  assert.throws(() => policy.assertDeepSeekInlineRequestBodyBytes(48 * 1024 * 1024 + 1), /48 MiB/);
});
