import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AiThreadHistoryItem } from '../../database/repositories/aiThreadRepository';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiRecentThreadSwitcherProps {
  items: AiThreadHistoryItem[];
  onOpenThread: (thread: AiThreadHistoryItem) => void;
}

export function AiRecentThreadSwitcher({ items, onOpenThread }: AiRecentThreadSwitcherProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={styles.wrap}>
      {items.slice(0, 3).map((thread) => (
        <Pressable accessibilityRole="button" key={thread.id} onPress={() => onOpenThread(thread)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.primaryActive} name="chatbubble-ellipses-outline" size={13} />
          <Text numberOfLines={1} style={styles.text}>{thread.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
    paddingBottom: spacing[1],
  },
  item: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    maxWidth: '100%',
    minHeight: 28,
    paddingHorizontal: spacing[2],
  },
  text: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    maxWidth: 140,
  },
  pressed: {
    opacity: 0.78,
  },
});
