import React, { useState, useEffect } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PixorySpace } from '../../../database';
import { SecureImage } from '../../../components/SecureImage';
import { searchImMessages } from '../../repository/imSettingsRepository';

export interface ImMessageSearchModalProps {
  visible: boolean;
  space: PixorySpace;
  threadId: string;
  companionName?: string;
  companionAvatarUri?: string | null;
  userAvatarUri?: string | null;
  onClose: () => void;
  onSelectMessage?: (messageId: string) => void;
}

export function ImMessageSearchModal({
  visible,
  space,
  threadId,
  companionName = '伴侣',
  companionAvatarUri,
  userAvatarUri,
  onClose,
  onSelectMessage,
}: ImMessageSearchModalProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; role: string; content: string; createdAt: string }>>([]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const rows = await searchImMessages(space, threadId, query);
        setResults(rows);
      } catch {
        // 容错静默
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, space, threadId]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.header}>
          <View style={styles.searchBar}>
            <Ionicons color="#64748B" name="search" size={17} style={styles.searchIcon} />
            <TextInput
              autoFocus
              onChangeText={setQuery}
              placeholder="搜索聊天记录"
              placeholderTextColor="#94A3B8"
              returnKeyType="search"
              style={styles.input}
              value={query}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} style={styles.clearBtn}>
                <Ionicons color="#94A3B8" name="close-circle" size={16} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
        </View>

        <FlatList
          contentContainerStyle={styles.listContent}
          data={results}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            query.trim().length > 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons color="#CBD5E1" name="search-outline" size={36} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>未找到与 “{query}” 相关的聊天记录</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            const name = isUser ? '我' : companionName;
            const avatarUri = isUser ? userAvatarUri : companionAvatarUri;
            const formattedTime = new Date(item.createdAt).toLocaleDateString([], {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <Pressable
                onPress={() => {
                  onSelectMessage?.(item.id);
                  onClose();
                }}
                style={({ pressed }) => [styles.resultRow, pressed && styles.rowPressed]}
              >
                <View style={styles.avatarWrap}>
                  {avatarUri ? (
                    <SecureImage space={space} style={styles.avatarImg} uri={avatarUri} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Ionicons color="#94A3B8" name={isUser ? 'person' : 'heart'} size={18} />
                    </View>
                  )}
                </View>
                <View style={styles.resultRight}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.roleLabel}>{name}</Text>
                    <Text style={styles.timeLabel}>{formattedTime}</Text>
                  </View>
                  <HighlightedText query={query} text={item.content.replace(/\[BR\]/g, ' ')} />
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <Text numberOfLines={2} style={styles.contentText}>{text}</Text>;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <Text numberOfLines={2} style={styles.contentText}>
      {parts.map((p, i) =>
        p.toLowerCase() === trimmed.toLowerCase() ? (
          <Text key={i} style={styles.highlightText}>{p}</Text>
        ) : (
          <Text key={i}>{p}</Text>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 10, height: 38 },
  searchIcon: { marginRight: 6 },
  input: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 0 },
  clearBtn: { padding: 4 },
  cancelBtn: { marginLeft: 12, paddingVertical: 6, paddingHorizontal: 6 },
  cancelText: { fontSize: 14, color: '#0F172A', fontWeight: '600' },
  listContent: { paddingVertical: 6 },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowPressed: { backgroundColor: '#F8FAFC' },
  avatarWrap: { width: 38, height: 38, borderRadius: 8, overflow: 'hidden', marginRight: 12 },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: { width: '100%', height: '100%', backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  resultRight: { flex: 1 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  roleLabel: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  timeLabel: { fontSize: 11, color: '#94A3B8' },
  contentText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  highlightText: { backgroundColor: '#FEF08A', color: '#854D0E', fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyText: { fontSize: 13, color: '#94A3B8' },
});
