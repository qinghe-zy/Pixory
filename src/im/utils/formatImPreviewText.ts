/**
 * 伴聊会话列表与通讯录消息摘要统一净化工具
 *
 * 彻底过滤内部控制标签、系统提示与图片/语音/文件/表情等 JSON 结构，
 * 确保列表页与侧边通讯录预览干净自然。
 */

import { formatMessagePreview, formatMessagePreviewText } from '../../utils/formatMessagePreview';

export function formatImPreviewText(
  raw: string | null | undefined,
  fallbackText: string = '发句问候，开启今天的对话吧'
): string {
  return formatMessagePreview(raw, fallbackText);
}

export { formatMessagePreview, formatMessagePreviewText };
