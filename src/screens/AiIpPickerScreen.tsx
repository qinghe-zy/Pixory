import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiIpPickerScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onSelectIp: (ipId: number, title: string) => void;
}

export function AiIpPickerScreen({ space, onBack, onSelectIp }: AiIpPickerScreenProps) {
  return (
    <AiPlaceholderScreen
      actions={[
        {
          description: '临时进入一个 IP 上下文会话，后续会替换为真实 IP 列表。',
          icon: 'albums-outline',
          label: '使用示例 IP 会话',
          onPress: () => onSelectIp(0, 'IP 对话'),
        },
      ]}
      description="这里会列出当前空间的 IP，用于创建单 IP 会话。不会跨普通空间和私密空间读取资料。"
      icon="albums-outline"
      onBack={onBack}
      space={space}
      title="选择 IP"
    />
  );
}
