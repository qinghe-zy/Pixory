import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiMaterialListScreenProps {
  space: PixorySpace;
  knowledgeBaseId?: number;
  onBack: () => void;
  onOpenDocument: (documentId: string, title: string) => void;
}

export function AiMaterialListScreen({ space, knowledgeBaseId, onBack, onOpenDocument }: AiMaterialListScreenProps) {
  return (
    <AiPlaceholderScreen
      actions={[
        {
          description: '打开文档阅读占位页，后续会展示真实解析文本。',
          icon: 'document-text-outline',
          label: '查看材料预览',
          onPress: () => onOpenDocument('document_preview', '材料预览'),
        },
      ]}
      description={`材料列表入口已接入。${knowledgeBaseId != null ? `当前知识库编号：${knowledgeBaseId}。` : '后续会展示当前空间最近导入的材料。'}`}
      icon="folder-open-outline"
      onBack={onBack}
      space={space}
      title="材料列表"
    />
  );
}
