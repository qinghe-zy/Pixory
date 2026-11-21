import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InjectedDocumentItem } from '../../ai/aiDocumentPinService';
import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { DocumentBubbleCard } from '../document/DocumentBubbleCard';
import { aiLightColors } from './aiLightTheme';

export interface AiLoreOverflowSheetProps {
  visible: boolean;
  onClose: () => void;
  incomingDoc: InjectedDocumentItem | null;
  currentInjectedDocs: InjectedDocumentItem[];
  limit?: number;
  onConfirmReplace: (removeDocumentIds: string[]) => Promise<void>;
}

export const AiLoreOverflowSheet = memo(function AiLoreOverflowSheet({
  visible,
  onClose,
  incomingDoc,
  currentInjectedDocs,
  limit = 5000,
  onConfirmReplace,
}: AiLoreOverflowSheetProps) {
  const insets = useSafeAreaInsets();
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // 当弹窗打开时重置状态
  const handleOpenReset = useCallback(() => {
    setRemovedIds(new Set());
    setSubmitting(false);
    setErrorText(null);
  }, []);

  const toggleRemove = useCallback((docId: string) => {
    setErrorText(null);
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  }, []);

  const incomingCharCount = incomingDoc?.charCount ?? 0;
  const retainedChars = useMemo(() => {
    return currentInjectedDocs
      .filter((d) => !removedIds.has(d.id))
      .reduce((sum, d) => sum + d.charCount, 0);
  }, [currentInjectedDocs, removedIds]);

  const projectedChars = retainedChars + incomingCharCount;
  const isWithinBudget = projectedChars < limit;
  const hasModified = removedIds.size > 0;
  const canSubmit = hasModified && isWithinBudget && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      setErrorText(null);
      await onConfirmReplace(Array.from(removedIds));
      onClose();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '更新注入失败，请重试');
      setSubmitting(false);
    }
  }, [canSubmit, onConfirmReplace, removedIds, onClose]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      onShow={handleOpenReset}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭弹窗" onPress={onClose} style={StyleSheet.absoluteFill} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          {/* 顶部极简拖拽指示条 */}
          <View style={styles.handle} />

          {/* 标题与字数说明 */}
          <View style={styles.header}>
            <Text allowFontScaling maxFontSizeMultiplier={1.2} style={styles.title}>
              注入原文字符较多，无法增加新的文档
            </Text>
            {incomingDoc ? (
              <Text allowFontScaling maxFontSizeMultiplier={1.15} style={styles.docNotice}>
                新文档《{incomingDoc.title}》需要 {incomingCharCount} 字。请点击下方已有文档右侧图钉将其移除：
              </Text>
            ) : null}

            {/* 实时预算状态条 */}
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>预计更新后字符：</Text>
              <Text
                style={[
                  styles.budgetValue,
                  isWithinBudget ? styles.budgetValueOk : styles.budgetValueOver,
                ]}
              >
                {projectedChars} / {limit} 字
              </Text>
              {isWithinBudget ? (
                <Text style={styles.budgetHintOk}>（已释放足够配额）</Text>
              ) : (
                <Text style={styles.budgetHintOver}>（仍超额 {projectedChars - limit + 1} 字）</Text>
              )}
            </View>
          </View>

          {errorText ? <Text style={styles.errorBanner}>{errorText}</Text> : null}

          {/* 已注入文档列表 */}
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            style={styles.docList}
          >
            {currentInjectedDocs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>当前没有已注入上下文的文档</Text>
              </View>
            ) : (
              currentInjectedDocs.map((doc) => {
                const isMarkedRemoved = removedIds.has(doc.id);
                return (
                  <View key={doc.id} style={[styles.cardItem, isMarkedRemoved && styles.cardItemRemoved]}>
                    <DocumentBubbleCard
                      charCount={doc.charCount}
                      flatStyle
                      fullWidth
                      onPress={() => toggleRemove(doc.id)}
                      onPressPin={() => toggleRemove(doc.id)}
                      pinState={isMarkedRemoved ? 'none' : 'red'}
                      sizeBytes={doc.fileSize}
                      title={doc.title}
                    />
                    {isMarkedRemoved ? (
                      <View pointerEvents="none" style={styles.removedBadge}>
                        <Text style={styles.removedBadgeText}>已移出前缀注入（点击复原）</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* 底部双按钮 */}
          <View style={styles.footerRow}>
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={onClose}
              style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed]}
            >
              <Text style={styles.btnSecondaryText}>返回</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.btnPrimary,
                !canSubmit && styles.btnPrimaryDisabled,
                pressed && canSubmit && styles.btnPressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={aiLightColors.onPrimary} size="small" />
              ) : (
                <Text
                  style={[
                    styles.btnPrimaryText,
                    !canSubmit && styles.btnPrimaryTextDisabled,
                  ]}
                >
                  更新注入
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: aiLightColors.canvas,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    maxHeight: '80%',
    paddingTop: spacing[3],
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.hairline,
    borderRadius: 2,
    height: 4,
    marginBottom: spacing[3],
    width: 36,
  },
  header: {
    borderBottomColor: aiLightColors.underlaySurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[5],
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  docNotice: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedReadable,
    lineHeight: 18,
    marginTop: rhythm.microGap,
  },
  budgetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing[2],
  },
  budgetLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  budgetValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  budgetValueOk: {
    color: '#10B981',
  },
  budgetValueOver: {
    color: '#EF4444',
  },
  budgetHintOk: {
    ...typography.textStyles.micro,
    color: '#10B981',
    marginLeft: spacing[1.5],
  },
  budgetHintOver: {
    ...typography.textStyles.micro,
    color: '#EF4444',
    marginLeft: spacing[1.5],
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    color: '#EF4444',
    fontSize: 12,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  docList: {
    maxHeight: 280,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[8],
  },
  emptyText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  cardItem: {
    position: 'relative',
  },
  cardItemRemoved: {
    opacity: 0.5,
  },
  removedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    ...StyleSheet.absoluteFillObject,
  },
  removedBadgeText: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedReadable,
    fontWeight: '500',
  },
  footerRow: {
    borderTopColor: aiLightColors.underlaySurface,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
  },
  btnSecondary: {
    alignItems: 'center',
    backgroundColor: aiLightColors.underlaySurface,
    borderRadius: radius.xs,
    flex: 1,
    height: metrics.minTouchSize,
    justifyContent: 'center',
  },
  btnSecondaryText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 15,
  },
  btnPrimary: {
    alignItems: 'center',
    backgroundColor: aiLightColors.ink,
    borderRadius: radius.xs,
    flex: 1,
    height: metrics.minTouchSize,
    justifyContent: 'center',
  },
  btnPrimaryDisabled: {
    backgroundColor: aiLightColors.hairline,
  },
  btnPrimaryText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.onPrimary,
    fontSize: 15,
  },
  btnPrimaryTextDisabled: {
    color: aiLightColors.muted,
  },
  btnPressed: {
    opacity: 0.75,
  },
});
