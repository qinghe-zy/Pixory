import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Keyboard,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PixorySpace } from '../../../database';
import type {
  ImThreadSettings,
  ImCompanionPersonalization,
  ImRelationshipPreset,
  ImReplyStyleGear,
  ImProactiveFrequencyGear,
  ImBubbleSkinPreset,
} from '../../repository/imSettingsRepository';
import { BUBBLE_SKIN_PRESETS } from '../../theme/imTheme';
import { ImCustomBubbleColorModal } from './ImCustomBubbleColorModal';

export interface ImCompanionPersonaModalProps {
  visible: boolean;
  onClose: () => void;
  space: PixorySpace;
  companionName: string;
  settings: ImThreadSettings;
  onUpdateSettings: (patch: Partial<ImThreadSettings>) => Promise<void>;
}

const RELATIONSHIP_OPTIONS: Array<{ key: ImRelationshipPreset; label: string; desc: string }> = [
  { key: 'close_friend', label: '知心挚友', desc: '无话不谈、温暖陪伴' },
  { key: 'romantic', label: '心动伴侣', desc: '双向奔赴、亲昵依恋' },
  { key: 'friend', label: '日常朋友', desc: '轻松闲聊、自然随和' },
  { key: 'mentor', label: '亦师亦友', desc: '引路解惑、沉稳包容' },
  { key: 'childhood_sweetheart', label: '青梅竹马', desc: '默契熟稔、打闹斗嘴' },
  { key: 'rival_partner', label: '欢喜冤家', desc: '相爱相杀、口嫌体正直' },
];

const REPLY_STYLE_OPTIONS: Array<{ key: ImReplyStyleGear; label: string; desc: string }> = [
  { key: 'balanced', label: '自然亲切', desc: '语调温和自然，随性真实' },
  { key: 'empathetic', label: '温柔共情', desc: '细腻敏锐，情绪安全感拉满' },
  { key: 'playful', label: '元气幽默', desc: '活泼灵动，爱开玩笑与玩梗' },
  { key: 'tsundere', label: '傲娇口嫌', desc: '嘴硬心软，越怼越深情' },
  { key: 'clingy_sweet', label: '甜糯粘人', desc: '依赖感强，爱撒娇多找你说话' },
  { key: 'concise_cool', label: '清冷酷飒', desc: '短句直奔重点，外冷内热' },
];

const PROACTIVE_FREQ_OPTIONS: Array<{ key: ImProactiveFrequencyGear; label: string; desc: string }> = [
  { key: 'balanced', label: '适中 (推荐)', desc: '按作息自然联系' },
  { key: 'frequent', label: '粘人', desc: '想多找你聊聊天' },
  { key: 'calm', label: '克制', desc: '不常主动打扰' },
  { key: 'silent', label: '静默', desc: '仅等你主动联系' },
];

export function ImCompanionPersonaModal({
  visible,
  onClose,
  companionName,
  settings,
  onUpdateSettings,
}: ImCompanionPersonaModalProps) {
  const insets = useSafeAreaInsets();

  const personalization = settings.personalization;

  const [userNickname, setUserNickname] = useState(personalization?.userNickname || '');
  const [companionCallName, setCompanionCallName] = useState(personalization?.companionCallName || '');
  const [relationship, setRelationship] = useState<ImRelationshipPreset>(
    personalization?.relationshipPreset || 'close_friend'
  );
  const [replyStyle, setReplyStyle] = useState<ImReplyStyleGear>(
    personalization?.replyStyleGear || 'balanced'
  );
  const [proactiveFreq, setProactiveFreq] = useState<ImProactiveFrequencyGear>(
    personalization?.proactiveFrequencyGear || 'balanced'
  );
  const [bubbleSkin, setBubbleSkin] = useState<ImBubbleSkinPreset>(
    personalization?.bubbleSkinPreset || 'wechat_green'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [customColorModalVisible, setCustomColorModalVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setUserNickname(settings.personalization?.userNickname || '');
      setCompanionCallName(settings.personalization?.companionCallName || '');
      setRelationship(settings.personalization?.relationshipPreset || 'close_friend');
      setReplyStyle(settings.personalization?.replyStyleGear || 'balanced');
      setProactiveFreq(settings.personalization?.proactiveFrequencyGear || 'balanced');
      setBubbleSkin(settings.personalization?.bubbleSkinPreset || 'wechat_green');
      setCustomColorModalVisible(false);
      setKeyboardHeight(0);
    }
  }, [visible, settings.personalization]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated: ImCompanionPersonalization = {
        ...settings.personalization,
        userNickname: userNickname.trim() || undefined,
        companionCallName: companionCallName.trim() || undefined,
        relationshipPreset: relationship,
        replyStyleGear: replyStyle,
        proactiveFrequencyGear: proactiveFreq,
        bubbleSkinPreset: bubbleSkin,
        milestones: settings.personalization?.milestones,
      };
      await onUpdateSettings({ personalization: updated });
      onClose();
    } catch {
      Alert.alert('保存失败', '无法保存个性化设置，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      hardwareAccelerated
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        {/* 点击透明遮罩区域关闭定制弹窗 */}
        <Pressable
          accessibilityLabel="点击遮罩关闭"
          onPress={onClose}
          style={StyleSheet.absoluteFillObject}
        />
        {/* 弹窗实体 Sheet：拦截所有点击，杜绝穿透；动态吸附软键盘高度 */}
        <View
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
          style={[
            styles.modalSheet,
            {
              paddingBottom: Math.max(insets.bottom, 16) + keyboardHeight,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.modalTitle}>专属相处与个性定制</Text>
              <Text style={styles.modalSubTitle}>与 {companionName} 的契约羁绊与双向默契</Text>
            </View>
            <Pressable
              accessibilityLabel="关闭个性化设置"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Ionicons color="#6B7280" name="close" size={22} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
            keyboardShouldPersistTaps="handled"
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}
          >
            {/* 1. 称呼与称谓契约 */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons color="#3B82F6" name="heart-outline" size={18} />
                <Text style={styles.sectionTitle}>彼此专属称谓</Text>
              </View>
              <Text style={styles.sectionTip}>
                写入第一层前缀契约，伴侣将永久铭记并以此称呼你。
              </Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>伴侣称呼我为：</Text>
                <TextInput
                  accessibilityLabel="伴侣称呼我为"
                  maxLength={12}
                  onChangeText={setUserNickname}
                  placeholder="例如：小林 / 阿哲 / 你的名字"
                  placeholderTextColor="#9CA3AF"
                  style={styles.textInput}
                  value={userNickname}
                />
              </View>
              <View style={[styles.inputRow, { marginTop: 8 }]}>
                <Text style={styles.inputLabel}>我称呼伴侣为：</Text>
                <TextInput
                  accessibilityLabel="我称呼伴侣为"
                  maxLength={12}
                  onChangeText={setCompanionCallName}
                  placeholder={`默认：${companionName}`}
                  placeholderTextColor="#9CA3AF"
                  style={styles.textInput}
                  value={companionCallName}
                />
              </View>
            </View>

            {/* 2. 羁绊关系设定 */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons color="#8B5CF6" name="people-outline" size={18} />
                <Text style={styles.sectionTitle}>相处羁绊关系</Text>
              </View>
              <View style={styles.chipGrid}>
                {RELATIONSHIP_OPTIONS.map((item) => {
                  const selected = relationship === item.key;
                  return (
                    <Pressable
                      accessibilityLabel={`羁绊关系：${item.label}`}
                      accessibilityRole="button"
                      key={item.key}
                      onPress={() => setRelationship(item.key)}
                      style={[styles.chipItem, selected && styles.chipItemSelected]}
                    >
                      <Text style={[styles.chipTitle, selected && styles.chipTitleSelected]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.chipDesc, selected && styles.chipDescSelected]}>
                        {item.desc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 3. 回复风格档位 */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons color="#10B981" name="chatbubbles-outline" size={18} />
                <Text style={styles.sectionTitle}>说话风格基调</Text>
              </View>
              <View style={styles.chipGrid}>
                {REPLY_STYLE_OPTIONS.map((item) => {
                  const selected = replyStyle === item.key;
                  return (
                    <Pressable
                      accessibilityLabel={`说话风格：${item.label}`}
                      accessibilityRole="button"
                      key={item.key}
                      onPress={() => setReplyStyle(item.key)}
                      style={[styles.chipItem, selected && styles.chipItemSelected]}
                    >
                      <Text style={[styles.chipTitle, selected && styles.chipTitleSelected]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.chipDesc, selected && styles.chipDescSelected]}>
                        {item.desc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 4. 主动联系频次 */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons color="#F59E0B" name="time-outline" size={18} />
                <Text style={styles.sectionTitle}>主动联系频次</Text>
              </View>
              <View style={styles.chipGrid}>
                {PROACTIVE_FREQ_OPTIONS.map((item) => {
                  const selected = proactiveFreq === item.key;
                  return (
                    <Pressable
                      accessibilityLabel={`主动频次：${item.label}`}
                      accessibilityRole="button"
                      key={item.key}
                      onPress={() => setProactiveFreq(item.key)}
                      style={[styles.chipItem, selected && styles.chipItemSelected]}
                    >
                      <Text style={[styles.chipTitle, selected && styles.chipTitleSelected]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.chipDesc, selected && styles.chipDescSelected]}>
                        {item.desc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 5. 气泡皮肤主题 */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons color="#EC4899" name="color-palette-outline" size={18} />
                <Text style={styles.sectionTitle}>聊天气泡专属配色</Text>
              </View>
              <View style={styles.skinGrid}>
                {(Object.keys(BUBBLE_SKIN_PRESETS) as ImBubbleSkinPreset[]).map((key) => {
                  const skin = BUBBLE_SKIN_PRESETS[key];
                  const selected = bubbleSkin === key;
                  return (
                    <Pressable
                      accessibilityLabel={`气泡配色：${skin.label}`}
                      accessibilityRole="button"
                      key={key}
                      onPress={() => setBubbleSkin(key)}
                      style={[styles.skinItem, selected && styles.skinItemSelected]}
                    >
                      <View style={[styles.skinCircle, { backgroundColor: skin.userBubbleBg }]} />
                      <Text style={[styles.skinLabel, selected && styles.skinLabelSelected]}>
                        {skin.label}
                      </Text>
                    </Pressable>
                  );
                })}

                {/* 若当前激活的是自定义颜色，显示自定义色号标签 */}
                {Boolean(bubbleSkin && !BUBBLE_SKIN_PRESETS[bubbleSkin]) && (
                  <Pressable
                    accessibilityLabel={`当前自定义气泡配色：${bubbleSkin}`}
                    accessibilityRole="button"
                    onPress={() => setCustomColorModalVisible(true)}
                    style={[styles.skinItem, styles.skinItemSelected]}
                  >
                    <View style={[styles.skinCircle, { backgroundColor: bubbleSkin }]} />
                    <Text style={[styles.skinLabel, styles.skinLabelSelected]}>
                      自定义 ({bubbleSkin})
                    </Text>
                    <Ionicons color="#BE185D" name="pencil" size={12} />
                  </Pressable>
                )}

                {/* 增加自定义颜色入口 */}
                <Pressable
                  accessibilityLabel="自定义气泡配色"
                  accessibilityRole="button"
                  onPress={() => setCustomColorModalVisible(true)}
                  style={[styles.skinItem, { borderColor: '#E2E8F0' }]}
                >
                  <Ionicons color="#6B7280" name="color-palette-outline" size={16} />
                  <Text style={styles.skinLabel}>+ 自定义</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Save Action */}
          <View style={styles.footerRow}>
            <Pressable
              accessibilityLabel="取消"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="保存定制契约"
              accessibilityRole="button"
              disabled={isSaving}
              onPress={handleSave}
              style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
            >
              <Text style={styles.saveBtnText}>{isSaving ? '保存中...' : '保存契约'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ImCustomBubbleColorModal
        currentColor={bubbleSkin}
        onClose={() => setCustomColorModalVisible(false)}
        onConfirm={(hex) => setBubbleSkin(hex)}
        visible={customColorModalVisible}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#E7EAF0',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 16,
    width: '100%',
    overflow: 'hidden',
  },
  scrollView: {
    flexShrink: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  sectionTip: {
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    color: '#4B5563',
    width: 90,
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#1C1C1E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipItem: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minHeight: 58,
  },
  chipItemSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  chipTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  chipTitleSelected: {
    color: '#2563EB',
  },
  chipDesc: {
    fontSize: 11,
    color: '#6B7280',
  },
  chipDescSelected: {
    color: '#3B82F6',
  },
  skinGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  skinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  skinItemSelected: {
    backgroundColor: '#FDF2F8',
    borderColor: '#EC4899',
  },
  skinCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  skinLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  skinLabelSelected: {
    color: '#BE185D',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },
  saveBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
