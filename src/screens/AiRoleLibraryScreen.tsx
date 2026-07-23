import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { deleteRoleCards, listRoleCards } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiRoleLibraryItem } from '../components/ai/AiRoleLibraryItem';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppDialog } from '../components/AppDialog';
import type { PixorySpace } from '../database';
import { metrics, radius, rhythm, spacing, typography } from '../design/tokens';

interface AiRoleLibraryScreenProps {
  space: PixorySpace;
  mode?: 'library' | 'apply_to_thread';
  onBack: () => void;
  onCreateRole: () => void;
  onImportRole: () => void;
  onOpenRoleDetail: (roleCardId: string) => void;
  onStartChatWithRole: (roleCardId: string) => Promise<void> | void;
  onApplyRoleToThread?: (roleCardId: string) => Promise<void> | void;
}

export function AiRoleLibraryScreen({
  space,
  mode = 'library',
  onBack,
  onCreateRole,
  onImportRole,
  onOpenRoleDetail,
  onStartChatWithRole,
  onApplyRoleToThread,
}: AiRoleLibraryScreenProps) {
  const [cards, setCards] = useState<AiRoleCardRecord[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    const nextCards = await listRoleCards(space);
    setCards(nextCards);
  }, [space]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  function toggleSelected(card: AiRoleCardRecord) {
    setSelectedCardIds((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]);
  }

  async function startChat(card: AiRoleCardRecord) {
    setBusyRoleId(card.id);
    setStatus(null);
    try {
      if (mode === 'apply_to_thread' && onApplyRoleToThread) {
        await onApplyRoleToThread(card.id);
      } else {
        await onStartChatWithRole(card.id);
      }
    } catch (error) {
      const action = mode === 'apply_to_thread' ? '应用角色失败' : '开始对话失败';
      setStatus(error instanceof Error ? `${action}：${error.message}` : action);
    } finally {
      setBusyRoleId(null);
    }
  }

  async function deleteSelectedCards() {
    const ids = selectedCardIds;
    if (!ids.length) {
      setDeleteConfirmVisible(false);
      return;
    }
    const count = await deleteRoleCards(space, ids);
    setSelectedCardIds([]);
    setDeleteConfirmVisible(false);
    setStatus(`已删除 ${count} 张角色卡。`);
    await loadCards();
  }

  const selectionFooter = selectedCardIds.length ? (
    <View style={styles.selectionFooter}>
      <View style={styles.selectionCopy}>
        <Text style={styles.selectionTitle}>已选择 {selectedCardIds.length} 张角色卡</Text>
        <Text style={styles.selectionMeta}>只删除已保存的角色卡，不影响已有聊天记录。</Text>
      </View>
      <View style={styles.selectionActions}>
        <AiLightButton label="删除" onPress={() => setDeleteConfirmVisible(true)} variant="outline" />
        <AiLightButton label="取消选择" onPress={() => setSelectedCardIds([])} variant="ghost" />
      </View>
    </View>
  ) : null;

  return (
    <AiLightScaffold
      footer={selectionFooter}
      onBack={onBack}
      rightAction={(
        <Pressable accessibilityLabel="新建角色" accessibilityRole="button" onPress={onCreateRole} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.primaryActive} name="add" size={metrics.iconSizeMd} />
        </Pressable>
      )}
      scrollable
      subtitle={mode === 'apply_to_thread' ? '选择角色应用到当前会话' : '选择角色开始新对话'}
      title="角色库"
    >
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
      {cards.length ? (
        <View style={styles.list}>
          {cards.map((card) => (
            <AiRoleLibraryItem
              card={card}
              actionLabel={mode === 'apply_to_thread' ? '应用' : '开聊'}
              key={card.id}
              selected={selectedCardIds.includes(card.id)}
              selectionMode={selectedCardIds.length > 0}
              space={space}
              onLongPress={toggleSelected}
              onPress={(nextCard) => {
                if (selectedCardIds.length) {
                  toggleSelected(nextCard);
                  return;
                }
                onOpenRoleDetail(nextCard.id);
              }}
              onStartChat={(nextCard) => {
                if (busyRoleId) {
                  return;
                }
                void startChat(nextCard);
              }}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons color={aiLightColors.primaryActive} name="person-circle-outline" size={metrics.iconButtonSize} />
          </View>
          <Text style={styles.emptyTitle}>还没有角色</Text>
          <Text style={styles.emptyText}>创建或导入角色卡后，可以在这里直接开聊。</Text>
          <View style={styles.emptyActions}>
            <AiLightButton label="新建角色" onPress={onCreateRole} />
            <AiLightButton label="导入角色卡" onPress={onImportRole} variant="outline" />
          </View>
        </View>
      )}
      <AppDialog
        accent="ai"
        danger
        message={`将删除 ${selectedCardIds.length} 张已保存角色卡。已有聊天记录会保留当时的角色快照。`}
        onClose={() => setDeleteConfirmVisible(false)}
        onPrimary={() => {
          void deleteSelectedCards();
        }}
        primaryDisabled={!selectedCardIds.length}
        primaryLabel="删除"
        title="删除所选角色卡？"
        visible={deleteConfirmVisible}
      />
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    borderColor: aiLightColors.primary,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: metrics.iconButtonSize,
    justifyContent: 'center',
    width: metrics.iconButtonSize,
  },
  list: {
    gap: rhythm.listCardGap,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
  },
  emptyState: {
    alignItems: 'center',
    gap: rhythm.inlineGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[8],
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.pill,
    height: metrics.iconButtonSize * 1.4,
    justifyContent: 'center',
    width: metrics.iconButtonSize * 1.4,
  },
  emptyTitle: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
  },
  emptyText: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
    textAlign: 'center',
  },
  emptyActions: {
    alignSelf: 'stretch',
    gap: rhythm.inlineGap,
  },
  selectionFooter: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  selectionCopy: {
    gap: rhythm.microGap,
  },
  selectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  selectionMeta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  selectionActions: {
    gap: rhythm.inlineGap,
  },
  pressed: {
    opacity: 0.78,
  },
});
