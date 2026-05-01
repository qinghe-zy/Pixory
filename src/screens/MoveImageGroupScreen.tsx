import { StyleSheet, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';

import { ContentCard } from '../components/ContentCard';
import { FilterChip } from '../components/FilterChip';
import { FormField } from '../components/FormField';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { ReadonlyFieldCard } from '../components/ReadonlyFieldCard';
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
        <ReadonlyFieldCard label="所属 IP" value={image?.ipName ?? '当前IP'} />
        <ReadonlyFieldCard label="图片文件名" value={image?.originalFilename ?? '当前图片'} />

        <ContentCard>
          <FormField hint="只能移动到当前 IP 下的分组，不会移动原图和缩略图文件。" label="目标分组">
            <View style={styles.optionWrap}>
              <FilterChip active={selectedGroupId === null} label="无分组" onPress={() => setSelectedGroupId(null)} />
              {groups.map((group) => (
                <FilterChip
                  active={selectedGroupId === group.id}
                  key={group.id}
                  label={`${group.name} · ${getGroupTypeLabel(group.type)}`}
                  onPress={() => setSelectedGroupId(group.id)}
                />
              ))}
            </View>
          </FormField>
        </ContentCard>
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: metrics.formFieldGap,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
});
