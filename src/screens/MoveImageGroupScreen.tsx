import { StyleSheet, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';

import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { LightFormSection } from '../components/LightFormSection';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { ReadonlyInfoRow } from '../components/ReadonlyInfoRow';
import { getGroupTypeLabel } from '../constants/groups';
import { groupRepository, imageRepository, type GroupRecord, type ImageDetailRecord } from '../database';
import { metrics, spacing } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';

interface MoveImageGroupScreenProps {
  imageId: number;
  refreshToken: number;
  onBack: () => void;
  onSaved: () => void;
}

export function MoveImageGroupScreen({ imageId, refreshToken, onBack, onSaved }: MoveImageGroupScreenProps) {
  const { data, errorMessage: loadErrorMessage } = useScreenLoad<{
    image: ImageDetailRecord | null;
    groups: GroupRecord[];
  }>(
    async () => {
      const detail = await imageRepository.findDetailById(imageId, { includeDeleted: true });
      if (!detail) {
        throw new Error('没有找到这张图片。');
      }

      const groups = await groupRepository.findByIpId(detail.ipId);
      return { image: detail, groups };
    },
    [imageId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组移动信息失败：${message}`;
      },
      initialData: { image: null, groups: [] },
    }
  );
  const { isSubmitting, submitError, runSubmit } = useSubmitState();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const image = data?.image ?? null;
  const groups = data?.groups ?? [];

  useEffect(() => {
    if (image) {
      setSelectedGroupId(image.groupId);
    }
  }, [image]);

  const canSubmit = useMemo(
    () => Boolean(image) && !isSubmitting,
    [image, isSubmitting]
  );

  function handleSave() {
    if (!image) {
      return;
    }

    void runSubmit(
      async () => {
        const updated = await imageRepository.updateGroup(image.id, selectedGroupId);
        if (!updated) {
          throw new Error('移动分组时没有找到这张图片。');
        }

        onSaved();
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `移动分组失败：${message}`;
        },
      }
    );
  }

  return (
    <FormScreenScaffold
      errorMessage={submitError ?? loadErrorMessage}
      onBack={onBack}
      primaryAction={{ disabled: !canSubmit, label: '确认移动', loading: isSubmitting, onPress: handleSave }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onBack }}
      title="移动分组"
    >
      <View style={styles.formWrap}>
        <LightFormSection title="当前图片">
          <ReadonlyInfoRow label="所属 IP" value={image?.ipName ?? '当前IP'} valueNumberOfLines={1} />
          <ReadonlyInfoRow label="图片文件名" value={image?.originalFilename ?? '当前图片'} valueNumberOfLines={2} />
        </LightFormSection>

        <LightFormSection hint="只更新分组记录，不移动本地文件。" title="目标分组">
          <ReadonlyInfoRow
            label="当前选择"
            value={selectedGroupId === null ? '无分组' : groups.find((group) => group.id === selectedGroupId)?.name ?? '当前分组'}
          />
          <View style={styles.optionList}>
            <OptionSelectRow
              label="无分组"
              meta="保留在当前 IP"
              onPress={() => setSelectedGroupId(null)}
              selected={selectedGroupId === null}
            />
            {groups.map((group) => (
              <OptionSelectRow
                key={group.id}
                label={group.name}
                meta={getGroupTypeLabel(group.type)}
                onPress={() => setSelectedGroupId(group.id)}
                selected={selectedGroupId === group.id}
              />
            ))}
          </View>
        </LightFormSection>
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: metrics.formFieldGap,
  },
  optionList: {
    gap: spacing[1],
    paddingVertical: spacing[2],
  },
});
