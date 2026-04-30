export const GROUP_TYPE_OPTIONS = [
  { value: 'season', label: '季节限定' },
  { value: 'scene', label: '场景限定' },
  { value: 'festival', label: '节日限定' },
  { value: 'usage', label: '用途分类' },
  { value: 'custom', label: '自定义分组' },
] as const;

export type GroupTypeValue = (typeof GROUP_TYPE_OPTIONS)[number]['value'];

export const GROUP_TYPE_LABELS: Record<GroupTypeValue, string> = {
  season: '季节限定',
  scene: '场景限定',
  festival: '节日限定',
  usage: '用途分类',
  custom: '自定义分组',
};

export function getGroupTypeLabel(type: string | null | undefined): string {
  if (!type) {
    return '未分类';
  }

  return GROUP_TYPE_LABELS[type as GroupTypeValue] ?? type;
}
