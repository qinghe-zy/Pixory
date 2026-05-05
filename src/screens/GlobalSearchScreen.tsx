import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SearchBar } from '../components/SearchBar';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GlobalGroupListItem, type ImageListItem, type IpListItem, type PixorySpace, type TagUsageItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

interface GlobalSearchScreenProps {
  space?: PixorySpace;
  query: string;
  onChangeQuery: (value: string) => void;
  onBack: () => void;
  onOpenIp: (ipId: number) => void;
  onOpenGroup: (ipId: number, groupId: number) => void;
  onOpenTag: (tagId: number) => void;
  onOpenImageDetail: (imageId: number) => void;
}

export function GlobalSearchScreen({
  space = 'normal',
  query,
  onChangeQuery,
  onBack,
  onOpenIp,
  onOpenGroup,
  onOpenTag,
  onOpenImageDetail,
}: GlobalSearchScreenProps) {
  const keyword = query.trim();
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ips: IpListItem[];
    groups: GlobalGroupListItem[];
    tags: TagUsageItem[];
    images: ImageListItem[];
  }>(
    async () => {
      if (!keyword) {
        return { groups: [], images: [], ips: [], tags: [] };
      }

      const [ips, allGroups, allTags, images] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findLibraryItems(db, { searchText: keyword }),
        groupRepository.findOverview(db),
        tagRepository.findUsageOverview(db),
        imageRepository.findFiltered(db, { searchText: keyword }),
      ]));
      const lower = keyword.toLowerCase();

      return {
        ips,
        groups: allGroups.filter((group) => group.name.toLowerCase().includes(lower) || group.ipName.toLowerCase().includes(lower)),
        tags: allTags.filter((tag) => tag.name.toLowerCase().includes(lower)),
        images,
      };
    },
    [keyword, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `搜索失败：${message}`;
      },
      initialData: { groups: [], images: [], ips: [], tags: [] },
    }
  );
  const ips = data?.ips ?? [];
  const groups = data?.groups ?? [];
  const tags = data?.tags ?? [];
  const images = data?.images ?? [];
  const totalCount = ips.length + groups.length + tags.length + images.length;

  return (
    <ScreenScaffold decorativeTitle="Search" onBack={onBack} scrollable title="全局搜索">
      <SearchBar onChangeText={onChangeQuery} placeholder="搜 IP / 分组 / 标签 / 文件名 / 备注" value={query} />
      <PageStateBlock
        emptyDescription={keyword ? '换一个关键词，或减少筛选条件。' : '输入关键词后会同时搜索 IP、分组、标签、文件名和备注。'}
        emptyIconName="search-outline"
        emptyTitle={keyword ? '没有搜索结果' : '搜索 Pixory'}
        errorMessage={errorMessage}
        isEmpty={!isLoading && totalCount === 0}
        loading={isLoading && Boolean(keyword)}
        loadingDescription="正在搜索本地 SQLite 数据。"
        loadingTitle="搜索中"
        onRetry={reload}
      >
        <View style={styles.content}>
          <ResultSection title="IP" count={ips.length}>
            {ips.map((ip) => (
              <ResultRow key={ip.id} label={ip.name} meta={`${ip.imageCount} 张图片 · ${ip.groupCount} 个分组`} onPress={() => onOpenIp(ip.id)} />
            ))}
          </ResultSection>
          <ResultSection title="分组" count={groups.length}>
            {groups.map((group) => (
              <ResultRow key={group.id} label={group.name} meta={`${group.ipName} · ${group.imageCount} 张`} onPress={() => onOpenGroup(group.ipId, group.id)} />
            ))}
          </ResultSection>
          <ResultSection title="标签" count={tags.length}>
            {tags.map((tag) => (
              <ResultRow key={tag.id} label={`#${tag.name}`} meta={`${tag.imageCount} 张图片`} onPress={() => onOpenTag(tag.id)} />
            ))}
          </ResultSection>
          <ResultSection title="图片" count={images.length}>
            <View style={styles.grid}>
              {images.map((image) => (
                <ThumbnailTile image={image} key={image.id} onPress={onOpenImageDetail} space={space} />
              ))}
            </View>
          </ResultSection>
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

function ResultSection({ children, count, title }: { children: ReactNode; count: number; title: string }) {
  if (count === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title} · {count}</Text>
      {children}
    </View>
  );
}

function ResultRow({ label, meta, onPress }: { label: string; meta: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{label}</Text>
        <Text numberOfLines={1} style={styles.rowMeta}>{meta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing[5],
  },
  section: {
    gap: spacing[2],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  row: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  rowCopy: {
    gap: spacing[1],
  },
  rowTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  rowMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  pressed: {
    opacity: 0.78,
  },
});
