const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');

function loadRepository() {
  const filename = path.join(root, 'src/database/repositories/aiKnowledgeRepository.ts');
  const oldTs = require.extensions['.ts'];
  require.extensions['.ts'] = (module, sourcePath) => {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename).aiKnowledgeRepository;
  } finally {
    if (oldTs) require.extensions['.ts'] = oldTs;
    else delete require.extensions['.ts'];
  }
}

class CountedDB {
  constructor(space) {
    this.space = space;
    this.runStatements = 0;
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE ai_documents(id TEXT PRIMARY KEY, space TEXT NOT NULL);
      CREATE TABLE ai_chunks(
        id TEXT PRIMARY KEY,
        documentId TEXT NOT NULL,
        FOREIGN KEY(documentId) REFERENCES ai_documents(id) ON DELETE CASCADE
      );
      CREATE TABLE ai_embeddings(
        id TEXT PRIMARY KEY,
        chunkId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        modelId TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        vectorJson TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(chunkId) REFERENCES ai_chunks(id) ON DELETE CASCADE
      );
      CREATE TABLE ai_messages(id TEXT PRIMARY KEY);
      CREATE TABLE ai_message_citations(
        id TEXT PRIMARY KEY,
        messageId TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        FOREIGN KEY(messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
      );
      INSERT INTO ai_messages(id) VALUES('message-1');
    `);
  }

  async runAsync(sql, ...params) {
    this.runStatements += 1;
    return this.db.prepare(sql).run(...params);
  }

  async getAllAsync(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  async getFirstAsync(sql, ...params) {
    return this.db.prepare(sql).get(...params) ?? null;
  }

  async withTransactionAsync(task) {
    this.db.exec('BEGIN');
    try {
      const result = await task();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  scalar(sql) {
    return Number(this.db.prepare(sql).get().value);
  }

  close() {
    this.db.close();
  }
}

function seedDocument(db, chunkCount) {
  db.db.prepare('INSERT INTO ai_documents(id, space) VALUES(?, ?)')
    .run('document-1', db.space);
  db.db.prepare(
    `INSERT INTO ai_message_citations(id, messageId, sourceType, sourceId)
     VALUES('citation-document', 'message-1', 'document_chunk', 'document-1')`,
  ).run();
  const insertChunk = db.db.prepare('INSERT INTO ai_chunks(id, documentId) VALUES(?, ?)');
  const insertEmbedding = db.db.prepare(
    `INSERT INTO ai_embeddings(
       id, chunkId, providerId, modelId, dimensions, vectorJson, createdAt
     ) VALUES(?, ?, 'provider-1', 'model-1', 2, '[1,2]', '2026-08-11T00:00:00.000Z')`,
  );
  const insertCitation = db.db.prepare(
    `INSERT INTO ai_message_citations(id, messageId, sourceType, sourceId)
     VALUES(?, 'message-1', 'document_chunk', ?)`,
  );
  for (let index = 0; index < chunkCount; index += 1) {
    const chunkId = `chunk-${index}`;
    insertChunk.run(chunkId, 'document-1');
    insertEmbedding.run(`old-embedding-${index}`, chunkId);
    insertCitation.run(`citation-${index}`, chunkId);
  }
}

function replacementRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `new-embedding-${index}`,
    chunkId: `chunk-${index}`,
    providerId: 'provider-1',
    modelId: 'model-1',
    dimensions: 2,
    vectorJson: '[9,9]',
  }));
}

const repository = loadRepository();
for (const space of ['normal', 'personal']) {
  test(`${space} document deletion uses a bounded statement count`, async () => {
    const db = new CountedDB(space);
    try {
      seedDocument(db, 1000);
      const beforeDeleteStatements = db.runStatements;
      const deleted = await repository.deleteDocument(db, 'document-1');
      const deleteStatements = db.runStatements - beforeDeleteStatements;
      assert.equal(deleted, 1);
      assert.ok(
        deleteStatements <= 4,
        `expected <= 4 runAsync statements, got ${deleteStatements}`,
      );
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_documents'), 0);
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_chunks'), 0);
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_embeddings'), 0);
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_message_citations'), 0);
    } finally {
      db.close();
    }
  });

  test(`${space} embedding replacement uses bounded batches`, async () => {
    const db = new CountedDB(space);
    try {
      seedDocument(db, 250);
      const replacements = replacementRows(250);
      const beforeReplaceStatements = db.runStatements;
      await db.withTransactionAsync(() => repository.replaceEmbeddings(db, replacements));
      const replaceStatements = db.runStatements - beforeReplaceStatements;
      assert.ok(
        replaceStatements <= 6,
        `expected bounded batched statements, got ${replaceStatements}`,
      );
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_embeddings'), 250);
      assert.equal(
        db.scalar("SELECT COUNT(*) AS value FROM ai_embeddings WHERE vectorJson = '[9,9]'"),
        250,
      );
    } finally {
      db.close();
    }
  });

  test(`${space} embedding replacement keeps last-write-wins semantics for duplicate keys`, async () => {
    const db = new CountedDB(space);
    try {
      seedDocument(db, 1);
      await db.withTransactionAsync(() => repository.replaceEmbeddings(db, [
        {
          id: 'replacement-first',
          chunkId: 'chunk-0',
          providerId: 'provider-1',
          modelId: 'model-1',
          dimensions: 2,
          vectorJson: '[3,3]',
        },
        {
          id: 'replacement-last',
          chunkId: 'chunk-0',
          providerId: 'provider-1',
          modelId: 'model-1',
          dimensions: 2,
          vectorJson: '[7,7]',
        },
      ]));

      assert.equal(
        db.scalar(
          `SELECT COUNT(*) AS value
           FROM ai_embeddings
           WHERE chunkId = 'chunk-0'
             AND providerId = 'provider-1'
             AND modelId = 'model-1'`,
        ),
        1,
      );
      assert.equal(
        db.scalar("SELECT COUNT(*) AS value FROM ai_embeddings WHERE id = 'replacement-last' AND vectorJson = '[7,7]'"),
        1,
      );
    } finally {
      db.close();
    }
  });
}
