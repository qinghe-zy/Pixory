import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../design/tokens';
import type { JournalAchievementRecord } from '../../services/journalAchievementService';

interface JournalAchievementRowProps {
  achievement: JournalAchievementRecord;
  isOpen: boolean;
  onPress: () => void;
  onNavigate?: () => void;
  formatDate: (timestamp: number) => string;
}

export function JournalAchievementRow({
  achievement,
  isOpen,
  onPress,
  onNavigate,
  formatDate,
}: JournalAchievementRowProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.titleCell, pressed && styles.pressed]}
        >
          {achievement.readAt === null ? <View style={styles.unreadDot} /> : null}
          <Text numberOfLines={1} style={styles.title}>{achievement.title}</Text>
        </Pressable>
        <Text style={styles.achievementRowDate}>{formatDate(achievement.occurredAt)}</Text>
        <View style={styles.achievementRowAction}>
          {onNavigate ? (
            <Pressable
              accessibilityLabel={`打开${achievement.title}`}
              hitSlop={10}
              onPress={onNavigate}
              style={({ pressed }) => [styles.achievementRowActionButton, pressed && styles.pressed]}
            >
              <Feather color={colors.text.tertiary} name="arrow-right" size={15} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {isOpen ? (
        <View style={styles.detail}>
          <Text style={styles.description}>{achievement.description}</Text>
          <Text style={styles.requirement}>{achievement.requirement}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[3],
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 28,
  },
  titleCell: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    paddingRight: spacing[2],
  },
  unreadDot: {
    backgroundColor: colors.text.tertiary,
    borderRadius: 2.5,
    height: 5,
    marginRight: spacing[2],
    width: 5,
  },
  title: {
    ...typography.textStyles.body,
    color: colors.text.primary,
    flexShrink: 1,
  },
  achievementRowDate: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    textAlign: 'right',
    width: 86,
  },
  achievementRowAction: {
    alignItems: 'flex-end',
    width: 28,
  },
  achievementRowActionButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  detail: {
    paddingLeft: spacing[2] + 5,
    paddingRight: 28 + spacing[2],
    paddingTop: spacing[2],
  },
  description: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  requirement: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    lineHeight: 16,
    marginTop: spacing[1],
  },
  pressed: {
    opacity: 0.65,
  },
});
