import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiModelPickerScreenProps {
  space: PixorySpace;
  providerId?: number;
  onBack: () => void;
}

export function AiModelPickerScreen({ space, providerId, onBack }: AiModelPickerScreenProps) {
  return (
    <AiPlaceholderScreen
      description={`模型选择入口已接入。${providerId != null ? `当前提供商编号：${providerId}。` : '后续会按提供商展示本地缓存的模型清单。'}`}
      icon="hardware-chip-outline"
      onBack={onBack}
      space={space}
      title="选择模型"
    />
  );
}
