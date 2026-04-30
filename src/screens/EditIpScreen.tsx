import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { FormField } from '../components/FormField';
import { Header } from '../components/Header';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, layout, radius, spacing, typography } from '../design/tokens';
import { ipRepository, type IpRecord } from '../database';

interface EditIpScreenProps {
  ipId: number;
  onBack: () => void;
  onSaved: () => void;
}

export function EditIpScreen({ ipId, onBack, onSaved }: EditIpScreenProps) {
  const [ip, setIp] = useState<IpRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedName = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    let isMounted = true;

    async function loadIp() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const record = await ipRepository.findById(ipId);
        if (!isMounted) {
          return;
        }

        if (!record) {
          setErrorMessage('没有找到这个 IP。');
          setIp(null);
          return;
        }

        setIp(record);
        setName(record.name);
        setDescription(record.description ?? '');
        setIsFavorite(record.isFavorite);
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取 IP 失败：${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadIp();

    return () => {
      isMounted = false;
    };
  }, [ipId]);

  async function handleSave() {
    if (!trimmedName) {
      setErrorMessage('请输入 IP 名称。');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await ipRepository.update(ipId, {
        name: trimmedName,
        description,
        isFavorite,
      });

      if (!updated) {
        setErrorMessage('保存失败，当前 IP 不存在。');
        return;
      }

      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setErrorMessage(`保存失败：${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen scrollable>
      <Header onBack={onBack} title="编辑IP" />

      <View style={styles.formWrap}>
        <ContentCard>
          <FormField hint="名称会用于首页卡片、详情页和导入关联。" label="IP名称">
            <TextInput
              autoCapitalize="none"
              maxLength={40}
              onChangeText={setName}
              placeholder="例如：小夏、海边系列、品牌KV"
              placeholderTextColor={colors.text.placeholder}
              selectionColor={colors.primary.default}
              style={styles.singleLineInput}
              value={name}
            />
          </FormField>
        </ContentCard>

        <ContentCard>
          <FormField hint="简介会显示在 IP 详情页顶部。" label="简介">
            <TextInput
              maxLength={200}
              multiline
              onChangeText={setDescription}
              placeholder="可选，用一句话说明这个 IP 的角色、主题或用途。"
              placeholderTextColor={colors.text.placeholder}
              selectionColor={colors.primary.default}
              style={styles.multilineInput}
              textAlignVertical="top"
              value={description}
            />
          </FormField>
        </ContentCard>

        <ContentCard style={styles.favoriteCard}>
          <View style={styles.favoriteCopy}>
            <Text style={styles.label}>收藏状态</Text>
            <Text style={styles.hint}>收藏后会出现在首页的“收藏”筛选里。</Text>
          </View>
          <Switch
            onValueChange={setIsFavorite}
            thumbColor={colors.background.surface}
            trackColor={{ false: colors.border.strong, true: colors.primary.default }}
            value={isFavorite}
          />
        </ContentCard>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {isLoading && !ip ? <Text style={styles.hint}>正在读取当前 IP 数据…</Text> : null}
      </View>

      <View style={styles.actions}>
        <PrimaryButton disabled={!trimmedName || isLoading} label="保存修改" loading={isSubmitting} onPress={handleSave} />
        <PrimaryButton label="取消返回" onPress={onBack} variant="ghost" />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: spacing[4],
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  favoriteCopy: {
    flex: 1,
    gap: spacing[1],
    maxWidth: layout.maxReadableWidth,
  },
  label: {
    ...typography.textStyles.sectionTitle,
  },
  hint: {
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
