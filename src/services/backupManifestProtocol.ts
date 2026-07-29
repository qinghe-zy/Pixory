export function isSafeBackupRelativePath(relativePath: string): boolean {
  if (!relativePath || relativePath.includes('\\') || relativePath.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(relativePath) || /^[a-z][a-z0-9+.-]*:/i.test(relativePath)) return false;
  let decoded = relativePath;
  try {
    decoded = decodeURIComponent(relativePath);
  } catch {
    return false;
  }
  return decoded.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function assertManagedManifestShape(value: unknown): asserts value is {
  manifestVersion: 2;
  databaseRelativePath: string;
  files: Array<{ logicalId: string; relativePath: string; sha256: string; size: number; required: boolean; space: string }>;
} {
  const candidate = value as Record<string, unknown> | null;
  if (!candidate || candidate.manifestVersion !== 2 || typeof candidate.databaseRelativePath !== 'string' ||
      !isSafeBackupRelativePath(candidate.databaseRelativePath) || !Array.isArray(candidate.files)) {
    throw new Error('备份清单结构无效。');
  }
  for (const file of candidate.files) {
    const entry = file as Record<string, unknown>;
    if (typeof entry.logicalId !== 'string' || typeof entry.relativePath !== 'string' ||
        !isSafeBackupRelativePath(entry.relativePath) || typeof entry.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(entry.sha256) || !Number.isSafeInteger(entry.size) || (entry.size as number) < 0 ||
        typeof entry.required !== 'boolean' || !['normal', 'personal'].includes(String(entry.space)) ||
        !['image_asset', 'ai_document', 'message_attachment', 'role_card', 'database'].includes(String(entry.ownerType)) ||
        typeof entry.ownerId !== 'string' || !entry.ownerId ||
        !['asset_original', 'asset_thumbnail', 'asset_cover', 'ai_document', 'message_attachment', 'role_avatar', 'database'].includes(String(entry.category)) ||
        !Object.prototype.hasOwnProperty.call(entry, 'originalUri') || entry.originalUri !== null ||
        !(entry.mimeType === null || typeof entry.mimeType === 'string')) {
      throw new Error('备份清单文件条目无效。');
    }
  }
  const files = candidate.files as Array<Record<string, unknown>>;
  if (new Set(files.map((file) => file.logicalId)).size !== files.length) {
    throw new Error('备份清单包含重复逻辑文件。');
  }
  const databaseEntries = files.filter((file) => file.category === 'database');
  if (databaseEntries.length !== 1 || databaseEntries[0]?.relativePath !== candidate.databaseRelativePath ||
      databaseEntries[0]?.required !== true) {
    throw new Error('备份清单缺少唯一且必需的数据库文件。');
  }
}
