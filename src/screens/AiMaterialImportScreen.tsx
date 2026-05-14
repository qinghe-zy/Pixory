import { AiPlaceholderScreen } from './AiPlaceholderScreen';
import type { PixorySpace } from '../database';

interface AiMaterialImportScreenProps {
  space: PixorySpace;
  knowledgeBaseId?: number;
  onBack: () => void;
}

export function AiMaterialImportScreen({ space, knowledgeBaseId, onBack }: AiMaterialImportScreenProps) {
  return (
    <AiPlaceholderScreen
      description={`材料导入入口已接入。${knowledgeBaseId != null ? `目标知识库编号：${knowledgeBaseId}。` : '默认导入到当前空间的知识库。'} 原始文档会复制到 App 私有 AI 资料目录后再解析。`}
      icon="cloud-upload-outline"
      onBack={onBack}
      space={space}
      title="导入材料"
    />
  );
}
