import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppDialog } from '../components/AppDialog';
import { GROUP_TYPE_OPTIONS, type GroupTypeValue } from '../constants/groups';
import { DESCRIPTION_MAX_LENGTH, GROUP_NAME_MAX_LENGTH } from '../constants/limits';
import {
  groupRepository,
  ipRepository,
  runWithDatabaseSpace,
  type GroupRecord,
  type IpRecord,
  type PixorySpace,
} from '../database';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';

// ==========================================
// Atelier Curatorial Design System Tokens
// ==========================================
const atelierColors = {
  surface: '#f9f9f9',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f3f3f4',
  surfaceVariant: '#e2e2e2',
  onSurface: '#1a1c1c',
  onSurfaceVariant: '#444748',
  outline: '#747878',
  outlineVariant: '#c4c7c7',
  primary: '#000000',
  onPrimary: '#ffffff',
  primaryContainer: '#1c1b1b',
  error: '#ba1a1a', // standard error red
};

const atelierTypography = {
  titleSm: {
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 20,
    letterSpacing: -0.075,
  },
  bodyMd: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
    letterSpacing: 0.065,
  },
  labelSm: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
    letterSpacing: 0.24,
  },
  captionMono: {
    fontSize: 10,
    fontWeight: '500' as const,
    lineHeight: 12,
    letterSpacing: 0.8,
  },
  captionBold: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 14,
    letterSpacing: 0.66,
  },
};

const atelierSpacing = {
  margin: 16,
  spaceXl: 32,
  spaceLg: 20,
  spaceMd: 12,
  spaceSm: 8,
  spaceXs: 4,
};

const atelierRadius = {
  DEFAULT: 4,
  lg: 4,
  xl: 8,
  full: 9999,
};

interface EditGroupScreenProps {
  ipId: number;
  groupId: number;
  space?: PixorySpace;
  onBack: () => void;
  onDeleted: () => void;
  onSaved: () => void;
}

export function EditGroupScreen({
  ipId,
  groupId,
  space = 'normal',
  onBack,
  onDeleted,
  onSaved,
}: EditGroupScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [customType, setCustomType] = useState('');
  const [description, setDescription] = useState('');
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);

  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const { data, errorMessage } = useScreenLoad<{ ip: IpRecord | null; group: GroupRecord | null }>(
    async () => {
      const [ip, group] = await runWithDatabaseSpace(space, (db) =>
        Promise.all([ipRepository.findById(db, ipId), groupRepository.findById(db, groupId)])
      );

      if (!group) {
        throw new Error('没有找到这个分组。');
      }

      return { group, ip };
    },
    ['EditGroupScreen', groupId, ipId, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组失败：${message}`;
      },
      initialData: { group: null, ip: null },
    }
  );

  const group = data?.group ?? null;
  const ip = data?.ip ?? null;
  const trimmedName = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    if (!group) {
      return;
    }

    setName(group.name);
    setDescription(group.description ?? '');

    // Reverse parse type vs customType
    const standardOptions = GROUP_TYPE_OPTIONS.map((o) => o.value) as string[];
    // 'custom' itself is technically an option value in GROUP_TYPE_OPTIONS,
    // but in DB, a true custom type saves its actual string instead of 'custom'.
    if (standardOptions.includes(group.type) && group.type !== 'custom') {
      setType(group.type);
    } else {
      setType('custom');
      setCustomType(group.type === 'custom' ? '' : group.type);
    }
  }, [group]);

  function handleSave() {
    const selectedType = type === 'custom' && customType.trim() ? customType.trim() : type;

    void runSubmit(
      async () => {
        const updated = await runWithDatabaseSpace(space, (db) =>
          groupRepository.update(db, groupId, {
            description,
            name: trimmedName,
            type: selectedType as GroupTypeValue,
          })
        );

        if (!updated) {
          throw new Error('没有找到这个分组。');
        }

        onSaved();
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `保存失败：${message}`;
        },
        validate: () => {
          if (!trimmedName) {
            return '请输入分组名称。';
          }
          if (!type) {
            return '请选择分组类型。';
          }
          if (type === 'custom' && !customType.trim()) {
            return '请输入自定义类型名称。';
          }
          return null;
        },
      }
    );
  }

  function handleDelete() {
    if (!group || isSubmitting) {
      return;
    }
    setIsDeleteDialogVisible(true);
  }

  function confirmDelete() {
    if (!group) {
      return;
    }

    setIsDeleteDialogVisible(false);
    void runSubmit(
      async () => {
        const deletedCount = await runWithDatabaseSpace(space, (db) =>
          groupRepository.deleteById(db, group.id)
        );
        if (deletedCount === 0) {
          throw new Error('没有找到这个分组。');
        }

        onDeleted();
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `删除失败：${message}`;
        },
      }
    );
  }

  return (
    <>
      <View style={styles.root}>
        {/* Header */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 80 : 100}
          tint="light"
          style={[styles.header, { paddingTop: insets.top }]}
        >
          <View style={styles.headerInner}>
            <Pressable
              accessibilityLabel="取消并关闭"
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close" size={20} color={atelierColors.onSurface} />
            </Pressable>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                编辑分组
              </Text>
            </View>
            <View style={styles.headerRightSpacer} pointerEvents="none" />
          </View>
        </BlurView>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 56, paddingBottom: insets.bottom + atelierSpacing.margin },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formContainer}>
            {errorMessage ? (
              <Text style={styles.topErrorText}>{errorMessage}</Text>
            ) : null}
            
            {/* Field 1: 所属 IP */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>所属 IP</Text>
              <View style={[styles.fieldContent, styles.readonlyFieldContent]}>
                <Text style={styles.readonlyFieldText}>{ip?.name ?? `IP #${ipId}`}</Text>
              </View>
            </View>

            {/* Field 2: 分组名称 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>分组名称</Text>
              <View style={styles.fieldContent}>
                <TextInput
                  autoCapitalize="none"
                  editable={!isSubmitting && !!group}
                  enablesReturnKeyAutomatically
                  maxLength={GROUP_NAME_MAX_LENGTH}
                  onChangeText={(value) => {
                    setName(value);
                    if (submitError) clearSubmitError();
                  }}
                  placeholder="例如：2026 夏季、夜景场景、海报KV"
                  placeholderTextColor={atelierColors.outline}
                  style={styles.textInput}
                  value={name}
                />
              </View>
            </View>

            {/* Field 3: 分组类型 */}
            <View style={styles.fieldGroup}>
              <View style={styles.typeLabelRow}>
                <Text style={styles.fieldLabel}>分组类型</Text>
                <Text style={styles.typeLabelHint}>单选</Text>
              </View>

              <View style={styles.radioList}>
                {GROUP_TYPE_OPTIONS.map((option) => {
                  const isSelected = type === option.value;
                  const isCustom = option.value === 'custom';

                  if (isCustom) {
                    return (
                      <View
                        key={option.value}
                        style={[
                          styles.customOptionContainer,
                          isSelected && styles.customOptionContainerSelected,
                        ]}
                      >
                        <Pressable
                          disabled={isSubmitting || !group}
                          onPress={() => setType(option.value)}
                          style={({ pressed }) => [
                            styles.radioOptionInner,
                            pressed && !isSubmitting && !!group && styles.activePress,
                          ]}
                        >
                          <View style={styles.radioOptionTextGroup}>
                            <Text style={styles.radioOptionTitle}>{option.label}</Text>
                          </View>
                          <View
                            style={[
                              styles.radioCircle,
                              isSelected && styles.radioCircleSelected,
                              isSelected && styles.shadowSm,
                            ]}
                          >
                            {isSelected && (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color={atelierColors.onPrimary}
                              />
                            )}
                          </View>
                        </Pressable>

                        {isSelected && (
                          <View style={styles.customInputSection}>
                            <View style={styles.customInputHeader}>
                              <Text style={styles.fieldLabel}>自定义类型名称</Text>
                            </View>
                            <View style={styles.customInputField}>
                              <TextInput
                                autoCapitalize="none"
                                editable={!isSubmitting && !!group}
                                enablesReturnKeyAutomatically
                                maxLength={12}
                                onChangeText={(value) => {
                                  setCustomType(value);
                                  if (submitError) clearSubmitError();
                                }}
                                placeholder=""
                                placeholderTextColor={atelierColors.outline}
                                style={styles.customTextInput}
                                value={customType}
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  }

                  return (
                    <Pressable
                      key={option.value}
                      disabled={isSubmitting || !group}
                      onPress={() => setType(option.value)}
                      style={({ pressed }) => [
                        styles.radioOption,
                        isSelected ? styles.shadowMd : styles.shadowSm,
                        pressed && !isSubmitting && !!group && styles.activePress,
                      ]}
                    >
                      <View style={styles.radioOptionTextGroup}>
                        <Text
                          style={[
                            styles.radioOptionTitle,
                            isSelected && styles.radioOptionTitleSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                        <Text style={styles.radioOptionDesc}>{option.description}</Text>
                      </View>
                      <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color={atelierColors.onPrimary} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Field 4: 分组描述 */}
            <View style={styles.fieldGroup}>
              <View style={styles.typeLabelRow}>
                <Text style={styles.fieldLabel}>分组描述 (可选)</Text>
              </View>
              <View style={[styles.fieldContent, styles.textareaContent]}>
                <TextInput
                  editable={!isSubmitting && !!group}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  multiline
                  onChangeText={(value) => {
                    setDescription(value);
                    if (submitError) clearSubmitError();
                  }}
                  placeholder="例如：活动主视觉、角色立绘、社媒图。"
                  placeholderTextColor={atelierColors.outline}
                  style={[styles.textInput, styles.textarea]}
                  textAlignVertical="top"
                  value={description}
                />
              </View>
            </View>

            {/* Actions */}
            <View style={styles.submitContainer}>
              {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
              <Pressable
                disabled={isSubmitting || !group}
                onPress={handleSave}
                style={({ pressed }) => [
                  styles.submitButton,
                  pressed && !isSubmitting && !!group && styles.activePress,
                  (isSubmitting || !group) && { opacity: 0.9 },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={atelierColors.onPrimary} />
                ) : (
                  <Text style={styles.submitButtonText}>保存分组</Text>
                )}
              </Pressable>

              {group && (
                <Pressable
                  disabled={isSubmitting}
                  onPress={handleDelete}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && !isSubmitting && { opacity: 0.76 },
                  ]}
                >
                  <Text style={styles.deleteButtonText}>删除分组</Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </View>

      <AppDialog
        danger
        message={group ? `删除「${group.name}」后，分组内图片会保留并移动到未分组。` : ''}
        onClose={() => setIsDeleteDialogVisible(false)}
        onPrimary={confirmDelete}
        primaryLabel="确认删除"
        title="删除分组"
        visible={isDeleteDialogVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: atelierColors.surface,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: 'rgba(249, 249, 249, 0.8)',
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerInner: {
    height: 56,
    paddingHorizontal: atelierSpacing.margin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    marginLeft: -atelierSpacing.spaceXs,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: atelierSpacing.spaceXs,
  },
  headerTitle: {
    ...atelierTypography.titleSm,
    color: atelierColors.onSurface,
  },
  headerRightSpacer: {
    minWidth: 44,
    minHeight: 44,
  },
  scrollContent: {},
  formContainer: {
    paddingHorizontal: atelierSpacing.margin,
    paddingTop: atelierSpacing.spaceMd,
    paddingBottom: atelierSpacing.spaceXl,
    gap: atelierSpacing.spaceLg,
  },
  fieldGroup: {
    gap: atelierSpacing.spaceXs,
  },
  fieldLabel: {
    ...atelierTypography.labelSm,
    color: atelierColors.onSurfaceVariant,
  },
  fieldContent: {
    backgroundColor: atelierColors.surfaceContainerLowest,
    borderRadius: atelierRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  readonlyFieldContent: {
    height: 44,
    paddingHorizontal: atelierSpacing.margin,
    justifyContent: 'center',
  },
  readonlyFieldText: {
    ...atelierTypography.titleSm,
    color: atelierColors.onSurface,
  },
  textInput: {
    ...atelierTypography.bodyMd,
    color: atelierColors.onSurface,
    height: 48,
    paddingHorizontal: atelierSpacing.margin,
  },
  typeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeLabelHint: {
    ...atelierTypography.captionMono,
    color: atelierColors.outline,
  },
  radioList: {
    gap: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: atelierColors.surfaceContainerLowest,
    borderRadius: atelierRadius.xl,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  shadowSm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  shadowMd: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  activePress: {
    transform: [{ scale: 0.99 }],
  },
  radioOptionTextGroup: {
    flex: 1,
    paddingRight: 8,
    gap: 2,
  },
  radioOptionTitle: {
    ...atelierTypography.titleSm,
    color: atelierColors.onSurface,
  },
  radioOptionTitleSelected: {
    color: atelierColors.primary,
  },
  radioOptionDesc: {
    ...atelierTypography.captionBold,
    color: atelierColors.onSurfaceVariant,
    fontWeight: '400',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: atelierRadius.full,
    borderWidth: 1,
    borderColor: atelierColors.outlineVariant,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    backgroundColor: atelierColors.primary,
    borderColor: atelierColors.primary,
    borderWidth: 0,
  },
  customOptionContainer: {
    backgroundColor: atelierColors.surfaceContainerLowest,
    borderRadius: atelierRadius.xl,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  customOptionContainerSelected: {
    borderColor: atelierColors.primary,
    shadowColor: atelierColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  radioOptionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  customInputSection: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 226, 226, 0.6)',
    backgroundColor: 'rgba(243, 243, 244, 0.4)',
    gap: 10,
  },
  customInputHeader: {
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customInputField: {
    backgroundColor: atelierColors.surfaceContainerLowest,
    borderRadius: atelierRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(196, 199, 199, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  customTextInput: {
    ...atelierTypography.bodyMd,
    color: atelierColors.onSurface,
    padding: 0,
    minHeight: 20,
  },
  textareaContent: {
    padding: atelierSpacing.margin,
  },
  textarea: {
    height: undefined,
    minHeight: 70,
    paddingHorizontal: 0,
    lineHeight: 24,
  },
  submitContainer: {
    paddingTop: atelierSpacing.spaceSm,
    gap: 16,
  },
  topErrorText: {
    ...atelierTypography.bodyMd,
    color: atelierColors.error,
    textAlign: 'center',
    marginBottom: atelierSpacing.spaceMd,
  },
  errorText: {
    ...atelierTypography.bodyMd,
    color: atelierColors.error,
    textAlign: 'center',
  },
  submitButton: {
    width: '100%',
    height: 48,
    backgroundColor: atelierColors.primary,
    borderRadius: atelierRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  submitButtonText: {
    ...atelierTypography.titleSm,
    color: atelierColors.onPrimary,
  },
  deleteButton: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  deleteButtonText: {
    ...atelierTypography.captionBold,
    color: atelierColors.error,
  },
});
