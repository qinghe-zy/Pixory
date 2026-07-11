import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, rhythm, shadows, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

const SHEET_HEIGHT = 456;

interface AiReplyAssistModalProps {
  visible: boolean;
  mode: 'short' | 'long';
  pages: string[][];
  pageIndex: number;
  loading?: boolean;
  errorMessage?: string | null;
  bottomInset?: number;
  onClose: () => void;
  onRefresh: () => void;
  onSelectSuggestion: (suggestion: string) => void;
  onSetMode: (mode: 'short' | 'long') => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function AiReplyAssistModal({
  visible,
  mode,
  pages,
  pageIndex,
  loading = false,
  errorMessage = null,
  bottomInset = 0,
  onClose,
  onRefresh,
  onSelectSuggestion,
  onSetMode,
  onPreviousPage,
  onNextPage,
}: AiReplyAssistModalProps) {
  const totalPages = Math.max(1, pages.length);
  const safePageIndex = Math.min(Math.max(pageIndex, 0), totalPages - 1);
  const activePage = pages[safePageIndex] ?? [];
  const cardSlots = mode === 'short' ? 3 : 1;
  const pageLabel = `${safePageIndex + 1}/${totalPages}`;
  const canGoPrevious = safePageIndex > 0;
  const canGoNext = safePageIndex < totalPages - 1;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { marginBottom: Math.max(bottomInset, spacing[3]) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <View style={styles.headerActions}>
              <View style={styles.modeSwitch}>
                <Pressable
                  accessibilityLabel="切换到短句帮答"
                  accessibilityRole="button"
                  onPress={() => onSetMode('short')}
                  style={({ pressed }) => [
                    styles.modeButton,
                    mode === 'short' && styles.modeButtonActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.modeButtonText, mode === 'short' && styles.modeButtonTextActive]}>短句</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="切换到长句帮答"
                  accessibilityRole="button"
                  onPress={() => onSetMode('long')}
                  style={({ pressed }) => [
                    styles.modeButton,
                    mode === 'long' && styles.modeButtonActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.modeButtonText, mode === 'long' && styles.modeButtonTextActive]}>长句</Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="刷新帮答候选"
                accessibilityRole="button"
                disabled={loading}
                onPress={onRefresh}
                style={({ pressed }) => [styles.iconButton, loading && styles.disabled, pressed && !loading && styles.pressed]}
              >
                <Ionicons color={aiLightColors.ink} name="refresh-outline" size={18} />
              </Pressable>
              <Pressable
                accessibilityLabel="关闭帮答"
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color={aiLightColors.ink} name="close" size={18} />
              </Pressable>
            </View>
          </View>

          <View style={styles.body}>
            {Array.from({ length: mode === 'short' ? 3 : 1 }, (_, index) => {
              const suggestion = activePage[index] ?? '';
              const isPlaceholder = !suggestion;
              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={isPlaceholder}
                  key={`${mode}-${safePageIndex}-${index}`}
                  onPress={() => {
                    if (suggestion) {
                      onSelectSuggestion(suggestion);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.card,
                    mode === 'long' ? styles.longCard : styles.shortCard,
                    isPlaceholder && styles.cardPlaceholder,
                    pressed && !isPlaceholder && styles.pressed,
                  ]}
                >
                  <Text
                    numberOfLines={mode === 'short' ? 2 : 6}
                    style={[styles.cardText, isPlaceholder && styles.placeholderText]}
                  >
                    {suggestion || ' '}
                  </Text>
                </Pressable>
              );
            })}
            {loading ? (
              <View pointerEvents="none" style={styles.loadingOverlay}>
                <ActivityIndicator color={aiLightColors.primaryActive} size="small" />
              </View>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Pressable
              accessibilityLabel="上一页帮答候选"
              accessibilityRole="button"
              disabled={!canGoPrevious}
              onPress={onPreviousPage}
              style={({ pressed }) => [
                styles.navButton,
                !canGoPrevious && styles.disabled,
                pressed && canGoPrevious && styles.pressed,
              ]}
            >
              <Ionicons color={aiLightColors.ink} name="chevron-back" size={16} />
            </Pressable>
            <Text style={styles.pageLabel}>{pageLabel}</Text>
            <Pressable
              accessibilityLabel="下一页帮答候选"
              accessibilityRole="button"
              disabled={!canGoNext}
              onPress={onNextPage}
              style={({ pressed }) => [
                styles.navButton,
                !canGoNext && styles.disabled,
                pressed && canGoNext && styles.pressed,
              ]}
            >
              <Ionicons color={aiLightColors.ink} name="chevron-forward" size={16} />
            </Pressable>
          </View>

          {errorMessage ? (
            <Text numberOfLines={1} style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(28, 28, 30, 0.2)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    alignSelf: 'stretch',
    backgroundColor: aiLightColors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    height: SHEET_HEIGHT,
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    ...shadows.floating,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.mutedSoft,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing[2],
    width: 44,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: spacing[10],
  },
  headerSpacer: {
    flex: 1,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  modeSwitch: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: 2,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: spacing[8],
    minWidth: 56,
    paddingHorizontal: spacing[3],
  },
  modeButtonActive: {
    backgroundColor: aiLightColors.surface,
  },
  modeButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: aiLightColors.ink,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  body: {
    flex: 1,
    gap: rhythm.microGap,
    justifyContent: 'center',
    position: 'relative',
    paddingTop: spacing[1],
  },
  card: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  shortCard: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
  },
  longCard: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
  },
  cardPlaceholder: {
    opacity: 0.55,
  },
  cardText: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    lineHeight: 24,
  },
  placeholderText: {
    color: aiLightColors.mutedSoft,
  },
  loadingOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  navButton: {
    alignItems: 'center',
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  pageLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '600',
    minWidth: 56,
    textAlign: 'center',
  },
  errorText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    marginTop: spacing[1],
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.36,
  },
  pressed: {
    opacity: 0.78,
  },
});
