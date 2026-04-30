import { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ipRepository } from '../database';
import { AppScreen } from '../components/AppScreen';
import { Header } from '../components/Header';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, layout, radius, shadows, spacing, typography } from '../design/tokens';

interface CreateIpScreenProps {
  onCancel: () => void;
  onCreated: (ipId: number) => void;
}

export function CreateIpScreen({ onCancel, onCreated }: CreateIpScreenProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedName = useMemo(() => name.trim(), [name]);

  async function handleCreate() {
    Keyboard.dismiss();

    if (!trimmedName) {
      setErrorMessage('请输入 IP 名称。');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const createdIp = await ipRepository.create({
        name: trimmedName,
        description,
        isFavorite,
      });

      onCreated(createdIp.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setErrorMessage(`创建失败：${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen
      dismissKeyboardOnTouch
      footer={
        <View style={styles.actions}>
          <PrimaryButton label="创建IP" loading={isSubmitting} onPress={handleCreate} />
          <PrimaryButton disabled={isSubmitting} label="取消返回" onPress={onCancel} variant="ghost" />
        </View>
      }
      scrollable
    >
      <Header onBack={onCancel} title="新建IP" />

      <View style={styles.formWrap}>
        <View style={styles.fieldCard}>
          <Text style={styles.label}>IP名称</Text>
          <TextInput
            autoCapitalize="none"
            editable={!isSubmitting}
            enablesReturnKeyAutomatically
            maxLength={40}
            onChangeText={(value) => {
              setName(value);
              if (errorMessage) {
                setErrorMessage(null);
              }
            }}
            onSubmitEditing={handleCreate}
            placeholder="例如：小夏、海边系列、品牌KV"
            placeholderTextColor={colors.text.placeholder}
            returnKeyType="done"
            selectionColor={colors.primary.default}
            style={styles.singleLineInput}
            value={name}
          />
        </View>

        <View style={styles.fieldCard}>
          <Text style={styles.label}>简介</Text>
          <TextInput
            editable={!isSubmitting}
            maxLength={160}
            multiline
            onChangeText={(value) => {
              setDescription(value);
              if (errorMessage) {
                setErrorMessage(null);
              }
            }}
            placeholder="可选，用一句话说明这个 IP 的角色、主题或用途。"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={styles.multilineInput}
            textAlignVertical="top"
            value={description}
          />
        </View>

        <View style={styles.favoriteCard}>
          <View style={styles.favoriteCopy}>
            <Text style={styles.label}>是否收藏</Text>
            <Text style={styles.favoriteHint}>收藏后会出现在首页的“收藏”筛选里。</Text>
          </View>
          <Switch
            disabled={isSubmitting}
            onValueChange={setIsFavorite}
            thumbColor={colors.background.surface}
            trackColor={{ false: colors.border.strong, true: colors.primary.default }}
            value={isFavorite}
          />
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: spacing[4],
  },
  fieldCard: {
    ...shadows.xs,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    padding: spacing[5],
  },
  label: {
    ...typography.textStyles.sectionTitle,
  },
  singleLineInput: {
    ...typography.textStyles.body,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  multilineInput: {
    ...typography.textStyles.body,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text.title,
    minHeight: 132,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  favoriteCard: {
    ...shadows.xs,
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[4],
    justifyContent: 'space-between',
    padding: spacing[5],
  },
  favoriteCopy: {
    flex: 1,
    gap: spacing[1],
    maxWidth: layout.maxReadableWidth,
  },
  favoriteHint: {
    ...typography.textStyles.caption,
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  actions: {
    gap: spacing[3],
    paddingTop: spacing[2],
  },
});
