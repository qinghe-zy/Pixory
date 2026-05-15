import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { FilterChip } from '../components/FilterChip';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { applyRoleCardToThread, loadThreadSessionConfig, updateAiThreadSessionConfig } from '../ai/aiChatService';
import type { AiBoundaryMode, AiContextType } from '../ai/types';
import { rhythm, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiSessionConfigScreenProps {
  space: PixorySpace;
  threadId?: string;
  contextTitle?: string;
  contextType?: AiContextType;
  onBack: () => void;
  onOpenProviderSettings: () => void;
  onOpenRoleCardEditor: () => void;
  onStartChat: () => void;
}

const BOUNDARY_MODES: Array<{ value: AiBoundaryMode; label: string }> = [
  { value: 'free', label: '自由' },
  { value: 'prefer_material', label: '优先资料' },
  { value: 'strict_material', label: '仅限资料' },
];

export function AiSessionConfigScreen({
  space,
  threadId,
  contextTitle,
  contextType = 'normal',
  onBack,
  onOpenProviderSettings,
  onOpenRoleCardEditor,
  onStartChat,
}: AiSessionConfigScreenProps) {
  const [systemPrompt, setSystemPrompt] = useState('你是 Pixory 的本地素材整理助手，回答要简洁、可靠，并尊重当前空间的数据边界。');
  const [roleCardSummary, setRoleCardSummary] = useState('默认角色');
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [boundaryMode, setBoundaryMode] = useState<AiBoundaryMode>(contextType === 'normal' ? 'free' : 'prefer_material');
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone; title?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  const reloadConfig = useCallback(async () => {
    if (!threadId) {
      return;
    }
    const config = await loadThreadSessionConfig(space, threadId);
    if (!config) {
      setStatus({ message: '没有找到当前会话。', tone: 'error' });
      return;
    }
    setSystemPrompt(config.thread.systemPrompt);
    setBoundaryMode(config.thread.boundaryMode);
    setRoleCardSummary(config.roleCardName ?? '默认角色');
    setAvatarEnabled(config.avatar.avatarEnabled);
    setAvatarUri(config.avatar.avatarUri);
  }, [space, threadId]);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  async function saveSessionSettings(): Promise<boolean> {
    if (!threadId) {
      setStatus({ message: '请先进入一个会话后再保存设置。', tone: 'warning' });
      return false;
    }
    setSaving(true);
    setStatus(null);
    try {
      await updateAiThreadSessionConfig({
        boundaryMode,
        avatarEnabled,
        space,
        systemPrompt,
        threadId,
      });
      setStatus({ message: '角色指令和回答范围已应用到当前会话。', tone: 'success', title: '设置已保存' });
      return true;
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndStartChat() {
    const saved = await saveSessionSettings();
    if (saved) {
      onStartChat();
    }
  }

  async function clearRoleCard() {
    if (!threadId) {
      setRoleCardSummary('默认角色');
      return;
    }
    await applyRoleCardToThread({ roleCardId: null, space, threadId });
    setRoleCardSummary('默认角色');
    setAvatarEnabled(false);
    setAvatarUri(null);
    setStatus({ message: '当前会话已恢复为 Pixory 默认角色。', tone: 'success', title: '角色已重置' });
    await reloadConfig();
  }

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      onBack={onBack}
      scrollable
      subtitle={`${spaceLabel}${threadId != null ? ` · 会话 ${threadId}` : ''}`}
      title="会话设置"
    >
      <View style={styles.content}>
        <ContentCard>
          <Text style={styles.sectionTitle}>当前对话</Text>
          <Text style={styles.body}>{contextTitle ?? '普通聊天'}</Text>
          <PrimaryButton label="模型账号" onPress={onOpenProviderSettings} variant="outline" />
        </ContentCard>

        <FormTextareaRow
          label="角色指令"
          minHeight={132}
          onChangeText={setSystemPrompt}
          placeholder="输入角色指令"
          value={systemPrompt}
        />

        <ContentCard>
          <Text style={styles.sectionTitle}>角色卡</Text>
          <Text style={styles.body}>{roleCardSummary}</Text>
          <Text style={styles.caption}>{avatarEnabled ? (avatarUri ? '聊天回复会显示当前角色头像。' : '已启用头像，角色卡还没有选择头像时会显示默认标记。') : '聊天回复保持无头像显示。'}</Text>
          <View style={styles.inlineButtons}>
            <PrimaryButton label={avatarEnabled ? '隐藏头像' : '启用头像'} onPress={() => setAvatarEnabled((current) => !current)} variant="outline" />
            <PrimaryButton label="选择或编辑角色卡" onPress={onOpenRoleCardEditor} variant="outline" />
            <PrimaryButton label="使用默认角色" onPress={() => void clearRoleCard()} variant="ghost" />
          </View>
        </ContentCard>

        <ContentCard>
          <Text style={styles.sectionTitle}>回答范围</Text>
          <View style={styles.chips}>
            {BOUNDARY_MODES.map((mode) => (
              <FilterChip
                active={boundaryMode === mode.value}
                key={mode.value}
                label={mode.label}
                onPress={() => setBoundaryMode(mode.value)}
              />
            ))}
          </View>
        </ContentCard>

        <View style={styles.actions}>
          <PrimaryButton label="保存设置" loading={saving} onPress={() => void saveSessionSettings()} variant="outline" />
          <PrimaryButton label="开始聊天" loading={saving} onPress={() => void saveAndStartChat()} />
        </View>
        {status ? <FeedbackBanner message={status.message} title={status.title} tone={status.tone} /> : null}
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: rhythm.listCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
  },
  body: {
    ...typography.textStyles.body,
  },
  caption: {
    ...typography.textStyles.caption,
  },
  inlineButtons: {
    gap: rhythm.inlineGap,
  },
  actions: {
    gap: rhythm.listCardGap,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
});
