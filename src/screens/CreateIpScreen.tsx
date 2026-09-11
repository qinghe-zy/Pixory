import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { DESCRIPTION_MAX_LENGTH, IP_NAME_MAX_LENGTH } from '../constants/limits';
import { ipRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import { premiumColors, radius, spacing, typography } from '../design/tokens';
import { useSubmitState } from '../hooks/useSubmitState';

interface CreateIpScreenProps {
  space?: PixorySpace;
  onCancel: () => void;
  onCreated: (ipId: number) => void;
}

export function CreateIpScreen({ space = 'normal', onCancel, onCreated }: CreateIpScreenProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();

  const trimmedName = useMemo(() => name.trim(), [name]);

  function handleCreate() {
    void runSubmit(
      async () => {
        const createdIp = await runWithDatabaseSpace(space, (db) =>
          ipRepository.create(db, {
            name: trimmedName,
            description,
            isFavorite,
          })
        );
        onCreated(createdIp.id);
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `创建失败：${message}`;
        },
        validate: () => (!trimmedName ? '请输入 IP 名称。' : null),
      }
    );
  }

  return (
    <ScreenScaffold
      backgroundVariant="archive"
      errorMessage={submitError}
      onBack={onCancel}
      scrollable
      title="新建 IP"
    >
      <View style={styles.container}>
        {/* IP 名称 */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>名称</Text>
          <TextInput
            autoCapitalize="none"
            editable={!isSubmitting}
            enablesReturnKeyAutomatically
            maxLength={IP_NAME_MAX_LENGTH}
            onChangeText={(value) => {
              setName(value);
              if (submitError) clearSubmitError();
            }}
            onSubmitEditing={handleCreate}
            placeholder="例如：小夏、海边系列、品牌KV"
            placeholderTextColor="rgba(0,0,0,0.3)"
            returnKeyType="done"
            style={styles.input}
            value={name}
          />
        </View>

        {/* 简介 */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>简介</Text>
          <TextInput
            editable={!isSubmitting}
            maxLength={DESCRIPTION_MAX_LENGTH}
            multiline
            onChangeText={(value) => {
              setDescription(value);
              if (submitError) clearSubmitError();
            }}
            placeholder="一句话说明角色、主题或用途"
            placeholderTextColor="rgba(0,0,0,0.3)"
            style={[styles.input, styles.textarea]}
            textAlignVertical="top"
            value={description}
          />
        </View>

        {/* 是否收藏 */}
        <View style={styles.switchContainer}>
          <Text style={styles.label}>加入收藏</Text>
          <Switch
            disabled={isSubmitting}
            onValueChange={setIsFavorite}
            thumbColor="#FFFFFF"
            trackColor={{ false: premiumColors.switchInactive, true: premiumColors.switchActive }}
            value={isFavorite}
          />
        </View>

        {/* 内联创建按钮 */}
        <View style={styles.actionContainer}>
          <Pressable
            disabled={isSubmitting}
            onPress={handleCreate}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              isSubmitting && styles.buttonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={premiumColors.buttonText} />
            ) : (
              <Text style={styles.buttonText}>创建 IP</Text>
            )}
          </Pressable>
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[5],
    paddingBottom: 120,
    paddingTop: spacing[4],
  },
  inputGroup: {
    gap: spacing[2],
  },
  label: {
    ...typography.textStyles.bodyStrong,
    color: '#5C544D', // 柔和的深褐灰，代替死黑
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
  switchContainer: {
    alignItems: 'center',
    backgroundColor: premiumColors.inputBg,
    borderColor: premiumColors.inputBorder,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  actionContainer: {
    alignItems: 'center',
    marginTop: spacing[8],
  },
  button: {
    alignItems: 'center',
    backgroundColor: premiumColors.buttonBg,
    borderRadius: 100, // 完美的半圆胶囊
    elevation: 4,
    minWidth: 160,
    paddingHorizontal: 48,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.textStyles.bodyStrong,
    color: premiumColors.buttonText,
    letterSpacing: 0.5,
  },
});
