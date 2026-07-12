import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { AiStreamBlock } from "../../ai/aiStreamingBlockSplitter";
import {
  getSegmentChrome,
  type AiTailSegmentEdge,
} from "../../ai/aiStreamingTailRenderContract";
import { radius, rhythm, spacing } from "../../design/tokens";
import { aiLightColors } from "./aiLightTheme";
import { AiMeasuredStreamBlock } from "./AiMeasuredStreamBlock";

type AiStreamingTailMessageSegmentProps = {
  blocks: AiStreamBlock[];
  bubbleWidth: number;
  citations?: ReactNode;
  edge: AiTailSegmentEdge;
  footer?: ReactNode;
  onMeasured: (blockId: string, height: number) => void;
};

function resolveBlockVerticalInset(
  edge: AiTailSegmentEdge,
  index: number,
  blockCount: number,
): "none" | "top" | "bottom" | "both" {
  const hasTopInset =
    index === 0 && (edge === "single" || edge === "first");
  const hasBottomInset =
    index === blockCount - 1 && (edge === "single" || edge === "last");
  if (hasTopInset && hasBottomInset) return "both";
  if (hasTopInset) return "top";
  if (hasBottomInset) return "bottom";
  return "none";
}

export function AiStreamingTailMessageSegment({
  blocks,
  bubbleWidth,
  citations,
  edge,
  footer,
  onMeasured,
}: AiStreamingTailMessageSegmentProps) {
  const lane = blocks[0]?.lane ?? "content";
  if (lane === "reasoning") {
    return (
      <View style={styles.reasoningRow}>
        {blocks.map((block) => (
          <AiMeasuredStreamBlock
            block={block}
            bubbleWidth={bubbleWidth}
            insetMode="thinking"
            key={block.blockId}
            onMeasured={onMeasured}
          />
        ))}
      </View>
    );
  }

  const chrome = getSegmentChrome(edge, "android");
  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantStack}>
        <View
          style={[
            styles.assistantBubble,
            !chrome.borderTopClosed && styles.openTop,
            !chrome.borderBottomClosed && styles.openBottom,
          ]}
        >
          {blocks.map((block, index) => (
            <AiMeasuredStreamBlock
              block={block}
              bubbleWidth={bubbleWidth}
              key={block.blockId}
              onMeasured={onMeasured}
              verticalInset={resolveBlockVerticalInset(edge, index, blocks.length)}
            />
          ))}
          {chrome.drawsCitations ? citations : null}
        </View>
        {chrome.drawsFooter ? footer : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  assistantBubble: {
    alignSelf: "stretch",
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
    overflow: "hidden",
  },
  assistantRow: {
    alignItems: "flex-start",
    marginTop: -rhythm.listCardGap,
    maxWidth: "100%",
    width: "100%",
  },
  assistantStack: {
    alignItems: "flex-start",
    alignSelf: "flex-start",
    maxWidth: "94%",
    width: "94%",
  },
  openBottom: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  openTop: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
  },
  reasoningRow: {
    alignSelf: "flex-start",
    marginTop: -rhythm.listCardGap,
    paddingHorizontal: spacing[1],
    width: "94%",
  },
});
