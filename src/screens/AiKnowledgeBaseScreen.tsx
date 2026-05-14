import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiKnowledgeBaseScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onImportMaterial: (knowledgeBaseId?: number) => void;
  onOpenMaterials: (knowledgeBaseId?: number) => void;
  onStartChat: (knowledgeBaseId: number | undefined, title: string) => void;
}

export function AiKnowledgeBaseScreen({ space, onBack, onImportMaterial, onOpenMaterials, onStartChat }: AiKnowledgeBaseScreenProps) {
  return (
    <AiPlaceholderScreen
      actions={[
        {
          description: '导入 txt、md、docx 或可读取文本的 PDF 到本地私有目录。',
          icon: 'cloud-upload-outline',
          label: '导入材料',
          onPress: () => onImportMaterial(undefined),
        },
        {
          description: '查看已入库文档、解析状态和切片结果。',
          icon: 'folder-open-outline',
          label: '材料列表',
          onPress: () => onOpenMaterials(undefined),
        },
        {
          description: '按资料命中结果构建材料绑定提示词。',
          icon: 'chatbubble-ellipses-outline',
          label: '开始知识库会话',
          onPress: () => onStartChat(undefined, '知识库对话'),
        },
      ]}
      description="知识库入口已接入导航。文档必须先复制进 App 私有目录，再解析、切片并写入当前空间数据库。"
      icon="library-outline"
      onBack={onBack}
      space={space}
      title="知识库"
    />
  );
}
