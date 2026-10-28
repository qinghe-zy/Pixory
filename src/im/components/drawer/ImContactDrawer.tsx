import React, { useEffect, useState, useCallback } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PixorySpace } from '../../../database';
import type { ImThreadListItem } from '../../types';
import { listImThreads } from '../../repository/imThreadRepository';
import { SecureImage } from '../../../components/SecureImage';
import { formatWeChatTime } from '../../utils/formatWeChatTime';

export interface ImContactDrawerProps {
  space: PixorySpace;
  activeRoleCardId?: string;
  onSelectCompanion: (roleCardId: string, roleName: string, avatarUri?: string | null) => void;
  onNewRole: () => void;
  onImportRole: () => void;
  refreshTrigger?: number;
}

function cleanPreview(raw?: string | null): string {
  if (!raw) return '发句问候，开启今天的对话吧';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && (trimmed.includes('"imageUri"') || trimmed.includes('"type":"image"'))) {
    return '[图片]';
  }
  return trimmed
    .replace(/\[(STATUS|MOOD|STICKER|HEARTBEAT|VOICE):[^\]]+\]/gi, '')
    .replace(/\[BR\]/g, ' ')
    .trim() || '发句问候，开启今天的对话吧';
}

export function ImContactDrawer({
  space,
  activeRoleCardId,
  onSelectCompanion,
  onNewRole,
  onImportRole,
  refreshTrigger,
}: ImContactDrawerProps) {
  const insets = useSafeAreaInsets();
  const [threads, setThreads] = useState<ImThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const items = await listImThreads(space);
      setThreads(items);
    } catch {
      // 容错静默
    } finally {
      setLoading(false);
    }
  }, [space]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshTrigger]);

  const renderItem = ({ item }: { item: ImThreadListItem }) => {
    const isActive = item.roleCardId === activeRoleCardId;
    const preview = cleanPreview(item.lastMessagePreview);

    return (
      <Pressable
        accessibilityLabel={`切换至伴侣 ${item.title}`}
        accessibilityRole="button"
        onPress={() => onSelectCompanion(item.roleCardId, item.title, item.avatarUri)}
        style={({ pressed }) => [
          styles.row,
          isActive && styles.activeRow,
          pressed && styles.pressedRow,
        ]}
      >
        <View style={styles.avatarBox}>
          {item.avatarUri ? (
            <SecureImage space={space} style={styles.avatarImg} uri={item.avatarUri} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.fallbackLetter}>{item.title.slice(0, 1)}</Text>
            </View>
          )}
          {isActive && <View style={styles.activeDot} />}
        </View>

        <View style={styles.infoCol}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.nameText, isActive && styles.activeNameText]}>
              {item.title}
            </Text>
            {Boolean(item.lastMessageAt) && (
              <Text style={styles.timeText}>
                {formatWeChatTime(item.lastMessageAt, 'list')}
              </Text>
            )}
          </View>
          <Text numberOfLines={1} style={styles.snippetText}>
            {preview}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>伴侣通讯录</Text>
        <View style={styles.actionGroup}>
          <Pressable accessibilityRole="button" onPress={onNewRole} style={styles.textBtn}>
            <Text style={styles.textBtnLabel}>新建</Text>
          </Pressable>
          <View style={styles.btnDivider} />
          <Pressable accessibilityRole="button" onPress={onImportRole} style={styles.textBtn}>
            <Text style={styles.textBtnLabel}>导入</Text>
          </Pressable>
        </View>
      </View>

      {loading && threads.length === 0 ? (
        <View style={styles.skeletonContainer}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <View style={styles.skeletonAvatar} />
              <View style={styles.skeletonTextCol}>
                <View style={styles.skeletonTitle} />
                <View style={styles.skeletonSub} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={threads}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons color="#9CA3AF" name="people-outline" size={38} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>还没添加伴侣角色</Text>
              <Text style={styles.emptySub}>新建或导入角色，开启专属陪伴聊天</Text>
              <Pressable accessibilityRole="button" onPress={onNewRole} style={styles.emptyActionBtn}>
                <Text style={styles.emptyActionText}>新建伴侣角色</Text>
              </Pressable>
            </View>
          }
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E7EAF0', paddingHorizontal: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8DCE0' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1C1C' },
  actionGroup: { flexDirection: 'row', alignItems: 'center' },
  textBtn: { paddingVertical: 6, paddingHorizontal: 10, minHeight: 36, justifyContent: 'center' },
  textBtnLabel: { fontSize: 14, fontWeight: '600', color: '#1A1C1C' },
  btnDivider: { width: StyleSheet.hairlineWidth, height: 12, backgroundColor: '#D8DCE0' },
  listContent: { paddingTop: 8, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, marginBottom: 6, minHeight: 64 },
  activeRow: { backgroundColor: '#FFFFFF', borderWidth: 0, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  pressedRow: { opacity: 0.8 },
  avatarBox: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', position: 'relative', marginRight: 10 },
  avatarImg: { width: '100%', height: '100%', borderRadius: 22 },
  avatarFallback: { width: '100%', height: '100%', backgroundColor: '#D4D8DD', alignItems: 'center', justifyContent: 'center' },
  fallbackLetter: { fontSize: 18, fontWeight: '700', color: '#4B5563' },
  activeDot: { position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#1A1C1C', borderWidth: 1.5, borderColor: '#FFFFFF' },
  infoCol: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  nameText: { fontSize: 15, fontWeight: '600', color: '#1A1C1C' },
  timeText: { fontSize: 11, color: '#9CA3AF' },
  activeNameText: { color: '#1A1C1C', fontWeight: '700' },
  snippetText: { fontSize: 12, color: '#6B7280' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 18, lineHeight: 18 },
  emptyActionBtn: { backgroundColor: '#1A1C1C', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  emptyActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  skeletonContainer: { paddingTop: 12 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', padding: 10, marginBottom: 8 },
  skeletonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E0E3E8', marginRight: 10 },
  skeletonTextCol: { flex: 1, gap: 6 },
  skeletonTitle: { width: '40%', height: 14, borderRadius: 4, backgroundColor: '#E0E3E8' },
  skeletonSub: { width: '70%', height: 10, borderRadius: 4, backgroundColor: '#E8EBF0' },
});
