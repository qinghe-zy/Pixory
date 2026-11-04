import React from 'react';
import { Image, ImageBackground, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../design/tokens/colors';
import { radius } from '../../../design/tokens/radius';
import { spacing } from '../../../design/tokens/spacing';
import type { DiaryThemeKey, ImCompanionDiary } from '../types';
import { imDiaryThemeAssets } from '../themeAssets';

const WHITESPACE_COLLAPSE_REGEX = /\s+/g;

export function resolveDiaryThemeKey(themeKey?: string | null): DiaryThemeKey {
  if (
    themeKey === 'sage' ||
    themeKey === 'rainwater' ||
    themeKey === 'rose' ||
    themeKey === 'lavender' ||
    themeKey === 'celadon'
  ) {
    return themeKey;
  }
  return 'sage';
}

export interface ImDiaryDatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  diaries: ImCompanionDiary[];
  currentDateStr?: string;
  onSelectDate: (diaryDate: string) => void;
}

/**
 * 伴侣日记按日期穿梭跳转浮层 (Diary Date Picker Modal)
 * 列表清晰呈现对应日记信纸封面缩略图、历史手账日期、心情标签与标题，点击即可瞬间直达
 */
export function ImDiaryDatePickerModal({
  visible,
  onClose,
  diaries,
  currentDateStr,
  onSelectDate,
}: ImDiaryDatePickerModalProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Ionicons
                color={colors.text.title}
                name="calendar-outline"
                size={18}
                style={styles.headerIcon}
              />
              <Text style={styles.headerTitle}>手账回忆目录</Text>
            </View>
            <Pressable
              accessibilityLabel="关闭手账回忆目录"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed ? styles.itemPressed : null]}
            >
              <Ionicons color={colors.text.secondary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            style={styles.listScroll}
          >
            {diaries.length > 0 ? (
              diaries.map((item) => {
                const isSelected = item.diaryDate === currentDateStr;
                const resolvedKey = resolveDiaryThemeKey(item.themeKey);
                const coverAsset = imDiaryThemeAssets[resolvedKey];
                const cleanSnippet = item.content
                  .replace(WHITESPACE_COLLAPSE_REGEX, ' ')
                  .trim()
                  .slice(0, 64);
                const tagLabel = item.moodTag || coverAsset.name;

                return (
                  <Pressable
                    accessibilityLabel={`${item.diaryDate} 手账《${item.title}》，${tagLabel}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    key={item.id}
                    onPress={() => {
                      onSelectDate(item.diaryDate);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.diaryItemWrapper,
                      isSelected ? styles.diaryItemSelected : null,
                      pressed ? styles.itemPressed : null,
                    ]}
                  >
                    <ImageBackground
                      imageStyle={styles.cardBgImage}
                      resizeMode="cover"
                      source={coverAsset.card}
                      style={styles.cardBg}
                    >
                      <View style={[styles.cardFrostedOverlay, isSelected ? styles.cardFrostedOverlaySelected : null]}>
                        <View style={styles.itemTopRow}>
                          <Text style={[styles.itemDate, isSelected ? styles.itemDateSelected : null]}>
                            {item.diaryDate}
                          </Text>
                          <View style={styles.tagRow}>
                            <View style={styles.tagPill}>
                              <Text style={styles.tagText}>{tagLabel}</Text>
                            </View>
                          </View>
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[styles.itemTitle, isSelected ? styles.itemTitleSelected : null]}
                        >
                          {item.title}
                        </Text>
                        <Text numberOfLines={2} style={styles.itemSnippet}>
                          {cleanSnippet}
                        </Text>
                      </View>
                    </ImageBackground>
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons
                  color={colors.text.tertiary}
                  name="book-outline"
                  size={36}
                  style={styles.emptyIcon}
                />
                <Text style={styles.emptyTitle}>还没有历史手账</Text>
                <Text style={styles.emptySubtitle}>
                  多聊几句日常吧，夜晚会在手账本里为你写下专属回忆。
                </Text>
                <Pressable
                  accessibilityLabel="知道了，关闭目录"
                  accessibilityRole="button"
                  onPress={onClose}
                  style={({ pressed }) => [styles.emptyActionBtn, pressed ? styles.itemPressed : null]}
                >
                  <Text style={styles.emptyActionText}>知道了</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 28, 28, 0.42)', // 模态半透明遮罩层（高于轻度 scrim 以凸显纸面层次）
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.background.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '78%',
    paddingBottom: spacing[6],
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing[5],
    paddingRight: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: spacing[1.5],
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.title,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listScroll: {
    maxHeight: 480,
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    gap: spacing[3],
  },
  diaryItemWrapper: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.secondary,
  },
  diaryItemSelected: {
    borderColor: colors.text.gold,
    borderWidth: 1.5,
  },
  itemPressed: {
    opacity: 0.82,
  },
  cardBg: {
    width: '100%',
  },
  cardBgImage: {
    borderRadius: radius.md,
  },
  cardFrostedOverlay: {
    padding: spacing[3],
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
  },
  cardFrostedOverlaySelected: {
    backgroundColor: 'rgba(255, 253, 245, 0.88)',
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  itemDate: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.body,
  },
  itemDateSelected: {
    color: colors.text.gold,
  },
  tagPill: {
    backgroundColor: colors.overlay.softSurface,
    paddingHorizontal: spacing[2],
    paddingVertical: 2, // 紧凑微胶囊内边距
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.title,
    marginBottom: spacing[1],
  },
  itemTitleSelected: {
    color: colors.text.title,
    fontWeight: '700',
  },
  itemSnippet: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[6],
  },
  emptyIcon: {
    marginBottom: spacing[3],
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.title,
    marginBottom: spacing[1.5],
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[5],
  },
  emptyActionBtn: {
    backgroundColor: colors.primary.default,
    paddingHorizontal: spacing[5],
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.inverse,
  },
});
