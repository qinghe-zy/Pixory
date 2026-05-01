import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DESCRIPTION_MAX_LENGTH, IP_NAME_MAX_LENGTH } from '../constants/limits';
import { ipRepository } from '../database';
import { metrics } from '../design/tokens';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { MultilineFieldCard } from '../components/MultilineFieldCard';
import { SwitchFieldCard } from '../components/SwitchFieldCard';
import { TextFieldCard } from '../components/TextFieldCard';
import { useSubmitState } from '../hooks/useSubmitState';

interface CreateIpScreenProps {
  onCancel: () => void;
  onCreated: (ipId: number) => void;
}

export function CreateIpScreen({ onCancel, onCreated }: CreateIpScreenProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();

  const trimmedName = useMemo(() => name.trim(), [name]);

  function handleCreate() {
    void runSubmit(async () => {
      const createdIp = await ipRepository.create({
        name: trimmedName,
        description,
        isFavorite,
      });

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
        <TextFieldCard
          autoCapitalize="none"
          editable={!isSubmitting}
          enablesReturnKeyAutomatically
          label="IP名称"
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

        <MultilineFieldCard
          editable={!isSubmitting}
          hint="可选，用一句话说明这个 IP 的角色、主题或用途。"
          label="简介"
          maxLength={DESCRIPTION_MAX_LENGTH}
          minHeight={132}
          onChangeText={(value) => {
            setDescription(value);
            if (submitError) {
              clearSubmitError();
            }
          }}
          placeholder="可选，用一句话说明这个 IP 的角色、主题或用途。"
          value={description}
        />

        <SwitchFieldCard
          disabled={isSubmitting}
          hint="收藏后会出现在首页的“收藏”筛选里。"
          label="是否收藏"
          onValueChange={setIsFavorite}
          value={isFavorite}
        />
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: metrics.formFieldGap,
  },
});
