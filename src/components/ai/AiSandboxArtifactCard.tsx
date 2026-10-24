import React from 'react';
import {
  AiSandboxArtifactViewfinder,
  type AiSandboxArtifactViewfinderProps,
} from './AiSandboxArtifactViewfinder';

export type AiSandboxArtifactCardProps = AiSandboxArtifactViewfinderProps;

/**
 * AI 沙箱制品小卡片（默认处于收拢态，尺寸呈取景器压扁后的和谐黄金比例）
 * 拥有与取景器同款 radius.lg 圆角、同款黑色胶囊运行按钮、同款方框展开按钮，
 * 支持在原地伴随高阶变速动画平滑展开为完整取景器或收拢复原。
 */
export const AiSandboxArtifactCard = React.memo(function AiSandboxArtifactCard(
  props: AiSandboxArtifactCardProps
) {
  return <AiSandboxArtifactViewfinder {...props} defaultExpanded={false} />;
});
