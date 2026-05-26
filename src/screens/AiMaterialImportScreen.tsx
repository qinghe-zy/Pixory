import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightFeedbackBanner, type FeedbackTone } from '../components/ai/AiLightFeedbackBanner';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import {
  createKnowledgeBase,
  generateIpMaterial,
  generateThreadIpSnapshotMaterial,
  importPickedDocuments,
  importPickedDocumentsToThread,
  importManualTextMaterial,
  importManualTextToThread,
  listKnowledgeBases,
} from '../ai/aiDocumentService';
import { ipRepository, runWithDatabaseSpace, type IpListItem, type PixorySpace } from '../database';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
import { metrics, radius, rhythm, spacing, typography } from '../design/tokens';

interface AiMaterialImportScreenProps {
  space: PixorySpace;
  knowledgeBaseId?: string;
  threadId?: string;
  onBack: () => void;
}

interface ImportFeedback {
  message: string;
  tone: FeedbackTone;
}

export function AiMaterialImportScreen({ space, knowledgeBaseId, threadId, onBack }: AiMaterialImportScreenProps) {
  const [title, setTitle] = useState('角色资料');
  const [text, setText] = useState('');
  const [targetKnowledgeBaseId, setTargetKnowledgeBaseId] = useState<string | undefined>(knowledgeBaseId);
  const [ips, setIps] = useState<IpListItem[]>([]);
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const targetLabel = threadId ? '当前会话资料库' : '总资料库';

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
    if (threadId) {
      const document = await importManualTextToThread({
        space,
        text,
        threadId,
        title: title.trim() || '手动材料',
      });
      return feedbackForDocument(document, '已导入');
    }
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
      multiple: true,
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
    const assets = result.assets.map((asset) => ({
      fileName: asset.name ?? 'material.txt',
      fileSize: asset.size ?? null,
      mimeType: asset.mimeType ?? null,
      sourceUri: asset.uri,
    }));
    const documents = threadId
      ? await importPickedDocumentsToThread({
          assets,
          space,
          threadId,
        })
      : await importPickedDocuments({
          assets,
          ownerId: await ensureKnowledgeBaseId(),
          ownerType: 'knowledge_base',
          space,
        });
    if (documents.length === 1) {
      return feedbackForDocument(documents[0], '已导入');
    }
    const failed = documents.filter((document) => document.parserStatus === 'failed').length;
    if (failed) {
      return {
        message: `已导入 ${documents.length} 个文件，其中 ${failed} 个没有解析出可用于问答的文本，可在阅读器中查看原文件。`,
        tone: 'warning',
      };
    }
    return {
      message: `已导入 ${documents.length} 个文件，已可用于问答。`,
      tone: 'success',
    };
  }

  async function importFromIp(): Promise<ImportFeedback> {
    if (selectedIpId == null) {
      return { message: '请先选择一个 IP。', tone: 'warning' };
    }
    const document = threadId
      ? await generateThreadIpSnapshotMaterial({
        ipId: selectedIpId,
        space,
        threadId,
        title: title.trim() || 'IP 信息',
      })
      : await generateIpMaterial({
        ipId: selectedIpId,
        space,
        title: title.trim() || 'IP 结构化资料',
      });
    return feedbackForDocument(document, '已生成');
  }

  return (
    <AiLightScaffold
      loading={busy}
      onBack={onBack}
      scrollable
      subtitle={`${spaceLabel} · ${targetLabel}`}
      title="导入材料"
    >
      <View style={styles.contentStack}>
        {feedback ? <AiLightFeedbackBanner message={feedback.message} tone={feedback.tone} /> : null}

        <AiLightCard>
          <Text style={styles.sectionTitle}>手动文本</Text>
          <TextInput
            onChangeText={setTitle}
            placeholder="材料标题"
            placeholderTextColor={aiLightColors.mutedSoft}
            selectionColor={aiLightColors.coral}
            style={styles.input}
            value={title}
          />
          <TextInput
            multiline
            onChangeText={setText}
            placeholder="粘贴角色资料、研究记录或标签体系"
            placeholderTextColor={aiLightColors.mutedSoft}
            selectionColor={aiLightColors.coral}
            style={[styles.input, styles.textarea]}
            textAlignVertical="top"
            value={text}
          />
          <AiLightButton disabled={!text.trim()} label="导入手动文本" onPress={() => void runImport(importManualText)} />
        </AiLightCard>

        <AiLightCard>
          <Text style={styles.sectionTitle}>从系统文件导入</Text>
          <AiLightButton label="选择文件导入" onPress={() => void runImport(pickAndImportDocument)} variant="outline" />
        </AiLightCard>

        <AiLightCard>
          <Text style={styles.sectionTitle}>从 IP 导入</Text>
          <View style={styles.ipChoiceList}>
            {ips.map((ip) => (
              <Text key={ip.id} onPress={() => setSelectedIpId(ip.id)} style={[styles.ipChoice, selectedIpId === ip.id && styles.selectedIpChoice]}>
                {selectedIpId === ip.id ? '● ' : '○ '}{ip.name}
              </Text>
            ))}
          </View>
          <AiLightButton disabled={selectedIpId == null} label="从选中 IP 生成材料" onPress={() => void runImport(importFromIp)} variant="outline" />
        </AiLightCard>
      </View>
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: rhythm.entryCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: metrics.minTouchSize,
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
    color: aiLightColors.muted,
  },
  selectedIpChoice: {
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
});
