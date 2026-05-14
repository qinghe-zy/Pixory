import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiProviderSettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onOpenModelPicker: (providerId?: number) => void;
}

export function AiProviderSettingsScreen({ space, onBack, onOpenModelPicker }: AiProviderSettingsScreenProps) {
  return (
    <AiPlaceholderScreen
      actions={[
        {
          description: '查看已连接提供商的可用模型列表。',
          icon: 'list-outline',
          label: '同步并选择模型',
          onPress: () => onOpenModelPicker(undefined),
        },
      ]}
      description="这里会管理 OpenAI 兼容、Gemini 与 Claude 配置。API key 不写入 SQLite，只通过 SecureStore 保存。"
      icon="key-outline"
      onBack={onBack}
      space={space}
      title="模型提供商"
    />
  );
}
