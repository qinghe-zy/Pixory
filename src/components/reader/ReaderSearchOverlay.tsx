import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { InDocSearchState } from '../../ai/readers/readerTypes';
import { layout, metrics, radius, shadows, spacing, typography } from '../../design/tokens';
import { aiLightColors } from '../ai/aiLightTheme';

interface ReaderSearchOverlayProps {
  visible: boolean;
  searchState: InDocSearchState;
  onQueryChange: (query: string) => void;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onClose: () => void;
}

export const ReaderSearchOverlay: React.FC<ReaderSearchOverlayProps> = ({
  visible,
  searchState,
  onQueryChange,
  onNextMatch,
  onPrevMatch,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const statusBarHeight =
    Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      Keyboard.dismiss();
    }
  }, [visible]);

  if (!visible) return null;

  const hasMatches = searchState.totalMatches > 0;
  const matchIndicator =
    searchState.query.trim().length > 0
      ? hasMatches
        ? `${searchState.currentMatch} / ${searchState.totalMatches}`
        : '无匹配'
      : '';

  return (
    <View style={[styles.container, { top: statusBarHeight + metrics.minTouchSize + spacing[3] }]}>
      <View style={styles.card}>
        <Ionicons color={aiLightColors.muted} name="search-outline" size={18} style={styles.searchIcon} />

        <TextInput
          ref={inputRef}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onQueryChange}
          placeholder="在文档中搜索..."
          placeholderTextColor={aiLightColors.muted}
          returnKeyType="search"
          style={styles.input}
          value={searchState.query}
        />

        {matchIndicator ? (
          <Text style={[styles.counterText, !hasMatches && styles.noMatchText]}>
            {matchIndicator}
          </Text>
        ) : null}

        <View style={styles.stepperGroup}>
          <Pressable
            accessibilityLabel="上一处匹配"
            accessibilityRole="button"
            disabled={!hasMatches}
            onPress={onPrevMatch}
            style={({ pressed }) => [
              styles.stepperButton,
              !hasMatches && styles.stepperDisabled,
              pressed && styles.stepperPressed,
            ]}
          >
            <Ionicons
              color={hasMatches ? aiLightColors.ink : aiLightColors.muted}
              name="chevron-up"
              size={18}
            />
          </Pressable>

          <Pressable
            accessibilityLabel="下一处匹配"
            accessibilityRole="button"
            disabled={!hasMatches}
            onPress={onNextMatch}
            style={({ pressed }) => [
              styles.stepperButton,
              !hasMatches && styles.stepperDisabled,
              pressed && styles.stepperPressed,
            ]}
          >
            <Ionicons
              color={hasMatches ? aiLightColors.ink : aiLightColors.muted}
              name="chevron-down"
              size={18}
            />
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel="退出搜索"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons color={aiLightColors.mutedReadable} name="close" size={20} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    left: layout.pagePaddingHorizontal,
    position: 'absolute',
    right: layout.pagePaddingHorizontal,
    zIndex: 20,
  },
  card: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    ...shadows.md,
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  input: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
    fontSize: 14,
    height: 40,
    paddingVertical: 0,
  },
  counterText: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedReadable,
    fontSize: 12,
    fontWeight: '500',
    marginHorizontal: spacing[2],
  },
  noMatchText: {
    color: aiLightColors.muted,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginRight: spacing[1],
  },
  stepperButton: {
    alignItems: 'center',
    borderRadius: radius.xs,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  stepperDisabled: {
    opacity: 0.35,
  },
  stepperPressed: {
    backgroundColor: aiLightColors.userBubble,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
});
