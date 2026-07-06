import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightSearchBar } from '../components/ai/AiLightField';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { PageStateBlock } from '../components/PageStateBlock';
import { ipRepository, runWithDatabaseSpace, type IpListItem, type PixorySpace } from '../database';
import { radius, rhythm, spacing, typography } from '../design/tokens';

interface AiIpPickerScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onSelectIp: (ipId: number, title: string, includeIpDocuments: boolean) => void;
}

export function AiIpPickerScreen({ space, onBack, onSelectIp }: AiIpPickerScreenProps) {
  const [items, setItems] = useState<IpListItem[]>([]);
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [includeIpDocuments, setIncludeIpDocuments] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);
    void runWithDatabaseSpace(space, (db) => ipRepository.findLibraryItems(db))
      .then((nextItems) => {
        if (isMounted) {
          setItems(nextItems);
          setSelectedIpId((current) => current ?? nextItems[0]?.id ?? null);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : '读取 IP 列表失败');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [space]);

  const filteredItems = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    if (!normalized) {
      return items;
    }
    return items.filter((item) => `${item.name} ${item.description ?? ''}`.toLowerCase().includes(normalized));
  }, [items, searchText]);
  const selectedIp = items.find((item) => item.id === selectedIpId) ?? null;
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  return (
    <AiLightScaffold
      onBack={onBack}
      scrollable
      subtitle={spaceLabel}
      title="选择 IP"
    >
      <View style={styles.contentStack}>
        <View style={styles.searchWrap}>
          <AiLightSearchBar onChangeText={setSearchText} placeholder="搜索 IP" value={searchText} />
        </View>

        <AiLightCard>
          <OptionRow
            fixed
            label="基础 IP 资料"
            value
          />
          <OptionRow
            label="IP 文档"
            onValueChange={setIncludeIpDocuments}
            value={includeIpDocuments}
          />
        </AiLightCard>

        <PageStateBlock
          emptyActionLabel="返回"
          emptyDescription=""
          emptyIconName="albums-outline"
          emptyTitle="没有可选择的 IP"
          errorMessage={errorMessage}
          isEmpty={!loading && filteredItems.length === 0}
          loading={loading}
          loadingDescription=""
          loadingTitle="正在加载 IP"
          onEmptyAction={onBack}
        >
          <View style={styles.list}>
            {filteredItems.map((item) => {
              const selected = item.id === selectedIpId;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => setSelectedIpId(item.id)}
                  style={({ pressed }) => [styles.ipRow, selected && styles.selectedIpRow, pressed && styles.pressed]}
                >
                  <View style={styles.ipIcon}>
                    <Ionicons color={aiLightColors.primaryActive} name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} />
                  </View>
                  <View style={styles.ipCopy}>
                    <Text style={styles.ipName}>{item.name}</Text>
                    <Text style={styles.ipMeta}>
                      {item.imageCount} 图 · {item.videoCount} 视频 · {item.groupCount} 分组
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </PageStateBlock>

        <AiLightButton
          disabled={!selectedIp}
          label="用这个 IP 开始聊天"
          onPress={() => {
            if (selectedIp) {
              onSelectIp(selectedIp.id, `${selectedIp.name} IP`, includeIpDocuments);
            }
          }}
        />
      </View>
    </AiLightScaffold>
  );
}

interface OptionRowProps {
  label: string;
  value: boolean;
  fixed?: boolean;
  onValueChange?: (value: boolean) => void;
}

function OptionRow({ label, value, fixed = false, onValueChange }: OptionRowProps) {
  return (
    <View style={styles.optionRow}>
      <View style={styles.optionCopy}>
        <Text style={styles.optionLabel}>{label}</Text>
      </View>
      {fixed ? (
        <Text style={styles.fixedBadge}>固定</Text>
      ) : (
        <Switch
          onValueChange={onValueChange}
          thumbColor={aiLightColors.canvas}
          trackColor={{ false: aiLightColors.hairline, true: aiLightColors.primary }}
          value={value}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: rhythm.entryCardGap,
  },
  searchWrap: {
    gap: rhythm.fieldContentGap,
  },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  optionCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  optionLabel: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  fixedBadge: {
    ...typography.textStyles.micro,
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    color: aiLightColors.primaryActive,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  list: {
    gap: rhythm.listCardGap,
  },
  ipRow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 70,
    padding: spacing[3],
  },
  selectedIpRow: {
    borderColor: aiLightColors.primary,
  },
  pressed: {
    opacity: 0.78,
  },
  ipIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  ipCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  ipName: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  ipMeta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
});
