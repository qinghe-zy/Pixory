import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { NormalizedSillyTavernRoleCard } from '../../ai/sillyTavernRoleCardParser';
import type { PixorySpace } from '../../database';
import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { SecureImage } from '../SecureImage';
import { AiLightButton } from './AiLightButton';
import { aiLightColors } from './aiLightTheme';

interface AiRoleCardImportPreviewProps {
  allowStartChat?: boolean;
  avatarUri: string | null;
  imported: NormalizedSillyTavernRoleCard;
  saveLabel?: string;
  saving?: boolean;
  selectedGreeting: string | null;
  space: PixorySpace;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
  onSaveAndStart: () => void;
  onSelectGreeting: (greeting: string | null) => void;
}

export function AiRoleCardImportPreview({
  allowStartChat = true,
  avatarUri,
  imported,
  saveLabel = '保存角色',
  saving = false,
  selectedGreeting,
  space,
  onCancel,
  onEdit,
  onSave,
  onSaveAndStart,
  onSelectGreeting,
}: AiRoleCardImportPreviewProps) {
  const greetings = imported.alternateGreetings;
  const details = [
    imported.creator ? `作者 ${imported.creator}` : null,
    imported.characterVersion ? `版本 ${imported.characterVersion}` : null,
    imported.sourceVersion.toUpperCase(),
  ].filter(Boolean);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {avatarUri ? (
            <SecureImage contentFit="cover" space={space} style={styles.avatarImage} uri={avatarUri} />
          ) : (
            <Ionicons color={aiLightColors.coralActive} name="person-circle-outline" size={metrics.iconButtonSize} />
          )}
        </View>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.title}>{imported.name}</Text>
          <Text numberOfLines={2} style={styles.caption}>{imported.description ?? '已解析角色卡'}</Text>
          {details.length ? <Text numberOfLines={1} style={styles.detailText}>{details.join(' · ')}</Text> : null}
        </View>
        <Pressable
          accessibilityLabel="关闭导入预览"
          accessibilityRole="button"
          hitSlop={spacing[2]}
          onPress={onCancel}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Ionicons color={aiLightColors.muted} name="close" size={metrics.iconSizeSm} />
        </Pressable>
      </View>

      {imported.tags.length ? (
        <View style={styles.tagRow}>
          {imported.tags.slice(0, 8).map((tag) => (
            <Text key={tag} numberOfLines={1} style={styles.tag}>{tag}</Text>
          ))}
        </View>
      ) : null}

      {greetings.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>默认开场白</Text>
          {greetings.map((greeting) => (
            <Pressable
              accessibilityRole="button"
              key={greeting}
              onPress={() => onSelectGreeting(greeting)}
              style={({ pressed }) => [
                styles.greetingRow,
                selectedGreeting === greeting && styles.greetingRowActive,
                pressed && styles.pressed,
              ]}
            >
              <Text numberOfLines={3} style={styles.greetingText}>{greeting}</Text>
              {selectedGreeting === greeting ? (
                <Ionicons color={aiLightColors.coralActive} name="checkmark-circle" size={metrics.iconSizeMd} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>导入摘要</Text>
        <Text style={styles.caption}>
          {`设定 ${imported.prompt.length} 字 · 附加设定 ${imported.worldBookEntryCount} 条`}
        </Text>
        {imported.worldBookTruncated ? <Text style={styles.warning}>部分附加设定因长度限制未导入</Text> : null}
        {imported.warnings.map((warning) => (
          <Text key={warning} style={styles.warning}>{warning}</Text>
        ))}
      </View>

      <View style={styles.actions}>
        <AiLightButton disabled={saving} label={saveLabel} loading={saving} onPress={onSave} />
        {allowStartChat ? (
          <AiLightButton disabled={saving} label="保存并开聊" onPress={onSaveAndStart} variant="outline" />
        ) : null}
        <AiLightButton disabled={saving} label="编辑后保存" onPress={onEdit} variant="ghost" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[12],
    justifyContent: 'center',
    overflow: 'hidden',
    width: spacing[12],
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  headerCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.cardTitle,
    color: aiLightColors.ink,
  },
  caption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  detailText: {
    ...typography.textStyles.micro,
    color: aiLightColors.mutedSoft,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: metrics.minTouchSize,
    justifyContent: 'center',
    width: metrics.minTouchSize,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  tag: {
    ...typography.textStyles.micro,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.muted,
    // Percentage width prevents long imported tags from stretching the preview panel.
    maxWidth: '48%',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  section: {
    gap: rhythm.microGap,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  greetingRow: {
    alignItems: 'flex-start',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
    padding: spacing[2],
  },
  greetingRowActive: {
    borderColor: aiLightColors.coral,
  },
  greetingText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    flex: 1,
  },
  warning: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  actions: {
    gap: rhythm.inlineGap,
  },
  pressed: {
    opacity: 0.78,
  },
});
