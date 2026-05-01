import { groupRepository } from './repositories/groupRepository';
import { imageRepository } from './repositories/imageRepository';
import { ipRepository } from './repositories/ipRepository';
import { tagRepository } from './repositories/tagRepository';
import { devLog } from '../utils/dev';

export async function seedDevelopmentData(): Promise<void> {
  const existingIpCount = await ipRepository.count();
  if (existingIpCount > 0) {
    devLog('Pixory seed skipped: database already contains IP records.');
    return;
  }

  const mainIp = await ipRepository.create({
    name: 'Demo Character Collection',
    description: 'Seed data for validating Pixory list and detail UI states.',
  });

  const alternateIp = await ipRepository.create({
    name: 'Festival Poster Set',
    description: 'Secondary seed IP used for filters and grouping checks.',
  });

  const portraitGroup = await groupRepository.create({
    ipId: mainIp.id,
    name: 'Portrait',
    type: 'scene',
    sortOrder: 1,
  });

  const holidayGroup = await groupRepository.create({
    ipId: alternateIp.id,
    name: 'Spring Festival',
    type: 'festival',
    sortOrder: 1,
  });

  const warmTag = await tagRepository.create({ name: 'Warm Tone' });
  const keyVisualTag = await tagRepository.create({ name: 'Key Visual' });

  const firstImage = await imageRepository.create({
    ipId: mainIp.id,
    groupId: portraitGroup.id,
    originalFileUri: 'file:///pixory/assets/original/ip_1/demo-portrait-1.jpg',
    thumbnailFileUri: 'file:///pixory/thumbnails/ip_1/demo-portrait-1.jpg',
    originalFilename: 'demo-portrait-1.jpg',
    internalFilename: 'img_000001.jpg',
    width: 1440,
    height: 2160,
    mimeType: 'image/jpeg',
    fileSize: 512000,
    isFavorite: true,
    note: 'Seed image used to validate favorite badge and note rendering.',
  });

  const secondImage = await imageRepository.create({
    ipId: alternateIp.id,
    groupId: holidayGroup.id,
    originalFileUri: 'file:///pixory/assets/original/ip_2/demo-festival-1.png',
    thumbnailFileUri: 'file:///pixory/thumbnails/ip_2/demo-festival-1.png',
    originalFilename: 'demo-festival-1.png',
    internalFilename: 'img_000002.png',
    width: 1920,
    height: 1080,
    mimeType: 'image/png',
    fileSize: 845312,
    note: 'Seed image reserved for future grid and metadata checks.',
  });

  await tagRepository.replaceImageTags(firstImage.id, [warmTag.id, keyVisualTag.id]);
  await tagRepository.replaceImageTags(secondImage.id, [keyVisualTag.id]);

  devLog('Pixory seed data created successfully.');
}
