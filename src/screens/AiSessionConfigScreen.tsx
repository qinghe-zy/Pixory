import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { FilterChip } from '../components/FilterChip';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
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
  onOpenModelPicker: () => void;
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
  onOpenModelPicker,
  onOpenRoleCardEditor,
  onStartChat,
}: AiSessionConfigScreenProps) {
  const [systemPrompt, setSystemPrompt] = useState('你是 Pixory 的本地素材整理助手，回答要简洁、可靠，并尊重当前空间的数据边界。');
  const [roleCardSummary, setRoleCardSummary] = useState('默认角色');
  const [boundaryMode, setBoundaryMode] = useState<AiBoundaryMode>(contextType === 'normal' ? 'free' : 'prefer_material');
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

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
        <Text style={styles.sectionTitle}>当前对话</Text>
        <Text style={styles.body}>{contextTitle ?? '普通聊天'}</Text>
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
        <View style={styles.inlineButtons}>
          <PrimaryButton label="选择或编辑角色卡" onPress={onOpenRoleCardEditor} variant="outline" />
          <PrimaryButton label="跳过角色卡" onPress={() => setRoleCardSummary('默认角色')} variant="ghost" />
        </View>
      </ContentCard>

      <ContentCard>
        <Text style={styles.sectionTitle}>模型</Text>
        <View style={styles.inlineButtons}>
          <PrimaryButton label="选择模型" onPress={onOpenModelPicker} variant="outline" />
          <PrimaryButton label="账号" onPress={onOpenProviderSettings} variant="ghost" />
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
  inlineButtons: {
    gap: rhythm.inlineGap,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
});
