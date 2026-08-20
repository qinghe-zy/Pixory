const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI favorites are lazy, keyset paged, and virtualized', () => {
  const favorites = read('src/screens/FavoritesScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  assert.match(favorites, /favoriteMode !== 'ai'/);
  assert.match(favorites, /<FlatList/);
  assert.match(favorites, /onEndReached=\{loadMoreAiFavorites\}/);
  assert.match(service, /listFavoriteAssistantMessagePage/);
  assert.match(repository, /beforeCreatedAt/);
  assert.doesNotMatch(repository.slice(repository.indexOf('async listFavoriteAssistantMessages'), repository.indexOf('async deleteMessagesByIds')), /OFFSET/);
});

test('inner-life only queries the active tab', () => {
  const source = read('src/screens/CompanionInnerLifeScreen.tsx');
  assert.match(source, /if \(activeKind === 'diary'\)/);
  assert.match(source, /if \(activeKind === 'dream'\)/);
  assert.match(source, /if \(activeKind === 'thought'\)/);
  assert.doesNotMatch(source, /const nextDiaryGroups[\s\S]{0,400}const nextDreamGroups[\s\S]{0,400}const roleThoughts/);
});

test('material collections use FlatList instead of mounting every row in a scroll view', () => {
  const source = read('src/screens/AiMaterialListScreen.tsx');
  const repository = read('src/database/repositories/aiKnowledgeRepository.ts');
  const service = read('src/ai/aiDocumentService.ts');
  assert.match(source, /<FlatList/);
  assert.doesNotMatch(source, /items\.map\(\(item\) => renderMaterialRow/);
  assert.match(repository, /listDocumentPage/);
  assert.match(repository, /listDocumentOwnerGroupPage/);
  assert.match(repository, /listDocumentsByOwners/);
  assert.match(service, /listMaterialsPage/);
  assert.match(service, /listGlobalMaterialGroupPage/);
  assert.match(service, /MATERIAL_PREVIEW_LIMIT/);
  assert.match(source, /onOpenMaterialOwner/);
  assert.match(source, /group\.materialCount > group\.materials\.length/);
  assert.match(source, /onEndReached=/);
});
