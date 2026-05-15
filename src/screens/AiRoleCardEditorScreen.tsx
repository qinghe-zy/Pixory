import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormInputRow } from '../components/FormInputRow';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { applyRoleCardToThread } from '../ai/aiChatService';
import { listRoleCards, saveRoleCard } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiRoleCardEditorScreenProps {
  space: PixorySpace;
  roleCardId?: string;
  threadId?: string;
  onBack: () => void;
  onApplyRoleCard: (roleCardId?: string | null) => void;
}

export function AiRoleCardEditorScreen({ space, roleCardId, threadId, onBack, onApplyRoleCard }: AiRoleCardEditorScreenProps) {
  const [name, setName] = useState('素材整理助手');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [cards, setCards] = useState<AiRoleCardRecord[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  const loadCards = useCallback(async () => {
    const nextCards = await listRoleCards(space);
    setCards(nextCards);
  }, [space]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  async function saveReusableRoleCard() {
    if (!prompt.trim()) {
      setStatus('请先填写角色内容。');
      return;
    }
    setSaving(true);
    try {
      const card = await saveRoleCard({
        description,
        name: name.trim() || '未命名角色卡',
        prompt,
        space,
      });
      setStatus('已保存。');
      await loadCards();
      return card;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function applyRoleCard(roleId: string | null) {
    if (threadId) {
      await applyRoleCardToThread({ roleCardId: roleId, space, threadId });
    }
    onApplyRoleCard(roleId);
  }

  async function applyCurrentRole() {
    if (!prompt.trim()) {
      setStatus('使用默认角色。');
      await applyRoleCard(null);
      return;
    }
    const saved = await saveReusableRoleCard();
    if (!saved) {
      return;
    }
    setStatus('已应用。');
    await applyRoleCard(saved.id);
  }

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      onBack={onBack}
      scrollable
      subtitle={spaceLabel}
      title="角色"
    >
      <FormInputRow
        label="名称"
        onChangeText={setName}
        placeholder="品牌设定整理助手"
        value={name}
      />
      <FormTextareaRow
        label="角色内容"
        minHeight={240}
        onChangeText={setPrompt}
        placeholder="粘贴或输入角色内容"
        value={prompt}
      />

      <View style={styles.actions}>
        <PrimaryButton label="应用" onPress={() => void applyCurrentRole()} />
        <PrimaryButton label="保存" loading={saving} onPress={saveReusableRoleCard} variant="outline" />
        <PrimaryButton label="跳过" onPress={() => void applyRoleCard(null)} variant="ghost" />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      {cards.length ? (
        <View style={styles.cardList}>
          <Text style={styles.sectionTitle}>已保存</Text>
          {cards.map((card) => (
            <Pressable
              accessibilityRole="button"
              key={card.id}
              onPress={() => {
                setName(card.name);
                setDescription(card.description ?? '');
                setPrompt(card.prompt);
              }}
              onLongPress={() => {
                void applyRoleCard(card.id);
              }}
              style={({ pressed }) => [styles.savedCard, pressed && styles.pressed]}
            >
              <Text style={styles.savedTitle}>{card.name}</Text>
              <Text numberOfLines={2} style={styles.caption}>{card.description ?? card.prompt}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
  },
  caption: {
    ...typography.textStyles.caption,
  },
  actions: {
    gap: rhythm.inlineGap,
  },
  status: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  cardList: {
    gap: rhythm.listCardGap,
  },
  savedCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  pressed: {
    opacity: 0.78,
  },
  savedTitle: {
    ...typography.textStyles.bodyStrong,
  },
});
