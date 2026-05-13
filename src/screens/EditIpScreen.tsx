import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { FormInputRow } from '../components/FormInputRow';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { LightFormSection } from '../components/LightFormSection';
import { SwitchSettingRow } from '../components/SwitchSettingRow';
import { IP_NAME_MAX_LENGTH } from '../constants/limits';
import { colors, rhythm, typography } from '../design/tokens';
import { ipRepository, runWithDatabaseSpace, type IpRecord, type PixorySpace } from '../database';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';

interface EditIpScreenProps {
  ipId: number;
  space?: PixorySpace;
  onBack: () => void;
  onSaved: () => void;
}

export function EditIpScreen({ ipId, space = 'normal', onBack, onSaved }: EditIpScreenProps) {
  const { data: ip, isLoading, errorMessage, reload } = useScreenLoad<IpRecord>(
    async () => {
      const record = await runWithDatabaseSpace(space, (db) => ipRepository.findById(db, ipId));
      if (!record) {
        throw new Error('没有找到这个 IP。');
      }

      return record;
    },
    [ipId, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return message === '没有找到这个 IP。' ? message : `读取 IP 失败：${message}`;
      },
    }
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();

  const trimmedName = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    if (ip) {
      setName(ip.name);
      setDescription(ip.description ?? '');
      setIsFavorite(ip.isFavorite);
    }
  }, [ip]);

  function handleSave() {
    void runSubmit(async () => {
      const updated = await runWithDatabaseSpace(space, (db) => ipRepository.update(db, ipId, {
        name: trimmedName,
        description,
        isFavorite,
      }));

      if (!updated) {
        throw new Error('保存失败，当前 IP 不存在。');
      }

      onSaved();
    }, {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return message === '保存失败，当前 IP 不存在。' ? message : `保存失败：${message}`;
      },
      validate: () => (!trimmedName ? '请输入 IP 名称。' : null),
    });
  }

  return (
    <FormScreenScaffold
      backgroundVariant="archive"
      errorMessage={submitError}
      onBack={onBack}
      primaryAction={{ disabled: !trimmedName || isLoading || !ip, label: '保存修改', loading: isSubmitting, onPress: handleSave }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onBack }}
      title="编辑IP"
    >
      <View style={styles.formWrap}>
        {isLoading && !ip ? (
          <ContentCard>
            <Text style={styles.hint}>正在读取当前 IP 数据…</Text>
          </ContentCard>
        ) : null}

        {errorMessage && !ip ? (
          <ContentCard>
            <Text style={styles.hint}>{errorMessage}</Text>
            <Text style={styles.reloadLink} onPress={reload}>
              重新加载
            </Text>
          </ContentCard>
        ) : null}

        {ip ? (
          <LightFormSection title="基础信息">
            <FormInputRow
              autoCapitalize="none"
              editable={!isSubmitting}
              hint="用于首页、详情和导入关联。"
              label="IP 名称"
              maxLength={IP_NAME_MAX_LENGTH}
              onChangeText={(value) => {
                setName(value);
                if (submitError) {
                  clearSubmitError();
                }
              }}
              placeholder="例如：小夏、海边系列、品牌KV"
              value={name}
            />

            <FormTextareaRow
              editable={!isSubmitting}
              hint="显示在详情页顶部。"
              label="简介"
              maxLength={200}
              minHeight={92}
              onChangeText={(value) => {
                setDescription(value);
                if (submitError) {
                  clearSubmitError();
                }
              }}
              placeholder="可选，用一句话说明这个 IP 的角色、主题或用途。"
              value={description}
            />

            <SwitchSettingRow
              disabled={isSubmitting}
              hint="用于首页收藏筛选。"
              label="收藏状态"
              onValueChange={setIsFavorite}
              value={isFavorite}
            />
          </LightFormSection>
        ) : null}
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: rhythm.listCardGap,
  },
  hint: {
    ...typography.textStyles.body,
  },
  reloadLink: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
  },
});
