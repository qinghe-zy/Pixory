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
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';

interface AiMaterialImportScreenProps {
  space: PixorySpace;
  knowledgeBaseId?: string;
  onBack: () => void;
}

export function AiMaterialImportScreen({ space, knowledgeBaseId, onBack }: AiMaterialImportScreenProps) {
  const [title, setTitle] = useState('角色资料');
  const [text, setText] = useState('');
  const [targetKnowledgeBaseId, setTargetKnowledgeBaseId] = useState<string | undefined>(knowledgeBaseId);
  const [ips, setIps] = useState<IpListItem[]>([]);
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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

  async function runImport(action: () => Promise<string>) {
    setBusy(true);
    setStatus('处理中...');
    try {
      const message = await action();
      setStatus(message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入失败');
    } finally {
      setBusy(false);
    }
  }

  async function importManualText() {
    const ownerId = await ensureKnowledgeBaseId();
    const document = await importManualTextMaterial({
      ownerId,
      ownerType: 'knowledge_base',
      space,
      text,
      title: title.trim() || '手动材料',
    });
    return `已导入：${document.title}`;
  }

  async function pickAndImportDocument() {
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
      return '已取消选择。';
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
    return `已导入：${document.title}`;
  }

  async function importFromIp() {
    if (selectedIpId == null) {
      return '请先选择一个 IP。';
    }
    const document = await generateIpMaterial({
      ipId: selectedIpId,
      space,
      title: title.trim() || 'IP 结构化资料',
    });
    return `已生成：${document.title}`;
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

        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: rhythm.entryCardGap,
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
  status: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
});
