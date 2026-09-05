import { Feather } from '@expo/vector-icons';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../design/tokens';
import type { JournalAchievementCategoryView, JournalAchievementRecord } from '../../services/journalAchievementService';
import { JournalAchievementRow } from './JournalAchievementRow';

interface JournalAchievementChapterProps {
  category: JournalAchievementCategoryView;
  expanded: boolean;
  openAchievementId: string | null;
  onToggle: () => void;
  onOpenAchievement: (achievement: JournalAchievementRecord) => void;
  onNavigate: (achievement: JournalAchievementRecord) => void;
  formatDate: (timestamp: number) => string;
}

export function JournalAchievementChapter({
  category,
  expanded,
  openAchievementId,
  onToggle,
  onOpenAchievement,
  onNavigate,
  formatDate,
}: JournalAchievementChapterProps) {
  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <View style={styles.chapter}>
      <Pressable accessibilityRole="button" onPress={handleToggle} style={styles.header}>
        <View style={styles.heading}>
          {category.hasUnread ? <View style={styles.unreadDot} /> : null}
          <Text style={styles.title}>{category.title}</Text>
          <Text style={styles.count}>{category.achievements.length}</Text>
        </View>
        <Feather color={colors.text.tertiary} name={expanded ? 'chevron-up' : 'chevron-down'} size={16} />
      </Pressable>
      {expanded ? (
        <View style={styles.rows}>
          {category.achievements.map((achievement) => (
            <JournalAchievementRow
              achievement={achievement}
              formatDate={formatDate}
              isOpen={openAchievementId === achievement.achievementId}
              key={achievement.achievementId}
              onNavigate={
                achievement.routeKind === 'calculation' ||
                (achievement.routeKind === 'memory-board' && typeof achievement.sourcePayload.threadId !== 'string')
                  ? undefined
                  : () => onNavigate(achievement)
              }
              onPress={() => onOpenAchievement(achievement)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chapter: {
    marginBottom: spacing[4],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingVertical: spacing[2],
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  unreadDot: {
    backgroundColor: colors.text.tertiary,
    borderRadius: 2.5,
    height: 5,
    marginRight: spacing[2],
    width: 5,
  },
  title: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
    fontFamily: typography.family.serif,
  },
  count: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    marginLeft: spacing[2],
  },
  rows: {
    paddingLeft: spacing[2],
  },
});
