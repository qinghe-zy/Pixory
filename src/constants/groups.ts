export const GROUP_TYPE_OPTIONS = [
  { value: 'season', label: '季节/时段', description: '春夏秋冬、限定档期、版本周期' },
  { value: 'scene', label: '场景/构图', description: '室内、外景、头像、全身、道具' },
  { value: 'festival', label: '节日/活动', description: '节庆、联名、展会、纪念日' },
  { value: 'usage', label: '用途/渠道', description: '海报、头像、社媒、商品、参考' },
  { value: 'custom', label: '自定义', description: '不适合固定类型时使用' },
] as const;

export type GroupTypeValue = (typeof GROUP_TYPE_OPTIONS)[number]['value'];

export const GROUP_TYPE_LABELS: Record<GroupTypeValue, string> = {
  season: '季节/时段',
  scene: '场景/构图',
  festival: '节日/活动',
  usage: '用途/渠道',
  custom: '自定义',
};

export function getGroupTypeLabel(type: string | null | undefined): string {
  if (!type) {
    return '未分类';
  }

  return GROUP_TYPE_LABELS[type as GroupTypeValue] ?? type;
}
