import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import { groupRepository, ipRepository, type GroupListItem, type IpRecord } from '../database';
import { getGroupTypeLabel, GROUP_TYPE_OPTIONS } from '../constants/groups';
import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';
import { formatDate } from '../utils/formatters';

interface GroupOverviewScreenProps {
  ipId: number;
  refreshToken: number;
  onBack: () => void;
  onCreateGroup: () => void;
  onOpenGroup: (groupId: number) => void;
}

export function GroupOverviewScreen({
  ipId,
  refreshToken,
  onBack,
  onCreateGroup,
  onOpenGroup,
}: GroupOverviewScreenProps) {
  const [ip, setIp] = useState<IpRecord | null>(null);
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [ipRecord, groupItems] = await Promise.all([
          ipRepository.findById(ipId),
          groupRepository.findOverviewByIpId(ipId),
        ]);

        if (!isMounted) {
          return;
        }

        setIp(ipRecord);
        setGroups(groupItems);
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取分组失败：${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [ipId, refreshToken]);

  const rightSlot = useMemo(
    () => (
      <Pressable onPress={onCreateGroup} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
        <Ionicons color={colors.primary.default} name="add" size={20} />
      </Pressable>
    ),
    [onCreateGroup]
  );

  const groupedSections = GROUP_TYPE_OPTIONS.map((option) => ({
    ...option,
    items: groups.filter((group) => group.type === option.value),
  })).filter((section) => section.items.length > 0 || isLoading);

  return (
    <AppScreen scrollable>
      <Header onBack={onBack} rightSlot={rightSlot} title="分组" />

      {ip ? <Text style={styles.subhead}>{ip.name}</Text> : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {!isLoading && groups.length === 0 ? (
        <EmptyState
          actionLabel="新建分组"
          description="创建分组后，可以把季节限定、场景限定和用途素材整理得更清晰。"
          iconName="folder-open-outline"
          onAction={onCreateGroup}
          title="还没有分组"
        />
      ) : null}

      <View style={styles.list}>
        {groupedSections.map((section) => (
          <View key={section.value} style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{section.label}</Text>
            {section.items.map((group) => (
              <Pressable key={group.id} onPress={() => onOpenGroup(group.id)} style={({ pressed }) => [pressed && styles.pressed]}>
                <ContentCard style={styles.groupCard}>
                  <View style={styles.coverWrap}>
                    {group.coverThumbnailFileUri ? (
                      <Image resizeMode="cover" source={{ uri: group.coverThumbnailFileUri }} style={styles.coverImage} />
                    ) : (
                      <View style={styles.coverEmpty}>
                        <Ionicons color={colors.primary.default} name="images-outline" size={26} />
                        <Text style={styles.coverLabel}>{getGroupTypeLabel(group.type)}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.groupBody}>
                    <View style={styles.groupHeader}>
                      <Text numberOfLines={1} style={styles.groupName}>
                        {group.name}
                      </Text>
                      <Text style={styles.groupType}>{getGroupTypeLabel(group.type)}</Text>
                    </View>
                    <Text numberOfLines={2} style={styles.groupDescription}>
                      {group.description || '还没有分组说明'}
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>{group.imageCount} 张图片</Text>
                      <Text style={styles.metaText}>最近更新 {formatDate(group.recentUpdatedAt)}</Text>
                    </View>
                  </View>
                </ContentCard>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: componentTokens.iconButton.radius,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    width: componentTokens.iconButton.size,
  },
  pressed: {
    opacity: 0.8,
  },
  subhead: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    marginTop: -spacing[4],
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  list: {
    gap: spacing[4],
  },
  sectionBlock: {
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  groupCard: {
    gap: spacing[4],
    padding: spacing[4],
  },
  coverWrap: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  coverImage: {
    aspectRatio: 3 / 2,
    width: '100%',
  },
  coverEmpty: {
    alignItems: 'center',
    aspectRatio: 3 / 2,
    gap: spacing[2],
    justifyContent: 'center',
    padding: spacing[4],
  },
  coverLabel: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  groupBody: {
    gap: spacing[2],
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  groupName: {
    ...typography.textStyles.sectionTitle,
    flex: 1,
  },
  groupType: {
    ...typography.textStyles.micro,
    backgroundColor: colors.background.tag,
    borderRadius: radius.sm,
    color: colors.primary.default,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  groupDescription: {
    ...typography.textStyles.body,
    color: colors.text.body,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  metaText: {
    ...typography.textStyles.caption,
  },
});
