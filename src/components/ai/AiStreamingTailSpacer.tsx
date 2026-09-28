import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

type AiStreamingTailSpacerProps = {
  height: number;
};

function AiStreamingTailSpacerComponent({ height }: AiStreamingTailSpacerProps) {
  return <View pointerEvents="none" style={[styles.spacer, { height: Math.max(0, height) }]} />;
}

export const AiStreamingTailSpacer = memo(AiStreamingTailSpacerComponent);

const styles = StyleSheet.create({
  spacer: {
    opacity: 0,
    width: '100%',
  },
});
