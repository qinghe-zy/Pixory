import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { aiLightColors } from './aiLightTheme';
import type { IpRecord } from '../../database/types';

interface SystemActionConfirmCardProps {
  title: string;
  description?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
}

export function SystemActionConfirmCard({ title, description, onConfirm, onCancel, confirmLabel = '确认' }: SystemActionConfirmCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="information" size={14} color="#18181b" />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      {description ? <Text style={styles.body}>{description}</Text> : null}
      <View style={styles.footer}>
        {onCancel && (
          <Pressable 
            onPress={onCancel} 
            style={({ pressed }) => [styles.actionBtn, styles.cancelBtn, pressed && styles.actionBtnPressed]}
          >
            <Text style={styles.cancelBtnText}>取消</Text>
          </Pressable>
        )}
        <Pressable 
          onPress={onConfirm} 
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
        >
          <Text style={styles.actionBtnText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface SystemIpSelectCardProps {
  ips: IpRecord[];
  onConfirm: (ipId: number) => void;
  onCancel?: () => void;
}

export function SystemIpSelectCard({ ips, onConfirm, onCancel }: SystemIpSelectCardProps) {
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="folder-outline" size={14} color="#18181b" />
        </View>
        <Text style={styles.title}>选择IP</Text>
      </View>
      <Text style={styles.body}>请选择要操作的IP</Text>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ipList}>
        {ips.map((ip) => (
          <Pressable
            key={ip.id}
            onPress={() => setSelectedIpId(ip.id)}
            style={[styles.ipPill, selectedIpId === ip.id && styles.ipPillSelected]}
          >
            <Text style={[styles.ipPillText, selectedIpId === ip.id && styles.ipPillTextSelected]}>
              {ip.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {onCancel && (
          <Pressable 
            onPress={onCancel} 
            style={({ pressed }) => [styles.actionBtn, styles.cancelBtn, pressed && styles.actionBtnPressed]}
          >
            <Text style={styles.cancelBtnText}>取消</Text>
          </Pressable>
        )}
        <Pressable 
          onPress={() => selectedIpId && onConfirm(selectedIpId)} 
          style={({ pressed }) => [
            styles.actionBtn, 
            !selectedIpId ? styles.buttonDisabled : null,
            pressed && selectedIpId !== null ? styles.actionBtnPressed : null
          ]}
          disabled={!selectedIpId}
        >
          <Text style={styles.actionBtnText}>确认</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: aiLightColors.surface,
    borderColor: '#e4e4e7',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    borderRadius: 6,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  title: {
    color: '#18181b',
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    color: '#71717a',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 4,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#18181b',
  },
  actionBtnPressed: {
    backgroundColor: '#3f3f46',
    borderColor: '#3f3f46',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    borderColor: '#e4e4e7',
  },
  cancelBtnText: {
    color: '#18181b',
    fontSize: 12,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  ipList: {
    paddingVertical: 4,
    gap: 8,
    marginBottom: 8,
  },
  ipPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  ipPillSelected: {
    backgroundColor: '#18181b',
    borderColor: '#18181b',
  },
  ipPillText: {
    fontSize: 12,
    color: '#71717a',
  },
  ipPillTextSelected: {
    color: '#ffffff',
    fontWeight: '500',
  },
});
