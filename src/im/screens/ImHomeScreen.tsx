import React, { useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PixorySpace } from '../../database';
import type { ImThreadListItem } from '../types';
import { ImThreadList } from '../components/ImThreadList';
import { layout } from '../../design/tokens';
import { FloatingFooterContext } from '../../components/AppScreen';

export interface ImHomeScreenProps {
  space: PixorySpace;
  isActive?: boolean;
  refreshToken?: number;
  onOpenImChat: (thread: ImThreadListItem) => void;
  onCreateRole?: () => void;
  onImportRole?: () => void;
  onOpenRoleLibrary?: () => void;
}

/**
 * 伴聊主屏幕 (ImHomeScreen - 独立底栏 Tab)
 * 去除顶部模式切换 Segment 胶囊，列表自然上移，紧凑优雅展示伴侣会话。
 */
export function ImHomeScreen({
  space,
  refreshToken,
  onOpenImChat,
  onCreateRole,
  onImportRole,
  onOpenRoleLibrary,
}: ImHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const floatingFooterHeight = useContext(FloatingFooterContext);

  const renderHeader = () => (
    <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.topRow}>
        <Text style={styles.screenTitle}>伴聊</Text>
        <View style={styles.actionBar}>
          <Pressable accessibilityRole="button" onPress={onCreateRole} style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            <Text style={styles.actionBtnText}>添加</Text>
          </Pressable>
          <View style={styles.btnDivider} />
          <Pressable accessibilityRole="button" onPress={onImportRole} style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            <Text style={styles.actionBtnText}>导入</Text>
          </Pressable>
          <View style={styles.btnDivider} />
          <Pressable accessibilityRole="button" onPress={onOpenRoleLibrary} style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            <Text style={styles.actionBtnText}>角色库</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ImThreadList
        ListHeaderComponent={renderHeader()}
        contentContainerStyle={{ paddingBottom: layout.pageBottomOffset + floatingFooterHeight }}
        onOpenImChat={onOpenImChat}
        onOpenRoleLibrary={onOpenRoleLibrary}
        refreshTrigger={refreshToken}
        space={space}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  headerContainer: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingBottom: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },
  actionBar: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionBtn: { paddingVertical: 6, paddingHorizontal: 8, minHeight: 36, justifyContent: 'center' },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  btnDivider: { width: StyleSheet.hairlineWidth, height: 12, backgroundColor: '#E5E7EB' },
  pressed: { opacity: 0.6 },
});
