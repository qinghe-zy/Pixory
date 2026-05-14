import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { FormInputRow } from '../components/FormInputRow';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { listRoleCards, saveRoleCard } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiRoleCardEditorScreenProps {
  space: PixorySpace;
  roleCardId?: string;
  onBack: () => void;
  onApplyToSession: () => void;
}

export function AiRoleCardEditorScreen({ space, roleCardId, onBack, onApplyToSession }: AiRoleCardEditorScreenProps) {
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
      setStatus('请先填写角色描述。');
      return;
    }
    setSaving(true);
    try {
      await saveRoleCard({
        description,
        name: name.trim() || '未命名角色卡',
        prompt,
        space,
      });
      setStatus('角色卡已保存，可在当前空间复用。');
      await loadCards();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  function applyCurrentRole() {
    if (!prompt.trim()) {
      setStatus('未填写角色描述，将继续使用默认角色。');
      onApplyToSession();
      return;
    }
    setStatus('已应用到当前会话。');
    onApplyToSession();
  }

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      onBack={onBack}
      scrollable
      subtitle={`${spaceLabel}${roleCardId != null ? ` · 角色卡 ${roleCardId}` : ''}`}
      title="角色卡"
    >
      <ContentCard>
        <Text style={styles.sectionTitle}>默认角色</Text>
        <Text style={styles.caption}>不配置角色卡也可以直接聊天；默认角色会保持 Pixory 的本地、安全和资料边界。</Text>
      </ContentCard>

      <FormInputRow
        label="角色卡名称"
        onChangeText={setName}
        placeholder="例如：品牌设定整理助手"
        value={name}
      />
      <FormInputRow
        hint="用于在列表中快速识别，可留空。"
        label="简短说明"
        onChangeText={setDescription}
        placeholder="这个角色卡适合什么场景"
        value={description}
      />
      <FormTextareaRow
        hint="支持粘贴长角色描述、语气要求、禁区、输出格式和素材整理规则。"
        label="角色描述"
        minHeight={240}
        onChangeText={setPrompt}
        placeholder="粘贴或输入完整角色描述"
        value={prompt}
      />

      <View style={styles.actions}>
        <PrimaryButton label="应用到当前会话" onPress={applyCurrentRole} />
        <PrimaryButton label="保存为可复用角色卡" loading={saving} onPress={saveReusableRoleCard} variant="outline" />
        <PrimaryButton label="跳过，使用默认角色" onPress={onApplyToSession} variant="ghost" />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      {cards.length ? (
        <View style={styles.cardList}>
          <Text style={styles.sectionTitle}>已保存角色卡</Text>
          {cards.map((card) => (
            <Pressable
              accessibilityRole="button"
              key={card.id}
              onPress={() => {
                setName(card.name);
                setDescription(card.description ?? '');
                setPrompt(card.prompt);
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
