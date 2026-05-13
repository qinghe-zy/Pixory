import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SecureImage } from '../components/SecureImage';
import type { PixorySpace } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { listIpStorageUsage, type IpStorageUsageItem } from '../services/storageUsageService';
import { formatFileSize } from '../utils/formatters';

interface OriginalStorageScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenIp: (ipId: number) => void;
}

export function OriginalStorageScreen({ space = 'normal', refreshToken, onBack, onOpenIp }: OriginalStorageScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad<IpStorageUsageItem[]>(
    () => listIpStorageUsage(space),
    [space, refreshToken],
    {
      formatError: (error) => error instanceof Error ? `读取素材占用失败：${error.message}` : '读取素材占用失败',
      initialData: [],
    }
  );
  const items = data ?? [];
  const totalBytes = items.reduce((sum, item) => sum + item.totalBytes, 0);

  return (
    <ScreenScaffold backgroundVariant="archive" decorativeTitle="Originals" onBack={onBack} scrollable title="素材占用">
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>全部原始素材</Text>
        <Text style={styles.summaryValue}>{formatFileSize(totalBytes)}</Text>
      </View>

      <PageStateBlock
        emptyDescription="导入图片或视频后，这里会按 IP 显示占用。"
        emptyIconName="albums-outline"
        emptyTitle="还没有原始素材"
        errorMessage={errorMessage}
        isEmpty={!isLoading && items.length === 0}
        loading={isLoading}
        loadingDescription="正在按 IP 统计素材占用。"
        loadingTitle="正在统计…"
        onRetry={reload}
      >
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.ipId}
              onPress={() => onOpenIp(item.ipId)}
              style={({ pressed }) => [styles.ipRow, pressed && styles.pressed]}
            >
              <View style={styles.cover}>
                {item.coverUri ? (
                  <SecureImage contentFit="cover" space={space} style={styles.coverImage} uri={item.coverUri} />
                ) : (
                  <Ionicons color={colors.text.secondary} name="albums-outline" size={22} />
                )}
              </View>
              <View style={styles.ipCopy}>
                <View style={styles.ipMainLine}>
                  <Text numberOfLines={1} style={styles.ipName}>{item.ipName}</Text>
                  <Text style={styles.ipBytes}>{formatFileSize(item.totalBytes)}</Text>
                </View>
                <Text numberOfLines={1} style={styles.ipMeta}>
                  {item.imageCount} 张图片 · {item.videoCount} 个视频
                </Text>
              </View>
              <Ionicons color={colors.text.tertiary} name="chevron-forward" size={18} />
            </Pressable>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
  },
  summaryLabel: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  summaryValue: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
  },
  list: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  ipRow: {
    alignItems: 'center',
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.listCardGap,
    minHeight: 72,
    padding: spacing[3],
  },
  cover: {
    alignItems: 'center',
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 50,
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  ipCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  ipMainLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    justifyContent: 'space-between',
  },
  ipName: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    flex: 1,
  },
  ipBytes: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '800',
  },
  ipMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.82,
  },
});
