import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiSessionConfigScreenProps {
  space: PixorySpace;
  threadId?: number;
  contextTitle?: string;
  onBack: () => void;
  onOpenProviderSettings: () => void;
  onOpenModelPicker: () => void;
  onOpenRoleCardEditor: () => void;
}

export function AiSessionConfigScreen({
  space,
  threadId,
  contextTitle,
  onBack,
  onOpenProviderSettings,
  onOpenModelPicker,
  onOpenRoleCardEditor,
}: AiSessionConfigScreenProps) {
  return (
    <AiPlaceholderScreen
      actions={[
        {
          description: '配置 OpenAI 兼容、Gemini 或 Claude 的本地安全密钥。',
          icon: 'key-outline',
          label: '提供商设置',
          onPress: onOpenProviderSettings,
        },
        {
          description: '选择本次会话使用的模型，后续会保存到会话快照。',
          icon: 'hardware-chip-outline',
          label: '模型选择',
          onPress: onOpenModelPicker,
        },
        {
          description: '维护默认角色卡、IP 角色卡和知识库角色卡。',
          icon: 'person-circle-outline',
          label: '角色卡',
          onPress: onOpenRoleCardEditor,
        },
      ]}
      description={`会话设置入口已接入导航。${contextTitle ? `当前上下文：${contextTitle}。` : ''}${threadId != null ? ` 会话编号：${threadId}。` : ''}`}
      icon="options-outline"
      onBack={onBack}
      space={space}
      title="会话设置"
    />
  );
}
