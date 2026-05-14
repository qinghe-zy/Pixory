import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiHistoryScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onOpenThread: (threadId: string, title: string) => void;
}

export function AiHistoryScreen({ space, onBack, onOpenThread }: AiHistoryScreenProps) {
  return (
    <AiPlaceholderScreen
      actions={[
        {
          description: '打开一个会话占位项，后续会替换为真实历史列表。',
          icon: 'chatbubble-ellipses-outline',
          label: '打开最近会话',
          onPress: () => onOpenThread('thread_preview', '最近会话'),
        },
      ]}
      description="历史会话入口已接入。列表只会读取当前空间的会话，不跨空间混合普通与私密内容。"
      icon="time-outline"
      onBack={onBack}
      space={space}
      title="历史会话"
    />
  );
}
