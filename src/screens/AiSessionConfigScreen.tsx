import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { FilterChip } from '../components/FilterChip';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { MATERIAL_SESSION_RULES } from '../ai/aiConstants';
import type { AiBoundaryMode, AiContextType } from '../ai/types';
import { colors, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiSessionConfigScreenProps {
  space: PixorySpace;
  threadId?: string;
  contextTitle?: string;
  contextType?: AiContextType;
  onBack: () => void;
  onOpenProviderSettings: () => void;
  onOpenModelPicker: () => void;
  onOpenRoleCardEditor: () => void;
  onStartChat: () => void;
}

const BOUNDARY_MODES: Array<{ value: AiBoundaryMode; label: string; hint: string }> = [
  { value: 'free', label: '自由', hint: '普通讨论，不强制引用资料。' },
  { value: 'prefer_material', label: '优先资料', hint: '优先使用本地资料，允许说明资料不足。' },
  { value: 'strict_material', label: '仅限资料', hint: '只回答资料中能支持的内容。' },
];

export function AiSessionConfigScreen({
  space,
  threadId,
  contextTitle,
  contextType = 'normal',
  onBack,
  onOpenProviderSettings,
  onOpenModelPicker,
  onOpenRoleCardEditor,
  onStartChat,
}: AiSessionConfigScreenProps) {
  const [systemPrompt, setSystemPrompt] = useState('你是 Pixory 的本地素材整理助手，回答要简洁、可靠，并尊重当前空间的数据边界。');
  const [roleCardSummary, setRoleCardSummary] = useState('默认角色');
  const [boundaryMode, setBoundaryMode] = useState<AiBoundaryMode>(contextType === 'normal' ? 'free' : 'prefer_material');
  const isMaterialBound = contextType !== 'normal';
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const selectedBoundary = useMemo(
    () => BOUNDARY_MODES.find((item) => item.value === boundaryMode) ?? BOUNDARY_MODES[0],
    [boundaryMode]
  );

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      onBack={onBack}
      scrollable
      subtitle={`${spaceLabel}${threadId != null ? ` · 会话 ${threadId}` : ''}`}
      title="会话设置"
    >
      <ContentCard>
        <Text style={styles.sectionTitle}>当前上下文</Text>
        <Text style={styles.body}>{contextTitle ?? '普通聊天'}</Text>
        <Text style={styles.caption}>{isMaterialBound ? '资料规则会被固定写入提示词快照。' : '普通聊天不显示 Pixory 材料规则。'}</Text>
      </ContentCard>

      <FormTextareaRow
        hint="会写入 system prompt，可针对语气、输出格式和整理偏好调整。"
        label="系统提示词"
        minHeight={132}
        onChangeText={setSystemPrompt}
        placeholder="输入系统提示词"
        value={systemPrompt}
      />

      <ContentCard>
        <Text style={styles.sectionTitle}>角色卡</Text>
        <Text style={styles.body}>{roleCardSummary}</Text>
        <View style={styles.inlineButtons}>
          <PrimaryButton label="选择或编辑角色卡" onPress={onOpenRoleCardEditor} variant="outline" />
          <PrimaryButton label="跳过角色卡" onPress={() => setRoleCardSummary('默认角色')} variant="ghost" />
        </View>
      </ContentCard>

      <ContentCard>
        <Text style={styles.sectionTitle}>模型</Text>
        <Text style={styles.caption}>默认使用提供商配置里的聊天模型，也可以为当前会话单独选择。</Text>
        <View style={styles.inlineButtons}>
          <PrimaryButton label="选择模型" onPress={onOpenModelPicker} variant="outline" />
          <PrimaryButton label="提供商设置" onPress={onOpenProviderSettings} variant="ghost" />
        </View>
      </ContentCard>

      <ContentCard>
        <Text style={styles.sectionTitle}>边界模式</Text>
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
        <Text style={styles.caption}>{selectedBoundary.hint}</Text>
      </ContentCard>

      {isMaterialBound ? (
        <ContentCard>
          <Text style={styles.sectionTitle}>受保护材料规则</Text>
          <Text style={styles.ruleText}>{MATERIAL_SESSION_RULES}</Text>
        </ContentCard>
      ) : null}

      <PrimaryButton label="开始聊天" onPress={onStartChat} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  ruleText: {
    ...typography.textStyles.caption,
    backgroundColor: colors.background.secondary,
    color: colors.text.secondary,
    padding: spacing[3],
  },
});
