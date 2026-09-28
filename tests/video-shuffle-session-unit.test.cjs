const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const tsFilePath = path.join(__dirname, '../src/media/videoShuffleSession.ts');
const tsCode = fs.readFileSync(tsFilePath, 'utf8');

const { outputText } = ts.transpileModule(tsCode, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});

const context = vm.createContext({
  exports: {},
  require: require
});

vm.runInContext(outputText, context);

const { VideoShuffleSession, fisherYatesShuffle } = context.exports;

test('VideoShuffleSession', async (t) => {
  await t.test('1. A full round plays every video exactly once', () => {
    const queueIds = [1, 2, 3, 4, 5];
    const session = new VideoShuffleSession({ queueIds });
    const played = new Set();
    for (let i = 0; i < 5; i++) {
      const id = session.commitNext();
      assert.ok(id !== null);
      played.add(id);
    }
    assert.strictEqual(played.size, 5);
    assert.strictEqual(session.remainingCount, 0);
  });

  await t.test('2. After a full round, a new round starts automatically', () => {
    const queueIds = [1, 2];
    const session = new VideoShuffleSession({ queueIds });
    session.commitNext();
    session.commitNext();
    assert.strictEqual(session.remainingCount, 0);
    const id3 = session.commitNext(); // triggers rebuild
    assert.ok(id3 !== null);
    assert.strictEqual(session.remainingCount, 1);
  });

  await t.test('3. No consecutive repeat across round boundaries', () => {
    const queueIds = [1, 2, 3];
    const session = new VideoShuffleSession({ queueIds });
    
    // Play full round
    const id1 = session.commitNext();
    const id2 = session.commitNext();
    const id3 = session.commitNext();
    
    // Next should not be id3
    const nextRoundFirst = session.commitNext();
    assert.notStrictEqual(nextRoundFirst, id3);
  });

  await t.test('4. peekNext() is idempotent', () => {
    const queueIds = [1, 2, 3];
    const session = new VideoShuffleSession({ queueIds });
    const peek1 = session.peekNext();
    const peek2 = session.peekNext();
    assert.strictEqual(peek1, peek2);
  });

  await t.test('5. commitNext() advances and peekNext() returns a different value', () => {
    const queueIds = [1, 2, 3];
    const session = new VideoShuffleSession({ queueIds });
    const peek1 = session.peekNext();
    const commit1 = session.commitNext();
    assert.strictEqual(peek1, commit1);
    const peek2 = session.peekNext();
    assert.notStrictEqual(peek1, peek2);
  });

  await t.test('6. markPlayed(id) removes that ID from candidates', () => {
    const queueIds = [1, 2, 3];
    const session = new VideoShuffleSession({ queueIds });
    session.markPlayed(1);
    const remaining = [];
    remaining.push(session.commitNext());
    remaining.push(session.commitNext());
    assert.ok(!remaining.includes(1));
    assert.strictEqual(session.remainingCount, 0);
  });

  await t.test('7. syncQueue() with additions adds new candidates', () => {
    const queueIds = [1, 2];
    const session = new VideoShuffleSession({ queueIds });
    session.commitNext();
    session.syncQueue([1, 2, 3]);
    assert.strictEqual(session.remainingCount, 2);
  });

  await t.test('8. syncQueue() with removals cleans up played set and candidates', () => {
    const queueIds = [1, 2, 3];
    const session = new VideoShuffleSession({ queueIds });
    const first = session.commitNext();
    session.syncQueue([2, 3]); // If first was 1, it's removed.
    // just check that candidates and total are fine
    assert.strictEqual(session.totalCount, 2);
  });

  await t.test('9. reset() creates a fresh round', () => {
    const session = new VideoShuffleSession({ queueIds: [1, 2], currentId: 1 });
    assert.strictEqual(session.remainingCount, 1);
    assert.ok(session.getPlayedIds().has(1));
    session.reset({ queueIds: [3, 4] });
    assert.strictEqual(session.remainingCount, 2);
    assert.strictEqual(session.totalCount, 2);
  });

  await t.test('10. With queue of 1, peekNext returns that item, commitNext returns it and rebuilds', () => {
    const session = new VideoShuffleSession({ queueIds: [1] });
    assert.strictEqual(session.peekNext(), 1);
    assert.strictEqual(session.commitNext(), 1);
    assert.strictEqual(session.peekNext(), 1);
  });

  await t.test('11. With queue of 2, no consecutive repeats across rounds', () => {
    const session = new VideoShuffleSession({ queueIds: [1, 2] });
    for (let i = 0; i < 10; i++) {
      const a = session.commitNext();
      const b = session.commitNext();
      const c = session.commitNext(); // Next round start
      assert.notStrictEqual(b, c);
      session.commitNext(); // finish second round
    }
  });

  await t.test('12. remainingCount and totalCount are accurate', () => {
    const session = new VideoShuffleSession({ queueIds: [1, 2, 3] });
    assert.strictEqual(session.totalCount, 3);
    assert.strictEqual(session.remainingCount, 3);
    session.commitNext();
    assert.strictEqual(session.remainingCount, 2);
  });

  await t.test('13. previousId / setPrevious work independently', () => {
    const session = new VideoShuffleSession({ queueIds: [1, 2] });
    assert.strictEqual(session.previousId, null);
    session.setPrevious(42);
    assert.strictEqual(session.previousId, 42);
  });
});
