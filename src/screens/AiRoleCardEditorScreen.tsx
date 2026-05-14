import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiRoleCardEditorScreenProps {
  space: PixorySpace;
  roleCardId?: number;
  onBack: () => void;
}

export function AiRoleCardEditorScreen({ space, roleCardId, onBack }: AiRoleCardEditorScreenProps) {
  return (
    <AiPlaceholderScreen
      description={`角色卡编辑入口已接入。${roleCardId != null ? `当前角色卡编号：${roleCardId}。` : '默认角色卡会服务普通聊天、IP 聊天与材料绑定会话。'}`}
      icon="person-circle-outline"
      onBack={onBack}
      space={space}
      title="角色卡"
    />
  );
}
