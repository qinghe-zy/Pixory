import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiDocumentReaderScreenProps {
  space: PixorySpace;
  documentId?: number;
  title?: string;
  onBack: () => void;
}

export function AiDocumentReaderScreen({ space, documentId, title, onBack }: AiDocumentReaderScreenProps) {
  return (
    <AiPlaceholderScreen
      description={`文档阅读入口已接入。${documentId != null ? `文档编号：${documentId}。` : '后续会展示解析后的文本块和引用位置。'}`}
      icon="document-text-outline"
      onBack={onBack}
      space={space}
      title={title ?? '文档阅读'}
    />
  );
}
