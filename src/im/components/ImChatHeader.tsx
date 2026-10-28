import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useImTheme } from '../theme/ImThemeProvider';
import { ImMarqueeText } from './common/ImMarqueeText';

export interface ImChatHeaderProps {
  title: string;
  subText?: string | null;
  unreadTotal?: number;
  onBack?: () => void;
  onOpenContacts?: () => void;
  onOpenDetails?: () => void;
}

/**
 * 伴侣原生顶栏导航器 (左对齐极简无返回键)
 */
export function ImChatHeader({
  title,
  subText,
  unreadTotal = 0,
  onBack,
  onOpenContacts,
  onOpenDetails,
}: ImChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useImTheme();

  const isInputting = subText === '对方正在输入...' || subText === '对方正在思考...';
  const displayTitle = isInputting ? subText : title;
  const displayStatus = isInputting ? null : subText;

  return (
    <View
      style={[
        styles.headerWrapper,
        {
          backgroundColor: theme.colors.headerBackground,
          borderBottomColor: theme.colors.headerBorder,
          paddingTop: Math.max(insets.top, 8),
        },
      ]}
    >
      <View style={styles.navRow}>
        {/* 左侧通讯录抽屉按钮 */}
        {Boolean(onOpenContacts) && (
          <Pressable
            accessibilityLabel="打开伴侣通讯录"
            accessibilityRole="button"
            onPress={onOpenContacts}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons
              color={theme.colors.headerTitle}
              name="people-outline"
              size={22}
            />
          </Pressable>
        )}

        {/* 左对齐会话标题与生活状态 (不加粗) */}
        <View style={styles.titleCol} pointerEvents="none">
          <Text
            numberOfLines={1}
            style={[
              styles.titleText,
              {
                color: theme.colors.headerTitle,
                fontSize: theme.typography.headerTitleFontSize,
              },
            ]}
          >
            {displayTitle}
          </Text>
          {displayStatus ? (
            <ImMarqueeText
              speed={28}
              style={[
                styles.subText,
                {
                  color: theme.colors.headerSubText,
                  fontSize: theme.typography.headerSubFontSize,
                },
              ]}
              text={displayStatus}
            />
          ) : null}
        </View>

        {/* 右侧更多选项按钮 */}
        <Pressable
          accessibilityLabel="聊天详情与伴侣资料"
          accessibilityRole="button"
          onPress={onOpenDetails}
          style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}
        >
          <Ionicons
            color={theme.colors.headerTitle}
            name="ellipsis-horizontal"
            size={22}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  navRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  titleText: {
    fontWeight: '500',
    textAlign: 'left',
  },
  subText: {
    marginTop: 1,
    fontWeight: '400',
    textAlign: 'left',
  },
  moreBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
