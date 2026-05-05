import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DESCRIPTION_MAX_LENGTH, IP_NAME_MAX_LENGTH } from '../constants/limits';
import { ipRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import { spacing } from '../design/tokens';
import { FormInputRow } from '../components/FormInputRow';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { LightFormSection } from '../components/LightFormSection';
import { SwitchSettingRow } from '../components/SwitchSettingRow';
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
    void runSubmit(async () => {
      const createdIp = await runWithDatabaseSpace(space, () => ipRepository.create({
        name: trimmedName,
        description,
        isFavorite,
      }));

      onCreated(createdIp.id);
    }, {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `创建失败：${message}`;
      },
      validate: () => (!trimmedName ? '请输入 IP 名称。' : null),
    });
  }

  return (
    <FormScreenScaffold
      errorMessage={submitError}
      onBack={onCancel}
      primaryAction={{ label: '创建IP', loading: isSubmitting, onPress: handleCreate }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onCancel }}
      title="新建IP"
    >
      <View style={styles.formWrap}>
        <LightFormSection title="基础信息">
          <FormInputRow
            autoCapitalize="none"
            editable={!isSubmitting}
            enablesReturnKeyAutomatically
            label="IP 名称"
            maxLength={IP_NAME_MAX_LENGTH}
            onChangeText={(value) => {
              setName(value);
              if (submitError) {
                clearSubmitError();
              }
            }}
            onSubmitEditing={handleCreate}
            placeholder="例如：小夏、海边系列、品牌KV"
            returnKeyType="done"
            value={name}
          />

          <FormTextareaRow
            editable={!isSubmitting}
            hint="显示在详情页。"
            label="简介"
            maxLength={DESCRIPTION_MAX_LENGTH}
            minHeight={92}
            onChangeText={(value) => {
              setDescription(value);
              if (submitError) {
                clearSubmitError();
              }
            }}
            placeholder="一句话说明角色、主题或用途。"
            value={description}
          />

          <SwitchSettingRow
            disabled={isSubmitting}
            hint="用于首页收藏筛选。"
            label="是否收藏"
            onValueChange={setIsFavorite}
            value={isFavorite}
          />
        </LightFormSection>
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: spacing[3],
  },
});
