import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DocumentTocItem } from '../../ai/readers/readerTypes';
import { layout, radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from '../ai/aiLightTheme';

interface ReaderTocDrawerProps {
  visible: boolean;
  tocItems: DocumentTocItem[];
  activeTargetId?: string;
  onSelectToc: (item: DocumentTocItem) => void;
  onClose: () => void;
}

export const ReaderTocDrawer: React.FC<ReaderTocDrawerProps> = ({
  visible,
  tocItems,
  activeTargetId,
  onSelectToc,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      animationType="slide"
      hardwareAccelerated
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.drawer, { paddingBottom: insets.bottom + spacing[4], paddingTop: insets.top + spacing[2] }]}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>目录大纲</Text>
              <Text style={styles.subtitle}>共 {tocItems.length} 个章节</Text>
            </View>

            <Pressable accessibilityLabel="关闭目录" accessibilityRole="button" onPress={onClose} style={styles.closeBtn}>
              <Ionicons color={aiLightColors.muted} name="close" size={22} />
            </Pressable>
          </View>

          {tocItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons color={aiLightColors.muted} name="document-text-outline" size={36} />
              <Text style={styles.emptyText}>当前文档未检测到大纲目录</Text>
            </View>
          ) : (
            <FlatList
              contentContainerStyle={styles.listContent}
              data={tocItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isActive = item.targetId === activeTargetId;
                const indent = Math.max(0, Math.min(3, (item.level || 2) - 1)) * 14;

                return (
                  <Pressable
                    onPress={() => onSelectToc(item)}
                    style={({ pressed }) => [
                      styles.tocItem,
                      { paddingLeft: spacing[3] + indent },
                      isActive && styles.tocItemActive,
                      pressed && styles.tocItemPressed,
                    ]}
                  >
                    <View style={[styles.tocDot, item.level === 1 && styles.tocDotH1, isActive && styles.tocDotActive]} />
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.tocItemText,
                        item.level === 1 && styles.tocItemTextH1,
                        isActive && styles.tocItemTextActive,
                      ]}
                    >
                      {item.title}
                    </Text>
                    {item.pageIndex !== undefined ? (
                      <Text style={styles.pageNumber}>第 {item.pageIndex + 1} 页</Text>
                    ) : null}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  drawer: {
    backgroundColor: aiLightColors.canvas,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '80%',
    minHeight: '45%',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingVertical: spacing[3],
  },
  title: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    fontSize: 17,
    fontWeight: '600',
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing[1],
  },
  listContent: {
    paddingVertical: spacing[2],
  },
  tocItem: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flexDirection: 'row',
    marginHorizontal: spacing[2],
    marginVertical: 1,
    paddingRight: spacing[3],
    paddingVertical: spacing[3],
  },
  tocItemActive: {
    backgroundColor: aiLightColors.userBubble,
  },
  tocItemPressed: {
    opacity: 0.75,
  },
  tocDot: {
    backgroundColor: aiLightColors.muted,
    borderRadius: radius.pill,
    height: 5,
    marginRight: spacing[2],
    width: 5,
  },
  tocDotH1: {
    backgroundColor: aiLightColors.primary,
    height: 7,
    width: 7,
  },
  tocDotActive: {
    backgroundColor: aiLightColors.primary,
  },
  tocItemText: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  tocItemTextH1: {
    fontWeight: '600',
  },
  tocItemTextActive: {
    color: aiLightColors.primaryText,
    fontWeight: '600',
  },
  pageNumber: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontSize: 12,
    marginLeft: spacing[2],
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing[8],
  },
  emptyText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    marginTop: spacing[2],
  },
});
