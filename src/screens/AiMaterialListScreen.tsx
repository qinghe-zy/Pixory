import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { listMaterials, removeMaterial, retryMaterialParsing } from '../ai/aiDocumentService';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
import type { AiDocumentStatus } from '../ai/types';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiMaterialListScreenProps {
  space: PixorySpace;
  knowledgeBaseId?: string;
  onBack: () => void;
  onOpenDocument: (documentId: string, title: string) => void;
}

const STATUS_LABELS: Record<AiDocumentStatus, string> = {
  pending: '等待解析',
  parsing: '解析中',
  parsed: '已解析',
  chunked: '已切片',
  searchable: '可检索',
  embedding_pending: '等待向量',
  embedding_ready: '向量可用',
  failed: '失败',
};

export function AiMaterialListScreen({ space, knowledgeBaseId, onBack, onOpenDocument }: AiMaterialListScreenProps) {
  const [items, setItems] = useState<AiDocumentRecord[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  const reload = useCallback(async () => {
    setItems(await listMaterials({ knowledgeBaseId, space }));
  }, [knowledgeBaseId, space]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function retryDocument(documentId: string) {
    try {
      await retryMaterialParsing({ documentId, space });
      setStatus('已重新解析材料。');
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重试失败');
    }
  }

  async function removeDocument(documentId: string) {
    await removeMaterial({ documentId, space });
    setStatus('材料记录已移除。');
    await reload();
  }

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      onBack={onBack}
      scrollable
      subtitle={`${spaceLabel} · ${knowledgeBaseId ? '当前知识库' : '最近材料'}`}
      title="材料列表"
    >
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <View style={styles.list}>
        {items.length ? (
          items.map((item) => (
            <View key={item.id} style={styles.row}>
              <Pressable accessibilityRole="button" onPress={() => onOpenDocument(item.id, item.title)} style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
                <View style={styles.iconWrap}>
                  <Ionicons color={colors.primary.active} name={iconForStatus(item.parserStatus)} size={20} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.meta}>{STATUS_LABELS[item.parserStatus]} · {item.sourceType} · {item.originalFilename ?? '手动文本'}</Text>
                  {item.parserError ? <Text style={styles.error}>{item.parserError}</Text> : null}
                </View>
              </Pressable>
              {item.parserStatus === 'failed' ? (
                <View style={styles.failedActions}>
                  <PrimaryButton label="重试解析" onPress={() => void retryDocument(item.id)} variant="outline" />
                  <PrimaryButton label="移除" onPress={() => void removeDocument(item.id)} variant="ghost" />
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.title}>还没有材料</Text>
            <Text style={styles.meta}>导入文本或文件后，这里会显示解析状态、失败原因和可检索状态。</Text>
          </View>
        )}
      </View>
    </ScreenScaffold>
  );
}

function iconForStatus(status: AiDocumentStatus): keyof typeof Ionicons.glyphMap {
  if (status === 'failed') {
    return 'alert-circle-outline';
  }
  if (status === 'searchable' || status === 'embedding_ready') {
    return 'checkmark-circle-outline';
  }
  return 'document-text-outline';
}

const styles = StyleSheet.create({
  status: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  list: {
    gap: rhythm.listCardGap,
  },
  row: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  rowMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  pressed: {
    opacity: 0.78,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  copy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.bodyStrong,
  },
  meta: {
    ...typography.textStyles.caption,
  },
  error: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  failedActions: {
    gap: rhythm.inlineGap,
  },
  emptyCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[4],
  },
});
