import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { GROUP_NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '../constants/limits';
import { GROUP_TYPE_OPTIONS, type GroupTypeValue } from '../constants/groups';
import { premiumColors, radius, spacing, typography } from '../design/tokens';
import { groupRepository, ipRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';

interface CreateGroupScreenProps {
  ipId: number;
  space?: PixorySpace;
  ipName?: string;
  onBack: () => void;
  onCreated: () => void;
}

export function CreateGroupScreen({ ipId, space = 'normal', ipName, onBack, onCreated }: CreateGroupScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupTypeValue | null>(null);
  const [customType, setCustomType] = useState('');
  const [description, setDescription] = useState('');
  const [showAllTypes, setShowAllTypes] = useState(false);
  const {
    data: resolvedIpName,
  } = useScreenLoad(
    async () => {
      if (ipName) {
        return ipName;
      }

      const record = await runWithDatabaseSpace(space, (db) => ipRepository.findById(db, ipId));
      return record?.name ?? `IP #${ipId}`;
    },
    [ipId, ipName, space],
    { initialData: ipName ?? `IP #${ipId}` }
  );
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const trimmedName = useMemo(() => name.trim(), [name]);

  function handleCreate() {
    const selectedType = type === 'custom' && customType.trim() ? customType.trim() : type;

    void runSubmit(async () => {
      await runWithDatabaseSpace(space, (db) => groupRepository.create(db, {
        ipId,
        name: trimmedName,
        type: selectedType as GroupTypeValue,
        description,
      }));
      onCreated();
    }, {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `创建失败：${message}`;
      },
      validate: () => {
        if (!trimmedName) {
          return '请输入分组名称。';
        }

        if (!type) {
          return '请选择分组类型。';
        }

        if (type === 'custom' && !customType.trim()) {
          return '请输入自定义类型。';
        }

        return null;
      },
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenScaffold
        backgroundVariant="archive"
        contentContainerStyle={styles.container}
        errorMessage={submitError}
        scrollable
        showHeader={false}
      >
        {/* 所属 IP */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>所属 IP</Text>
          <View style={styles.readonlyInput}>
            <Text style={styles.readonlyText}>{resolvedIpName ?? `IP #${ipId}`}</Text>
          </View>
        </View>

        {/* 分组名称 */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>分组名称</Text>
          <TextInput
            autoCapitalize="none"
            editable={!isSubmitting}
            enablesReturnKeyAutomatically
            maxLength={GROUP_NAME_MAX_LENGTH}
            onChangeText={(value) => {
              setName(value);
              if (submitError) clearSubmitError();
            }}
            placeholder="例如：2026 夏季、夜景场景、海报KV"
            placeholderTextColor="rgba(0,0,0,0.3)"
            style={styles.input}
            value={name}
          />
        </View>

        {/* 分组类型 */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>分组类型</Text>
          <View style={styles.optionList}>
            {GROUP_TYPE_OPTIONS.slice(0, showAllTypes ? undefined : 3).map((option) => {
              const selected = type === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={() => setType(option.value)}
                  style={({ pressed }) => [
                    styles.optionRow,
                    selected && styles.optionRowSelected,
                    pressed && !isSubmitting && styles.optionRowPressed,
                    isSubmitting && styles.optionRowDisabled,
                  ]}
                >
                  <View style={styles.optionContent}>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {option.label}
                    </Text>
                    <Text style={styles.optionMeta}>{option.description}</Text>
                  </View>
                  <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                    {selected ? <Ionicons color="#FFF" name="checkmark" size={12} /> : null}
                  </View>
                </Pressable>
              );
            })}
            {!showAllTypes && GROUP_TYPE_OPTIONS.length > 3 && (
              <Pressable onPress={() => setShowAllTypes(true)} style={styles.expandButton}>
                <Text style={styles.expandButtonText}>显示更多类型</Text>
                <Ionicons name="chevron-down" size={14} color="rgba(92, 84, 77, 0.7)" />
              </Pressable>
            )}
            {type === 'custom' && (
              <TextInput
                autoCapitalize="none"
                editable={!isSubmitting}
                enablesReturnKeyAutomatically
                maxLength={20}
                onChangeText={(value) => {
                  setCustomType(value);
                  if (submitError) clearSubmitError();
                }}
                placeholder="请输入自定义类型，例如：立绘、周边"
                placeholderTextColor="rgba(0,0,0,0.3)"
                style={[styles.input, { marginTop: spacing[2] }]}
                value={customType}
              />
            )}
          </View>
        </View>

        {/* 分组描述 */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>分组描述 (可选)</Text>
          <TextInput
            editable={!isSubmitting}
            maxLength={DESCRIPTION_MAX_LENGTH}
            multiline
            onChangeText={(value) => {
              setDescription(value);
              if (submitError) clearSubmitError();
            }}
            placeholder="例如：活动主视觉、角色立绘、社媒图。"
            placeholderTextColor="rgba(0,0,0,0.3)"
            style={[styles.input, styles.textarea]}
            textAlignVertical="top"
            value={description}
          />
        </View>
      </ScreenScaffold>

      <View pointerEvents="box-none" style={[styles.floatingWrap, { bottom: insets.bottom + spacing[4] }]}>
        <BlurView intensity={30} style={styles.glassPill} tint="light">
          <Pressable
            disabled={isSubmitting || !trimmedName || !type}
            onPress={handleCreate}
            style={({ pressed }) => [
              styles.pillButton,
              pressed && styles.pillButtonPressed,
              (isSubmitting || !trimmedName || !type) && styles.pillButtonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={premiumColors.buttonText} />
            ) : (
              <Text style={styles.pillButtonText}>创建分组</Text>
            )}
          </Pressable>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[5],
    paddingBottom: 140,
    paddingTop: spacing[2],
  },
  inputGroup: {
    gap: spacing[2],
  },
  label: {
    ...typography.textStyles.bodyStrong,
    color: '#5C544D',
    marginLeft: spacing[1],
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: premiumColors.inputBg,
    borderColor: premiumColors.inputBorder,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#2C2A29',
    minHeight: 56,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  textarea: {
    minHeight: 120,
    paddingTop: spacing[4],
  },
  readonlyInput: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    justifyContent: 'center',
  },
  readonlyText: {
    ...typography.textStyles.body,
    color: '#5C544D',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  typeItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  typeItemSelected: {
    backgroundColor: premiumColors.buttonBg,
    borderColor: premiumColors.buttonBg,
  },
  typeItemText: {
    ...typography.textStyles.body,
    color: '#5C544D',
  },
  typeItemTextSelected: {
    color: premiumColors.buttonText,
    fontWeight: 'bold',
  },
  expandButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    justifyContent: 'center',
    paddingVertical: spacing[3],
  },
  expandButtonText: {
    ...typography.textStyles.caption,
    color: 'rgba(92, 84, 77, 0.7)',
  },
  floatingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  glassPill: {
    borderRadius: 100,
    elevation: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  pillButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(107, 96, 86, 0.85)', // Transparent premiumColors.buttonBg (#6B6056)
    justifyContent: 'center',
    minWidth: 200,
    paddingHorizontal: 48,
    paddingVertical: 18,
  },
  pillButtonPressed: {
    backgroundColor: 'rgba(107, 96, 86, 0.95)',
  },
  pillButtonDisabled: {
    backgroundColor: 'rgba(107, 96, 86, 0.4)',
  },
  pillButtonText: {
    ...typography.textStyles.bodyStrong,
    color: premiumColors.buttonText,
    letterSpacing: 0.5,
  },
  optionList: {
    gap: spacing[2],
  },
  optionRow: {
    alignItems: 'center',
    backgroundColor: premiumColors.inputBg,
    borderColor: premiumColors.inputBorder,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 64,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  optionRowSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#C7BCAE',
  },
  optionRowPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  optionRowDisabled: {
    opacity: 0.6,
  },
  optionContent: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    ...typography.textStyles.bodyStrong,
    color: premiumColors.inputText,
  },
  optionLabelSelected: {
    color: premiumColors.buttonBg,
  },
  optionMeta: {
    ...typography.textStyles.caption,
    color: 'rgba(92, 84, 77, 0.7)',
  },
  checkCircle: {
    alignItems: 'center',
    borderColor: 'rgba(0,0,0,0.15)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkCircleSelected: {
    backgroundColor: premiumColors.buttonBg,
    borderColor: premiumColors.buttonBg,
  },
});
