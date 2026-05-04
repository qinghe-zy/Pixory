import type { ImageListItem } from '../database';

export type BatchSelectionRuleKey =
  | 'ungrouped'
  | 'untagged'
  | 'no-note'
  | 'landscape'
  | 'portrait'
  | 'square'
  | 'panorama'
  | 'large'
  | 'small'
  | 'large-file'
  | 'same-size'
  | 'filename-prefix'
  | 'import-batch'
  | 'suspected-duplicate';

export interface BatchSelectionRuleOption {
  key: BatchSelectionRuleKey;
  label: string;
}

export interface BatchSelectionRuleResult {
  key: BatchSelectionRuleKey;
  label: string;
  imageIds: number[];
  description: string;
}

interface ApplySelectionRuleInput {
  images: ImageListItem[];
  selectedImageIds: number[];
  rule: BatchSelectionRuleKey;
  importBatchId?: number | null;
}

export const BATCH_SELECTION_RULE_OPTIONS: BatchSelectionRuleOption[] = [
  { key: 'ungrouped', label: '未分组' },
  { key: 'untagged', label: '无标签' },
  { key: 'no-note', label: '无备注' },
  { key: 'landscape', label: '横图' },
  { key: 'portrait', label: '竖图' },
  { key: 'square', label: '方图' },
  { key: 'panorama', label: '长图' },
  { key: 'large', label: '大图' },
  { key: 'small', label: '小图' },
  { key: 'large-file', label: '大文件' },
  { key: 'same-size', label: '同尺寸' },
  { key: 'filename-prefix', label: '文件名前缀' },
  { key: 'import-batch', label: '本次导入' },
  { key: 'suspected-duplicate', label: '疑似重复' },
];

const WEAK_FILENAME_PREFIXES = new Set(['img', 'image', 'screenshot', 'screen', 'photo', 'pic', 'dsc']);

export function requiresSelectionBase(rule: BatchSelectionRuleKey, importBatchId?: number | null): boolean {
  if (rule === 'import-batch') {
    return importBatchId == null;
  }
  return rule === 'same-size' || rule === 'filename-prefix';
}

export function applySelectionRule({
  images,
  selectedImageIds,
  rule,
  importBatchId = null,
}: ApplySelectionRuleInput): BatchSelectionRuleResult {
  const label = getSelectionRuleLabel(rule);
  const selectedSet = new Set(selectedImageIds);
  const baseImage = images.find((image) => selectedSet.has(image.id));

  if (requiresSelectionBase(rule, importBatchId) && !baseImage) {
    throw new Error(`${label} 需要基准图片，请先选一张。`);
  }

  const matchedImages = filterImagesBySelectionRule(images, rule, baseImage, importBatchId);
  const description = getSelectionRuleDescription(rule, matchedImages, baseImage, importBatchId);

  return {
    key: rule,
    label,
    imageIds: matchedImages.map((image) => image.id),
    description,
  };
}

export function getSelectionRuleLabel(rule: BatchSelectionRuleKey): string {
  return BATCH_SELECTION_RULE_OPTIONS.find((option) => option.key === rule)?.label ?? '智能分堆';
}

export function getFilenamePrefix(filename: string): string | null {
  const baseName = filename.replace(/\.[^.]+$/, '');
  const [prefix] = baseName.split(/[_\-\s.]+/);
  const normalized = prefix?.trim();
  if (!normalized || normalized.length < 2 || /^\d+$/.test(normalized) || WEAK_FILENAME_PREFIXES.has(normalized.toLowerCase())) {
    return null;
  }
  return normalized;
}

export function filterImagesBySelectionRule(
  images: ImageListItem[],
  rule: BatchSelectionRuleKey,
  baseImage?: ImageListItem | null,
  importBatchId?: number | null
): ImageListItem[] {
  if (rule === 'ungrouped') return images.filter((image) => image.groupCount === 0);
  if (rule === 'untagged') return images.filter((image) => image.tagCount === 0);
  if (rule === 'no-note') return images.filter((image) => !image.note);
  if (rule === 'landscape') return images.filter((image) => image.width > image.height && image.width / image.height < 2.2);
  if (rule === 'portrait') return images.filter((image) => image.height > image.width && image.height / image.width < 2.2);
  if (rule === 'square') return images.filter((image) => Math.abs(image.width - image.height) <= Math.max(image.width, image.height) * 0.08);
  if (rule === 'panorama') return images.filter((image) => Math.max(image.width / image.height, image.height / image.width) >= 2.2);
  if (rule === 'large') return images.filter((image) => image.width >= 2400 || image.height >= 2400);
  if (rule === 'small') return images.filter((image) => image.width <= 900 && image.height <= 900);
  if (rule === 'large-file') return images.filter((image) => image.fileSize >= 5 * 1024 * 1024);
  if (rule === 'same-size' && baseImage) {
    return images.filter((image) => image.width === baseImage.width && image.height === baseImage.height);
  }
  if (rule === 'filename-prefix' && baseImage) {
    const prefix = getFilenamePrefix(baseImage.originalFilename);
    return prefix ? images.filter((image) => getFilenamePrefix(image.originalFilename) === prefix) : [];
  }
  if (rule === 'import-batch') {
    const batchId = importBatchId ?? baseImage?.importBatchId ?? null;
    return batchId != null ? images.filter((image) => image.importBatchId === batchId) : [];
  }
  if (rule === 'suspected-duplicate') {
    const counts = countBy(images, (image) => `${image.width}x${image.height}:${image.fileSize}`);
    return images.filter((image) => (counts.get(`${image.width}x${image.height}:${image.fileSize}`) ?? 0) > 1);
  }
  return images;
}

function getSelectionRuleDescription(
  rule: BatchSelectionRuleKey,
  matchedImages: ImageListItem[],
  baseImage?: ImageListItem | null,
  importBatchId?: number | null
): string {
  if (rule === 'same-size' && baseImage) {
    return `以当前已选第一张 ${baseImage.width}x${baseImage.height} 为基准，结果 ${matchedImages.length} 张。`;
  }

  if (rule === 'filename-prefix' && baseImage) {
    const prefix = getFilenamePrefix(baseImage.originalFilename) ?? '无有效前缀';
    return `以当前已选第一张前缀「${prefix}」为基准，结果 ${matchedImages.length} 张。`;
  }

  if (rule === 'import-batch') {
    const batchId = importBatchId ?? baseImage?.importBatchId ?? null;
    return batchId != null ? `按导入批次 ${batchId} 选择，结果 ${matchedImages.length} 张。` : `没有可用导入批次，结果 ${matchedImages.length} 张。`;
  }

  return `${getSelectionRuleLabel(rule)}，结果 ${matchedImages.length} 张。`;
}

function countBy<T>(items: T[], getKey: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
