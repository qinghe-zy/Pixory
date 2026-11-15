const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadSqliteSerialization() {
  const filename = path.join(root, 'src/database/sqliteSerialization.ts');
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (originalExtension) {
      require.extensions['.ts'] = originalExtension;
    } else {
      delete require.extensions['.ts'];
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFakeExpoSqliteDatabase(options = {}) {
  const log = [];
  let activeOps = 0;
  let maxConcurrentOps = 0;
  let inTransaction = false;
  const rows = [];

  const enterOp = async (label) => {
    activeOps += 1;
    if (activeOps > maxConcurrentOps) {
      maxConcurrentOps = activeOps;
    }
    if (activeOps > 1) {
      throw new Error(`Concurrent native SQLite overlap detected at ${label}: activeOps=${activeOps}`);
    }
    log.push(label);
    await delay(options.opDelayMs ?? 3);
  };

  const exitOp = () => {
    activeOps -= 1;
  };

  const db = {
    nativeDatabase: options.nativeDatabase ?? {},
    async execAsync(source) {
      await enterOp(`exec:${source}`);
      try {
        if (source === 'BEGIN' || source === 'BEGIN IMMEDIATE') {
          inTransaction = true;
        } else if (source === 'COMMIT' || source === 'ROLLBACK') {
          inTransaction = false;
        }
      } finally {
        exitOp();
      }
    },
    async prepareAsync(source) {
      await enterOp(`prepare:${source}`);
      exitOp();
      let finalized = false;
      const statement = {
        async executeAsync(...params) {
          await enterOp(`execute:${source}`);
          try {
            if (source.startsWith('INSERT')) {
              rows.push(params[0]);
            }
          } finally {
            exitOp();
          }
          const result = {
            lastInsertRowId: rows.length,
            changes: 1,
          };
          // Mirror expo-sqlite's writable:false, configurable:true descriptors on executeAsync results.
          Object.defineProperties(result, {
            getFirstAsync: {
              value: async () => {
                await enterOp(`result.getFirst:${source}`);
                try {
                  return rows.length > 0 ? { id: rows[0] } : null;
                } finally {
                  exitOp();
                }
              },
              writable: false,
              configurable: true,
            },
            getAllAsync: {
              value: async () => {
                await enterOp(`result.getAll:${source}`);
                try {
                  return rows.map((id) => ({ id }));
                } finally {
                  exitOp();
                }
              },
              writable: false,
              configurable: true,
            },
            resetAsync: {
              value: async () => {
                await enterOp(`result.reset:${source}`);
                exitOp();
              },
              writable: false,
              configurable: true,
            },
            next: {
              value: async () => {
                await enterOp(`result.next:${source}`);
                exitOp();
                return { value: undefined, done: true };
              },
              writable: false,
              configurable: true,
            },
            return: {
              value: async () => {
                await enterOp(`result.return:${source}`);
                exitOp();
                return { value: undefined, done: true };
              },
              writable: false,
              configurable: true,
            },
            throw: {
              value: async (err) => {
                await enterOp(`result.throw:${source}`);
                exitOp();
                throw err;
              },
              writable: false,
              configurable: true,
            },
          });
          return result;
        },
        async executeForRawResultAsync() {
          return statement.executeAsync();
        },
        async getColumnNamesAsync() {
          await enterOp(`colNames:${source}`);
          exitOp();
          return ['id'];
        },
        async finalizeAsync() {
          await enterOp(`finalize:${source}`);
          finalized = true;
          exitOp();
        },
        isFinalized: () => finalized,
      };
      return statement;
    },
    async runAsync(source, ...params) {
      if (options.nativeDatabase !== null) {
        // Mirror real expo-sqlite SQLiteDatabase.runAsync calling this.prepareAsync.
        const stmt = await db.prepareAsync(source);
        try {
          return await stmt.executeAsync(...params);
        } finally {
          await stmt.finalizeAsync();
        }
      }
      await enterOp(`run:${source}`);
      try {
        if (source.startsWith('INSERT')) {
          rows.push(params[0]);
        }
        return { lastInsertRowId: rows.length, changes: 1 };
      } finally {
        exitOp();
      }
    },
    async getFirstAsync(source, ...params) {
      if (options.nativeDatabase !== null) {
        const stmt = await db.prepareAsync(source);
        try {
          const result = await stmt.executeAsync(...params);
          return await result.getFirstAsync();
        } finally {
          await stmt.finalizeAsync();
        }
      }
      await enterOp(`first:${source}`);
      try {
        return rows.length > 0 ? { id: rows[0] } : null;
      } finally {
        exitOp();
      }
    },
    async getAllAsync(source, ...params) {
      if (options.nativeDatabase !== null) {
        const stmt = await db.prepareAsync(source);
        try {
          const result = await stmt.executeAsync(...params);
          return await result.getAllAsync();
        } finally {
          await stmt.finalizeAsync();
        }
      }
      await enterOp(`all:${source}`);
      try {
        return rows.map((id) => ({ id }));
      } finally {
        exitOp();
      }
    },
    async isInTransactionAsync() {
      await enterOp('isInTransaction');
      try {
        return typeof options.forceInTransaction === 'boolean' ? options.forceInTransaction : inTransaction;
      } finally {
        exitOp();
      }
    },
    async closeAsync() {
      await enterOp('close');
      exitOp();
    },
  };

  return {
    db,
    log,
    rows,
    getMaxConcurrentOps: () => maxConcurrentOps,
    setInTransaction: (next) => {
      inTransaction = next;
    },
  };
}

test('serializeSqliteDatabase serializes concurrent Promise.all queries without overlapping or self-deadlocking native prepareAsync', async () => {
  const { serializeSqliteDatabase, isSerializedSqliteDatabase } = loadSqliteSerialization();
  const fake = createFakeExpoSqliteDatabase({ nativeDatabase: {} });
  const db = serializeSqliteDatabase(fake.db);

  assert.equal(isSerializedSqliteDatabase(db), true);
  assert.equal(serializeSqliteDatabase(db), db);

  await Promise.all([
    db.runAsync('INSERT INTO t VALUES (?)', 'm1'),
    db.getFirstAsync('SELECT id FROM t LIMIT 1'),
    db.getAllAsync('SELECT id FROM t'),
    db.execAsync('PRAGMA user_version'),
  ]);

  assert.equal(fake.getMaxConcurrentOps(), 1);
  assert.deepEqual(fake.rows, ['m1']);
  assert.deepEqual(fake.log.slice(0, 6), [
    'prepare:INSERT INTO t VALUES (?)',
    'execute:INSERT INTO t VALUES (?)',
    'finalize:INSERT INTO t VALUES (?)',
    'prepare:SELECT id FROM t LIMIT 1',
    'execute:SELECT id FROM t LIMIT 1',
    'result.getFirst:SELECT id FROM t LIMIT 1',
  ]);
});

test('serializeSqliteDatabase wraps prepareAsync results with non-writable configurable descriptors and plain mocks', async () => {
  const { serializeSqliteDatabase } = loadSqliteSerialization();
  const fakeWithNative = createFakeExpoSqliteDatabase({ nativeDatabase: {} });
  const db = serializeSqliteDatabase(fakeWithNative.db);

  const stmt = await db.prepareAsync('INSERT INTO t VALUES (?)');
  const res = await stmt.executeAsync('stmt1');
  const first = await res.getFirstAsync();
  const all = await res.getAllAsync();
  await stmt.finalizeAsync();

  assert.equal(first.id, 'stmt1');
  assert.deepEqual(all, [{ id: 'stmt1' }]);
  assert.equal(fakeWithNative.getMaxConcurrentOps(), 1);

  const plainFake = createFakeExpoSqliteDatabase({ nativeDatabase: null });
  const plainDb = serializeSqliteDatabase(plainFake.db);
  await Promise.all([
    plainDb.runAsync('INSERT INTO t VALUES (?)', 'plain1'),
    plainDb.getAllAsync('SELECT id FROM t'),
  ]);
  assert.equal(plainFake.getMaxConcurrentOps(), 1);
  assert.deepEqual(plainFake.rows, ['plain1']);
});

test('serializeSqliteDatabase serializes transactions on txQueue and supports nested SAVEPOINT commit and rollback', async () => {
  const { serializeSqliteDatabase } = loadSqliteSerialization();
  const fake = createFakeExpoSqliteDatabase({ nativeDatabase: {} });
  const db = serializeSqliteDatabase(fake.db);
  const events = [];

  const tx1 = db.withTransactionAsync(async (txn) => {
    events.push('tx1:start');
    await txn.runAsync('INSERT INTO t VALUES (?)', 'outer');
    await txn.withTransactionAsync(async (innerTxn) => {
      events.push('sp1:start');
      await innerTxn.runAsync('INSERT INTO t VALUES (?)', 'inner');
      events.push('sp1:end');
    });
    await txn
      .withExclusiveTransactionAsync(async () => {
        events.push('sp2:fail');
        throw new Error('inner savepoint error');
      })
      .catch(() => events.push('sp2:caught'));
    events.push('tx1:end');
  });

  const tx2 = db.withExclusiveTransactionAsync(async (txn) => {
    events.push('tx2:start');
    await txn.execAsync('SELECT 1');
    events.push('tx2:end');
  });

  await Promise.all([tx1, tx2]);

  assert.equal(fake.getMaxConcurrentOps(), 1);
  assert.deepEqual(events, [
    'tx1:start',
    'sp1:start',
    'sp1:end',
    'sp2:fail',
    'sp2:caught',
    'tx1:end',
    'tx2:start',
    'tx2:end',
  ]);
  assert.ok(fake.log.includes('exec:BEGIN IMMEDIATE'));
  assert.ok(fake.log.includes('exec:SAVEPOINT _pixory_sp_1'));
  assert.ok(fake.log.includes('exec:RELEASE SAVEPOINT _pixory_sp_1'));
  assert.ok(fake.log.includes('exec:SAVEPOINT _pixory_sp_2'));
  assert.ok(fake.log.includes('exec:ROLLBACK TO SAVEPOINT _pixory_sp_2'));
  assert.ok(fake.log.includes('exec:RELEASE SAVEPOINT _pixory_sp_2'));
});

test('serializeSqliteDatabase queues closeAsync behind active transactions and prevents double finalizeAsync', async () => {
  const { serializeSqliteDatabase } = loadSqliteSerialization();
  const fake = createFakeExpoSqliteDatabase({ nativeDatabase: {} });
  const db = serializeSqliteDatabase(fake.db);

  const order = [];
  const txPromise = db.withTransactionAsync(async (txn) => {
    order.push('tx:start');
    await txn.runAsync('INSERT INTO t VALUES (?)', 'before-close');
    await delay(10);
    order.push('tx:end');
  });
  const closePromise = db.closeAsync().then(() => {
    order.push('closed');
  });

  await Promise.all([txPromise, closePromise]);
  assert.deepEqual(order, ['tx:start', 'tx:end', 'closed']);
  assert.ok(fake.log.includes('exec:BEGIN IMMEDIATE'));
  assert.ok(fake.log.indexOf('exec:COMMIT') < fake.log.indexOf('close'));

  let finalizeCount = 0;
  const throwingFinalizeDb = serializeSqliteDatabase({
    nativeDatabase: {},
    async prepareAsync() {
      return {
        async executeAsync() {
          return {
            async getFirstAsync() {
              return { id: 1 };
            },
            async getAllAsync() {
              return [];
            },
            async resetAsync() {},
            async next() {
              return { value: undefined, done: true };
            },
          };
        },
        async executeForRawResultAsync() {
          throw new Error('unused');
        },
        async getColumnNamesAsync() {
          return ['id'];
        },
        async finalizeAsync() {
          finalizeCount += 1;
          throw new Error('finalize failed');
        },
      };
    },
  });

  await assert.rejects(throwingFinalizeDb.getAllAsync('SELECT 1'), /finalize failed/);
  assert.equal(finalizeCount, 1);
});

test('Policy: no non-wrapper production or test files invoke bare withExclusiveTransactionAsync', () => {
  const allowedFiles = new Set([
    path.normalize('src/database/sqliteSerialization.ts'),
    path.normalize('tests/sqlite-serialization.test.cjs'),
  ]);

  function walkFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const matches = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        matches.push(...walkFiles(fullPath));
      } else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) {
        const rel = path.relative(root, fullPath);
        if (!allowedFiles.has(rel)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('withExclusiveTransactionAsync')) {
            matches.push(rel);
          }
        }
      }
    }
    return matches;
  }

  assert.deepEqual([...walkFiles(path.join(root, 'src')), ...walkFiles(path.join(root, 'tests'))], []);
});

test('serializeSqliteDatabase preserves original transaction error when SQLite already closed transaction', async () => {
  const { serializeSqliteDatabase } = loadSqliteSerialization();
  const fake = createFakeExpoSqliteDatabase({ nativeDatabase: {}, forceInTransaction: false });
  const db = serializeSqliteDatabase(fake.db);

  await assert.rejects(
    db.withTransactionAsync(async () => {
      throw new Error('original SQL failure');
    }),
    /original SQL failure/,
  );
  assert.equal(fake.log.includes('exec:ROLLBACK'), false);
});

test('nested runWithDatabaseSpace-style callbacks using leaf SQL ops do not deadlock', async () => {
  const { serializeSqliteDatabase } = loadSqliteSerialization();
  const fake = createFakeExpoSqliteDatabase({ nativeDatabase: {} });
  const singletonDb = serializeSqliteDatabase(fake.db);

  const runWithSpace = async (task) => task(singletonDb);

  const result = await runWithSpace(async (outerDb) => {
    await outerDb.runAsync('INSERT INTO t VALUES (?)', 'outer-row');
    const nested = await runWithSpace(async (innerDb) => innerDb.getAllAsync('SELECT id FROM t'));
    return nested;
  });

  assert.deepEqual(result, [{ id: 'outer-row' }]);
  assert.equal(fake.getMaxConcurrentOps(), 1);
});

test('withScopedTransaction isolates suspended tx from concurrent external DB ops, supports nested savepoints, and returns value', async () => {
  const {
    serializeSqliteDatabase,
    withScopedTransaction,
    getSqliteSerializationDiagnostics,
  } = loadSqliteSerialization();
  const fake = createFakeExpoSqliteDatabase({ nativeDatabase: {} });
  const db = serializeSqliteDatabase(fake.db);
  const events = [];

  const txPromise = withScopedTransaction(db, async (txDb) => {
    events.push('tx:start');
    await txDb.runAsync('INSERT INTO t VALUES (?)', 'inside-1');
    const innerVal = await withScopedTransaction(txDb, async (innerTx) => {
      await innerTx.runAsync('INSERT INTO t VALUES (?)', 'inside-sp');
      return 'nested-ok';
    });
    assert.equal(innerVal, 'nested-ok');
    assert.equal(getSqliteSerializationDiagnostics(txDb).activeScopedTxDepth, 1);
    await delay(20);
    await txDb.runAsync('INSERT INTO t VALUES (?)', 'inside-2');
    events.push('tx:end');
    return { count: 3 };
  });

  await delay(5);
  const extWritePromise = db.runAsync('INSERT INTO t VALUES (?)', 'external-after').then(() => {
    events.push('ext:write');
  });
  const extReadPromise = db.getAllAsync('SELECT id FROM t').then((rows) => {
    events.push('ext:read');
    return rows;
  });

  const [txResult, , readRows] = await Promise.all([txPromise, extWritePromise, extReadPromise]);

  assert.deepEqual(txResult, { count: 3 });
  assert.equal(fake.getMaxConcurrentOps(), 1);
  assert.deepEqual(events, ['tx:start', 'tx:end', 'ext:write', 'ext:read']);

  const commitIndex = fake.log.indexOf('exec:COMMIT');
  const extPrepareIndex = fake.log.lastIndexOf('prepare:INSERT INTO t VALUES (?)');
  assert.ok(commitIndex >= 0);
  assert.ok(extPrepareIndex > commitIndex, 'External write must execute strictly after COMMIT');
  assert.ok(fake.log.includes('exec:SAVEPOINT _pixory_sp_1'));
  assert.ok(fake.log.includes('exec:RELEASE SAVEPOINT _pixory_sp_1'));
  assert.equal(readRows.length, 4);

  const diagnostics = getSqliteSerializationDiagnostics(db);
  assert.equal(diagnostics.activeTxDepth, 0);
  assert.equal(diagnostics.activeScopedTxDepth, 0);
  assert.equal(diagnostics.bareWriteWarnings, 0);
});

test('withScopedTransaction blocks external write until ROLLBACK finishes and does not swallow external errors', async () => {
  const { serializeSqliteDatabase, withScopedTransaction } = loadSqliteSerialization();
  const fake = createFakeExpoSqliteDatabase({ nativeDatabase: {} });
  const db = serializeSqliteDatabase(fake.db);
  const events = [];

  const failingTx = withScopedTransaction(db, async (txDb) => {
    events.push('tx:start');
    await txDb.runAsync('INSERT INTO t VALUES (?)', 'aborted-write');
    await delay(20);
    events.push('tx:throw');
    throw new Error('scoped tx failed');
  });

  await delay(5);
  const extWrite = db.runAsync('INSERT INTO t VALUES (?)', 'external-survives').then(() => {
    events.push('ext:write-done');
  });

  await assert.rejects(failingTx, /scoped tx failed/);
  await extWrite;

  assert.deepEqual(events, ['tx:start', 'tx:throw', 'ext:write-done']);
  const rollbackIndex = fake.log.indexOf('exec:ROLLBACK');
  const extPrepareIndex = fake.log.lastIndexOf('prepare:INSERT INTO t VALUES (?)');
  assert.ok(rollbackIndex >= 0);
  assert.ok(extPrepareIndex > rollbackIndex, 'External write must execute strictly after ROLLBACK');
  assert.ok(fake.rows.includes('external-survives'));
});

test('getSqliteSerializationDiagnostics records bare mutating SQL during legacy withTransactionAsync without flagging reads or scoped txn writes', async () => {
  const { serializeSqliteDatabase, getSqliteSerializationDiagnostics } = loadSqliteSerialization();
  const fake = createFakeExpoSqliteDatabase({ nativeDatabase: {} });
  const db = serializeSqliteDatabase(fake.db);

  const originalWarn = console.warn;
  const warnedMessages = [];
  console.warn = (...args) => {
    warnedMessages.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    const legacyTx = db.withTransactionAsync(async (txn) => {
      await txn.runAsync('INSERT INTO t VALUES (?)', 'scoped-to-txn');
      await delay(100);
    });

    await delay(5);
    await db.getAllAsync('SELECT id FROM t');
    assert.equal(getSqliteSerializationDiagnostics(db).bareWriteWarnings, 0);

    await db.runAsync('INSERT INTO t VALUES (?)', 'bare-write');
    await db.execAsync("UPDATE t SET body = 'sensitive-secret-text' WHERE id = '1'");
    await legacyTx;

    const diag = getSqliteSerializationDiagnostics(db);
    assert.equal(diag.activeTxDepth, 0);
    assert.equal(diag.bareWriteWarnings, 2);
    assert.equal(diag.recentBareWrites.length, 2);
    assert.match(diag.recentBareWrites[0].sqlPreview, /^INSERT INTO t VALUES/);
    assert.equal(diag.recentBareWrites[1].sqlPreview.includes('sensitive-secret-text'), false);
    assert.match(diag.recentBareWrites[1].sqlPreview, /UPDATE t SET body = '\?'/);
    assert.equal(warnedMessages.length, 2);
  } finally {
    console.warn = originalWarn;
  }
});
