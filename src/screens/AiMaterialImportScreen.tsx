import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import {
  createKnowledgeBase,
  generateIpMaterial,
  importManualTextMaterial,
  importPickedDocument,
  listKnowledgeBases,
} from '../ai/aiDocumentService';
import { ipRepository, runWithDatabaseSpace, type IpListItem, type PixorySpace } from '../database';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';

interface AiMaterialImportScreenProps {
  space: PixorySpace;
  knowledgeBaseId?: string;
  onBack: () => void;
}

type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

interface ImportFeedback {
  message: string;
  tone: FeedbackTone;
}

export function AiMaterialImportScreen({ space, knowledgeBaseId, onBack }: AiMaterialImportScreenProps) {
  const [title, setTitle] = useState('角色资料');
  const [text, setText] = useState('');
  const [targetKnowledgeBaseId, setTargetKnowledgeBaseId] = useState<string | undefined>(knowledgeBaseId);
  const [ips, setIps] = useState<IpListItem[]>([]);
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  useEffect(() => {
    void runWithDatabaseSpace(space, (db) => ipRepository.findLibraryItems(db)).then((nextIps) => {
      setIps(nextIps);
      setSelectedIpId(nextIps[0]?.id ?? null);
    });
  }, [space]);

  async function ensureKnowledgeBaseId(): Promise<string> {
    if (targetKnowledgeBaseId) {
      return targetKnowledgeBaseId;
    }
    const existing = await listKnowledgeBases(space);
    const found = existing[0];
    if (found) {
      setTargetKnowledgeBaseId(found.id);
      return found.id;
    }
    const created = await createKnowledgeBase({
      category: 'general',
      description: 'Pixory AI 默认本地知识库',
      name: '默认知识库',
      space,
    });
    setTargetKnowledgeBaseId(created.id);
    return created.id;
  }

  async function runImport(action: () => Promise<ImportFeedback>) {
    setBusy(true);
    setFeedback({ message: '正在导入材料...', tone: 'info' });
    try {
      setFeedback(await action());
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : '导入失败', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function feedbackForDocument(document: AiDocumentRecord, verb: '已导入' | '已生成'): ImportFeedback {
    if (document.parserStatus === 'failed') {
      return {
        message: `${verb}：${document.title}。${document.parserError ?? '材料已保存，但没有解析出可用于问答的文本。'}`,
        tone: 'warning',
      };
    }
    return {
      message: `${verb}：${document.title}，已可用于问答。`,
      tone: 'success',
    };
  }

  async function importManualText(): Promise<ImportFeedback> {
    const ownerId = await ensureKnowledgeBaseId();
    const document = await importManualTextMaterial({
      ownerId,
      ownerType: 'knowledge_base',
      space,
      text,
      title: title.trim() || '手动材料',
    });
    return feedbackForDocument(document, '已导入');
  }

  async function pickAndImportDocument(): Promise<ImportFeedback> {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: [
        'text/plain',
        'text/markdown',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '*/*',
      ],
    });
    if (result.canceled) {
      return { message: '已取消选择。', tone: 'info' };
    }
    const asset = result.assets[0];
    const ownerId = await ensureKnowledgeBaseId();
    const document = await importPickedDocument({
      fileName: asset.name ?? 'material.txt',
      fileSize: asset.size ?? null,
      mimeType: asset.mimeType ?? null,
      ownerId,
      ownerType: 'knowledge_base',
      sourceUri: asset.uri,
      space,
    });
    return feedbackForDocument(document, '已导入');
  }

  async function importFromIp(): Promise<ImportFeedback> {
    if (selectedIpId == null) {
      return { message: '请先选择一个 IP。', tone: 'warning' };
    }
    const document = await generateIpMaterial({
      ipId: selectedIpId,
      space,
      title: title.trim() || 'IP 结构化资料',
    });
    return feedbackForDocument(document, '已生成');
  }

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      loading={busy}
      onBack={onBack}
      scrollable
      subtitle={spaceLabel}
      title="导入材料"
    >
      <View style={styles.contentStack}>
        {feedback ? (
          <View style={[styles.feedbackCard, feedback.tone === 'success' && styles.successFeedbackCard, feedback.tone === 'warning' && styles.warningFeedbackCard, feedback.tone === 'error' && styles.errorFeedbackCard]}>
            <Text style={[styles.feedbackText, feedback.tone === 'success' && styles.successFeedbackText, feedback.tone === 'warning' && styles.warningFeedbackText, feedback.tone === 'error' && styles.errorFeedbackText]}>
              {feedback.message}
            </Text>
          </View>
        ) : null}

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>手动文本</Text>
          <TextInput
            onChangeText={setTitle}
            placeholder="材料标题"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={styles.input}
            value={title}
          />
          <TextInput
            multiline
            onChangeText={setText}
            placeholder="粘贴角色资料、研究记录或标签体系"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={[styles.input, styles.textarea]}
            textAlignVertical="top"
            value={text}
          />
          <PrimaryButton disabled={!text.trim()} label="导入手动文本" onPress={() => void runImport(importManualText)} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>文件材料</Text>
          <PrimaryButton label="选择文件导入" onPress={() => void runImport(pickAndImportDocument)} variant="outline" />
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>从已有 IP 生成</Text>
          <View style={styles.ipChoiceList}>
            {ips.map((ip) => (
              <Text key={ip.id} onPress={() => setSelectedIpId(ip.id)} style={[styles.ipChoice, selectedIpId === ip.id && styles.selectedIpChoice]}>
                {selectedIpId === ip.id ? '● ' : '○ '}{ip.name}
              </Text>
            ))}
          </View>
          <PrimaryButton disabled={selectedIpId == null} label="从选中 IP 生成材料" onPress={() => void runImport(importFromIp)} variant="outline" />
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: rhythm.entryCardGap,
  },
  feedbackCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  successFeedbackCard: {
    borderColor: colors.semantic.success,
  },
  warningFeedbackCard: {
    borderColor: colors.semantic.warning,
  },
  errorFeedbackCard: {
    borderColor: colors.semantic.danger,
  },
  feedbackText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  successFeedbackText: {
    color: colors.semantic.success,
  },
  warningFeedbackText: {
    color: colors.semantic.warning,
  },
  errorFeedbackText: {
    color: colors.semantic.danger,
  },
  panel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.fieldContentGap,
    padding: spacing[4],
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  textarea: {
    minHeight: 150,
  },
  ipChoiceList: {
    gap: rhythm.compactGridGap,
  },
  ipChoice: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
  },
  selectedIpChoice: {
    color: colors.primary.active,
    fontWeight: '600',
  },
});
