import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightChip } from '../components/ai/AiLightChip';
import { AiLightFeedbackBanner, type FeedbackTone } from '../components/ai/AiLightFeedbackBanner';
import { AiLightTextareaRow } from '../components/ai/AiLightField';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { applyRoleCardToThread, deleteAiThreads, loadThreadSessionConfig, renameAiThread, updateAiThreadSessionConfig } from '../ai/aiChatService';
import { DEFAULT_AI_ROLE_PROMPT } from '../ai/aiConstants';
import type { AiBoundaryMode, AiContextType, AiRoleInstructionWeight } from '../ai/types';
import { radius, rhythm, spacing, typography } from '../design/tokens';
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
  onCurrentThreadDeleted?: () => void;
}

const BOUNDARY_MODES: Array<{ value: AiBoundaryMode; label: string }> = [
  { value: 'free', label: '自由' },
  { value: 'prefer_material', label: '优先资料' },
  { value: 'strict_material', label: '仅限资料' },
];

const ROLE_INSTRUCTION_WEIGHTS: Array<{ value: AiRoleInstructionWeight; label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'high', label: '高' },
];

function getDefaultSystemPrompt(contextType: AiContextType): string {
  return contextType === 'normal' ? '' : DEFAULT_AI_ROLE_PROMPT;
}

export function AiSessionConfigScreen({
  space,
  threadId,
  contextTitle,
  contextType = 'normal',
  onBack,
  onOpenProviderSettings,
  onOpenRoleCardEditor,
  onStartChat,
  onCurrentThreadDeleted,
}: AiSessionConfigScreenProps) {
  const fallbackThreadTitle = contextTitle ?? '普通聊天';
  const [threadTitle, setThreadTitle] = useState(fallbackThreadTitle);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [renameValue, setRenameValue] = useState(fallbackThreadTitle);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(getDefaultSystemPrompt(contextType));
  const [roleCardSummary, setRoleCardSummary] = useState('默认角色');
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [boundaryMode, setBoundaryMode] = useState<AiBoundaryMode>(contextType === 'normal' ? 'free' : 'prefer_material');
  const [roleInstructionWeight, setRoleInstructionWeight] = useState<AiRoleInstructionWeight>('default');
  const [deepMemoryEnabled, setDeepMemoryEnabled] = useState(false);
  const [advancedPromptVisible, setAdvancedPromptVisible] = useState(contextType !== 'normal');
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone; title?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const promptConfigured = systemPrompt.trim().length > 0;
  const promptSummary = promptConfigured ? `已配置 ${systemPrompt.trim().length} 字` : '未配置';
  const avatarSummary = avatarEnabled ? (avatarUri ? '头像已启用' : '头像已启用，使用默认标记') : '无头像';

  const reloadConfig = useCallback(async () => {
    if (!threadId) {
      setThreadTitle(fallbackThreadTitle);
      setRenameValue(fallbackThreadTitle);
      setSystemPrompt(getDefaultSystemPrompt(contextType));
      setRoleInstructionWeight('default');
      setDeepMemoryEnabled(false);
      setAdvancedPromptVisible(contextType !== 'normal');
      return;
    }
    const config = await loadThreadSessionConfig(space, threadId);
    if (!config) {
      setStatus({ message: '没有找到当前会话。', tone: 'error' });
      return;
    }
    setThreadTitle(config.thread.title);
    setRenameValue(config.thread.title);
    setSystemPrompt(config.thread.systemPrompt);
    setRoleInstructionWeight(config.thread.roleInstructionWeight);
    setDeepMemoryEnabled(config.deepMemoryEnabled);
    setAdvancedPromptVisible(config.thread.systemPrompt.trim().length > 0 || contextType !== 'normal');
    setBoundaryMode(config.thread.boundaryMode);
    setRoleCardSummary(config.roleCardName ?? '默认角色');
    setAvatarEnabled(config.avatar.avatarEnabled);
    setAvatarUri(config.avatar.avatarUri);
  }, [contextType, fallbackThreadTitle, space, threadId]);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardBottomInset(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardBottomInset(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  function handleSystemPromptFocus() {
    if (Platform.OS !== 'android') {
      return;
    }
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }

  async function saveSessionSettings(): Promise<boolean> {
    if (!threadId) {
      setStatus({ message: '请先进入一个会话后再保存设置。', tone: 'warning' });
      return false;
    }
    setSaving(true);
    setStatus({ message: '正在保存会话设置...', tone: 'info', title: '保存中' });
    try {
      const updated = await updateAiThreadSessionConfig({
        boundaryMode,
        avatarEnabled,
        deepMemoryEnabled,
        roleInstructionWeight,
        space,
        systemPrompt,
        threadId,
      });
      if (!updated) {
        throw new Error('没有找到当前会话，设置未保存。');
      }
      setStatus({ message: '角色指令和回答范围已应用到当前会话。', tone: 'success', title: '设置已保存' });
      return true;
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '保存失败', tone: 'error', title: '保存失败' });
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

  async function confirmRenameThread() {
    if (!threadId) {
      return;
    }
    setSaving(true);
    try {
      const updated = await renameAiThread(space, threadId, renameValue);
      if (!updated) {
        throw new Error('没有找到当前会话，名称未保存。');
      }
      setThreadTitle(updated.title);
      setRenameValue(updated.title);
      setRenameDialogVisible(false);
      setStatus({ message: '当前会话已重命名。', tone: 'success', title: '名称已更新' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '重命名失败', tone: 'error', title: '重命名失败' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteCurrentThread() {
    if (!threadId) {
      return;
    }
    setSaving(true);
    try {
      const count = await deleteAiThreads(space, [threadId]);
      if (count < 1) {
        throw new Error('没有找到当前会话，未删除。');
      }
      setDeleteDialogVisible(false);
      if (onCurrentThreadDeleted) {
        onCurrentThreadDeleted();
      } else {
        onBack();
      }
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '删除失败', tone: 'error', title: '删除失败' });
    } finally {
      setSaving(false);
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
    <>
      <AiLightScaffold
        contentContainerStyle={keyboardBottomInset ? { paddingBottom: keyboardBottomInset + spacing[8] } : undefined}
        onBack={onBack}
        scrollable
        scrollViewRef={scrollViewRef}
        subtitle={`${spaceLabel}${threadId != null ? ` · 会话 ${threadId}` : ''}`}
        title="会话设置"
      >
        <View style={styles.content}>
          <AiLightCard>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryCopy}>
                <Text style={styles.sectionTitle}>当前会话</Text>
                <View style={styles.threadTitleRow}>
                  <Text numberOfLines={1} style={[styles.body, styles.threadTitleText]}>{threadTitle}</Text>
                  <Pressable
                    accessibilityLabel="重命名当前会话"
                    accessibilityRole="button"
                    disabled={!threadId || saving}
                    hitSlop={spacing[2]}
                    onPress={() => {
                      setRenameValue(threadTitle);
                      setRenameDialogVisible(true);
                    }}
                    style={({ pressed }) => [styles.titleIconButton, (!threadId || saving) && styles.disabled, pressed && threadId && !saving && styles.pressed]}
                  >
                    <Ionicons color={aiLightColors.coralActive} name="create-outline" size={15} />
                  </Pressable>
                </View>
              </View>
              <Pressable accessibilityRole="button" onPress={onOpenProviderSettings} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
                <Text style={styles.textActionLabel}>模型账号</Text>
              </Pressable>
            </View>
            <View style={styles.summaryMetaRow}>
              <Text style={styles.metaPill}>{spaceLabel}</Text>
              <Text style={styles.metaPill}>{BOUNDARY_MODES.find((mode) => mode.value === boundaryMode)?.label ?? '自由'}</Text>
              <Text numberOfLines={1} style={styles.metaPill}>{roleCardSummary}</Text>
            </View>
          </AiLightCard>

        <AiLightCard>
          <View style={styles.roleRow}>
            <View style={styles.summaryCopy}>
              <Text style={styles.sectionTitle}>角色显示</Text>
              <Text numberOfLines={1} style={styles.body}>{roleCardSummary}</Text>
              <Text style={styles.caption}>{avatarSummary}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onOpenRoleCardEditor} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
              <Text style={styles.textActionLabel}>更换</Text>
            </Pressable>
          </View>
          <View style={styles.roleActions}>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: avatarEnabled }} onPress={() => setAvatarEnabled((current) => !current)} style={({ pressed }) => [styles.compactButton, avatarEnabled && styles.compactButtonActive, pressed && styles.pressed]}>
              <Text style={[styles.compactButtonText, avatarEnabled && styles.compactButtonTextActive]}>{avatarEnabled ? '头像开启' : '头像关闭'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void clearRoleCard()} style={({ pressed }) => [styles.compactButton, pressed && styles.pressed]}>
              <Text style={styles.compactButtonText}>默认角色</Text>
            </Pressable>
          </View>
        </AiLightCard>

        <AiLightCard>
          <Text style={styles.sectionTitle}>回答范围</Text>
          <View style={styles.chips}>
            {BOUNDARY_MODES.map((mode) => (
              <AiLightChip
                active={boundaryMode === mode.value}
                key={mode.value}
                label={mode.label}
                onPress={() => setBoundaryMode(mode.value)}
              />
            ))}
          </View>
        </AiLightCard>

        <AiLightCard>
          <View style={styles.memoryRow}>
            <View style={styles.summaryCopy}>
              <Text style={styles.sectionTitle}>深度记忆</Text>
              <Text style={styles.caption}>开启后在本地保存会话摘要和可复用记忆，用于长对话回看。</Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: deepMemoryEnabled }}
              onPress={() => setDeepMemoryEnabled((current) => !current)}
              style={({ pressed }) => [styles.memorySwitch, deepMemoryEnabled && styles.memorySwitchActive, pressed && styles.pressed]}
            >
              <Text style={[styles.memorySwitchText, deepMemoryEnabled && styles.memorySwitchTextActive]}>{deepMemoryEnabled ? '开启' : '关闭'}</Text>
            </Pressable>
          </View>
          {deepMemoryEnabled ? (
            <Text style={styles.caption}>记忆只作为背景参考，不会覆盖当前最新要求、角色指令或资料事实。</Text>
          ) : null}
        </AiLightCard>

        <AiLightCard>
          <Pressable accessibilityRole="button" onPress={() => setAdvancedPromptVisible((current) => !current)} style={({ pressed }) => [styles.advancedHeader, pressed && styles.pressed]}>
            <View style={styles.summaryCopy}>
              <Text style={styles.sectionTitle}>高级角色指令</Text>
              <Text style={styles.caption}>{promptSummary}</Text>
            </View>
            <Text style={styles.textActionLabel}>{advancedPromptVisible ? '收起' : '展开'}</Text>
          </Pressable>
          {advancedPromptVisible ? (
            <View style={styles.advancedContent}>
              <View style={styles.weightRow}>
                <Text style={styles.caption}>权重等级</Text>
                <View style={styles.weightChips}>
                  {ROLE_INSTRUCTION_WEIGHTS.map((item) => (
                    <AiLightChip
                      active={roleInstructionWeight === item.value}
                      dense
                      key={item.value}
                      label={item.label}
                      onPress={() => setRoleInstructionWeight(item.value)}
                    />
                  ))}
                </View>
              </View>
              <AiLightTextareaRow
                label="角色指令"
                minHeight={104}
                onChangeText={setSystemPrompt}
                onFocus={handleSystemPromptFocus}
                placeholder={contextType === 'normal' ? '普通聊天默认不配置角色指令，可按需填写。' : '输入角色指令'}
                value={systemPrompt}
              />
            </View>
          ) : null}
        </AiLightCard>

          <View style={styles.actions}>
            <AiLightButton label="保存并开始聊天" loading={saving} onPress={() => void saveAndStartChat()} />
            <AiLightButton label="仅保存设置" loading={saving} onPress={() => void saveSessionSettings()} variant="ghost" />
            <Pressable
              accessibilityRole="button"
              disabled={!threadId || saving}
              onPress={() => setDeleteDialogVisible(true)}
              style={({ pressed }) => [styles.deleteButton, (!threadId || saving) && styles.disabled, pressed && threadId && !saving && styles.pressed]}
            >
              <Ionicons color={aiLightColors.coralActive} name="trash-outline" size={17} />
              <Text style={styles.deleteButtonText}>删除当前会话</Text>
            </Pressable>
          </View>
          {status ? <AiLightFeedbackBanner message={status.message} title={status.title} tone={status.tone} /> : null}
        </View>
      </AiLightScaffold>

      <AppDialog
        message="修改后会同步显示在聊天页、最近继续和历史列表。"
        onClose={() => {
          if (!saving) {
            setRenameDialogVisible(false);
          }
        }}
        onPrimary={() => void confirmRenameThread()}
        primaryDisabled={saving || !renameValue.trim()}
        primaryLabel={saving ? '正在保存' : '保存'}
        title="重命名当前会话"
        visible={renameDialogVisible}
      >
        <TextInput
          editable={!saving}
          onChangeText={setRenameValue}
          placeholder="会话名称"
          placeholderTextColor={aiLightColors.mutedSoft}
          selectionColor={aiLightColors.coral}
          style={styles.dialogInput}
          value={renameValue}
        />
      </AppDialog>

      <AppDialog
        danger
        message="删除后会移除当前会话及其聊天记录。此操作不能撤销。"
        onClose={() => {
          if (!saving) {
            setDeleteDialogVisible(false);
          }
        }}
        onPrimary={() => void confirmDeleteCurrentThread()}
        primaryDisabled={saving || !threadId}
        primaryLabel={saving ? '正在删除' : '删除'}
        title="删除当前会话"
        visible={deleteDialogVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: rhythm.listCardGap,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  summaryCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  threadTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    minWidth: 0,
  },
  threadTitleText: {
    flex: 1,
    minWidth: 0,
  },
  titleIconButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  summaryMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  metaPill: {
    ...typography.textStyles.caption,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.muted,
    maxWidth: '100%',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  body: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  caption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  roleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  roleActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  memoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  memorySwitch: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 34,
    minWidth: 58,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  memorySwitchActive: {
    backgroundColor: aiLightColors.coral,
    borderColor: aiLightColors.coral,
  },
  memorySwitchText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '700',
  },
  memorySwitchTextActive: {
    color: aiLightColors.onDark,
  },
  textAction: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  textActionLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  compactButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  compactButtonActive: {
    backgroundColor: aiLightColors.coral,
    borderColor: aiLightColors.coral,
  },
  compactButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  compactButtonTextActive: {
    color: aiLightColors.onDark,
  },
  advancedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  advancedContent: {
    gap: rhythm.cardContentGap,
  },
  weightRow: {
    gap: rhythm.microGap,
  },
  weightChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  actions: {
    gap: rhythm.listCardGap,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: spacing[10],
    paddingHorizontal: spacing[4],
  },
  deleteButtonText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  dialogInput: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: spacing[10],
    paddingHorizontal: spacing[3],
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.48,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
});
