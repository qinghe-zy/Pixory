import type { ImageListItem, ImageAssetRecord } from '../database';

type ImageCodeSource = Pick<ImageAssetRecord, 'id' | 'ipId' | 'width' | 'height'> | Pick<ImageListItem, 'id' | 'ipId' | 'width' | 'height'>;

export function formatImageAssetCode(image: ImageCodeSource): string {
  const ipCode = image.ipId.toString(36).toUpperCase().padStart(2, '0');
  const imageCode = image.id.toString(36).toUpperCase().padStart(4, '0');
  return `PX-${ipCode}-${imageCode}-${image.width}x${image.height}`;
}
