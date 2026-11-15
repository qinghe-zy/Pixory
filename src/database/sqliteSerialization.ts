import type {
  SQLiteDatabase,
  SQLiteExecuteAsyncResult,
  SQLiteRunResult,
  SQLiteStatement,
} from 'expo-sqlite';

const serializedDatabases = new WeakSet<object>();

export interface BareWriteAuditEntry {
  sqlPreview: string;
  timestampMs: number;
}

export interface SqliteSerializationDiagnostics {
  activeTxDepth: number;
  activeScopedTxDepth: number;
  bareWriteWarnings: number;
  recentBareWrites: BareWriteAuditEntry[];
}

type AsyncTask<T> = () => Promise<T>;
type TransactionCallback = (txn: SQLiteDatabase) => Promise<void>;
type ScopedTransactionCallback<R> = (txDb: SQLiteDatabase) => Promise<R>;

interface ScopedTxController {
  isTransactionHandle: boolean;
  runScopedTransaction: <R>(task: ScopedTransactionCallback<R>) => Promise<R>;
  getDiagnostics: () => SqliteSerializationDiagnostics;
}

const MUTATING_SQL_KEYWORDS = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  'REPLACE',
  'CREATE',
  'DROP',
  'ALTER',
  'VACUUM',
  'REINDEX',
]);

const MAX_RECENT_BARE_WRITES = 20;
const connectionControllers = new WeakMap<object, ScopedTxController>();

function extractLeadingSqlKeyword(statement: string): string {
  const cleaned = statement
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .trim();
  const match = /^([A-Za-z]+)/.exec(cleaned);
  return match ? match[1].toUpperCase() : '';
}

function isMutatingSql(source: string): boolean {
  if (!source || typeof source !== 'string') {
    return false;
  }
  const segments = source.split(';');
  for (const segment of segments) {
    const keyword = extractLeadingSqlKeyword(segment);
    if (keyword && MUTATING_SQL_KEYWORDS.has(keyword)) {
      return true;
    }
  }
  return false;
}

function formatSqlPreview(source: string): string {
  return source
    .replace(/'(?:''|[^'])*'/g, "'?'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Wraps a SQLiteDatabase instance so every async native SQLite operation runs
 * strictly sequentially through a per-connection FIFO opQueue, and transactions
 * serialize on a per-connection txQueue with SAVEPOINT reentrancy on txn.
 *
 * Why this lives at the SQLiteDatabase boundary (never wrapping runWithDatabaseSpace):
 * Hermes lacks AsyncLocalStorage, so queuing user callbacks in runWithDatabaseSpace
 * deadlocks whenever an outer database callback invokes an inner helper that calls
 * runWithDatabaseSpace. Serializing leaf SQL/statement calls and BEGIN..COMMIT keeps
 * nested runWithDatabaseSpace calls deadlock-free while preventing Dispatchers.IO
 * multi-thread sqlite3* crashes (SIGSEGV in sqlite3_prepare_v2) and second-connection
 * SQLITE_BUSY errors from withExclusiveTransactionAsync.
 */
export function serializeSqliteDatabase<T extends SQLiteDatabase>(database: T): T {
  if (!database || typeof database !== 'object') {
    return database;
  }
  if (serializedDatabases.has(database)) {
    return database;
  }
  serializedDatabases.add(database);

  let opTail: Promise<unknown> = Promise.resolve();
  let txTail: Promise<unknown> = Promise.resolve();
  let nextSavepointId = 0;
  let activeTxDepth = 0;
  let activeScopedTxDepth = 0;
  let bareWriteWarnings = 0;
  const recentBareWrites: BareWriteAuditEntry[] = [];
  let scopedGatePromise: Promise<void> | null = null;
  let resolveScopedGate: (() => void) | null = null;

  function enqueueOpScoped<R>(task: AsyncTask<R>): Promise<R> {
    const next = opTail.then(task, task);
    opTail = next.catch(() => undefined);
    return next;
  }

  function enterScopedExclusion(): void {
    activeScopedTxDepth += 1;
    if (activeScopedTxDepth === 1) {
      scopedGatePromise = new Promise<void>((resolve) => {
        resolveScopedGate = resolve;
      });
    }
  }

  function leaveScopedExclusion(): void {
    activeScopedTxDepth = Math.max(0, activeScopedTxDepth - 1);
    if (activeScopedTxDepth === 0 && resolveScopedGate) {
      const release = resolveScopedGate;
      scopedGatePromise = null;
      resolveScopedGate = null;
      release();
    }
  }

  function recordBareWriteIfNeeded(sql?: string): void {
    if (activeTxDepth <= 0 || !sql || !isMutatingSql(sql)) {
      return;
    }
    bareWriteWarnings += 1;
    const entry: BareWriteAuditEntry = {
      sqlPreview: formatSqlPreview(sql),
      timestampMs: Date.now(),
    };
    recentBareWrites.push(entry);
    if (recentBareWrites.length > MAX_RECENT_BARE_WRITES) {
      recentBareWrites.shift();
    }
    console.warn('[sqliteSerialization] Unscoped mutating SQL executed while a transaction is active:', entry.sqlPreview);
  }

  async function scheduleOp<R>(useExternal: boolean, task: AsyncTask<R>, sql?: string): Promise<R> {
    if (useExternal) {
      while (scopedGatePromise) {
        await scopedGatePromise;
      }
      recordBareWriteIfNeeded(sql);
    }
    return enqueueOpScoped(task);
  }

  function enqueueTx<R>(task: AsyncTask<R>): Promise<R> {
    const next = txTail.then(task, task);
    txTail = next.catch(() => undefined);
    return next;
  }

  function getDiagnostics(): SqliteSerializationDiagnostics {
    return {
      activeTxDepth,
      activeScopedTxDepth,
      bareWriteWarnings,
      recentBareWrites: recentBareWrites.map((entry) => ({ ...entry })),
    };
  }

  const rawDatabase = database as T & {
    nativeDatabase?: unknown;
    withExclusiveTransactionAsync?: (task: (txn: any) => Promise<void>) => Promise<void>;
    createSessionAsync?: (dbName?: string) => Promise<unknown>;
    loadExtensionAsync?: (libPath: string, entryPoint?: string) => Promise<void>;
    syncLibSQL?: () => Promise<void>;
  };

  const hasNativeDatabase = Boolean(rawDatabase.nativeDatabase);
  const rawExecAsync = typeof rawDatabase.execAsync === 'function' ? rawDatabase.execAsync.bind(rawDatabase) : null;
  const rawPrepareAsync = typeof rawDatabase.prepareAsync === 'function' ? rawDatabase.prepareAsync.bind(rawDatabase) : null;
  const rawRunAsync = typeof rawDatabase.runAsync === 'function' ? rawDatabase.runAsync.bind(rawDatabase) : null;
  const rawGetFirstAsync = typeof rawDatabase.getFirstAsync === 'function' ? rawDatabase.getFirstAsync.bind(rawDatabase) : null;
  const rawGetAllAsync = typeof rawDatabase.getAllAsync === 'function' ? rawDatabase.getAllAsync.bind(rawDatabase) : null;
  const rawIsInTransactionAsync =
    typeof rawDatabase.isInTransactionAsync === 'function'
      ? rawDatabase.isInTransactionAsync.bind(rawDatabase)
      : null;
  const rawCloseAsync = typeof rawDatabase.closeAsync === 'function' ? rawDatabase.closeAsync.bind(rawDatabase) : null;
  const rawSerializeAsync =
    typeof rawDatabase.serializeAsync === 'function' ? rawDatabase.serializeAsync.bind(rawDatabase) : null;
  const rawCreateSessionAsync =
    typeof rawDatabase.createSessionAsync === 'function' ? rawDatabase.createSessionAsync.bind(rawDatabase) : null;
  const rawLoadExtensionAsync =
    typeof rawDatabase.loadExtensionAsync === 'function' ? rawDatabase.loadExtensionAsync.bind(rawDatabase) : null;
  const rawSyncLibSQL = typeof rawDatabase.syncLibSQL === 'function' ? rawDatabase.syncLibSQL.bind(rawDatabase) : null;

  function wrapExecuteResult<Row>(
    result: SQLiteExecuteAsyncResult<Row>,
    useExternal: boolean,
  ): SQLiteExecuteAsyncResult<Row> {
    const rawGetFirst = result.getFirstAsync.bind(result);
    const rawGetAll = result.getAllAsync.bind(result);
    const rawReset = result.resetAsync.bind(result);
    const rawNext = result.next.bind(result);
    const rawReturn = typeof result.return === 'function' ? result.return.bind(result) : null;
    const rawThrow = typeof result.throw === 'function' ? result.throw.bind(result) : null;

    Object.defineProperties(result, {
      getFirstAsync: { value: () => scheduleOp(useExternal, () => rawGetFirst()), configurable: true, enumerable: true },
      getAllAsync: { value: () => scheduleOp(useExternal, () => rawGetAll()), configurable: true, enumerable: true },
      resetAsync: { value: () => scheduleOp(useExternal, () => rawReset()), configurable: true, enumerable: true },
      next: {
        value: (...args: [] | [unknown]) => scheduleOp(useExternal, () => rawNext(...(args as []))),
        configurable: true,
      },
      ...(rawReturn
        ? {
            return: {
              value: (value?: unknown) => scheduleOp(useExternal, () => rawReturn(value as never)),
              configurable: true,
            },
          }
        : {}),
      ...(rawThrow
        ? {
            throw: {
              value: (err?: unknown) => scheduleOp(useExternal, () => rawThrow(err)),
              configurable: true,
            },
          }
        : {}),
    });
    return result;
  }

  const wrapPreparedStatement = (
    statement: SQLiteStatement,
    useExternal: boolean,
    sourceSql: string,
  ): SQLiteStatement => {
    const rawExecute = statement.executeAsync.bind(statement);
    const rawExecuteForRaw = statement.executeForRawResultAsync.bind(statement);
    const rawGetColumnNames = statement.getColumnNamesAsync.bind(statement);
    const rawFinalize = statement.finalizeAsync.bind(statement);

    Object.defineProperties(statement, {
      executeAsync: {
        value: async function executeSerialized<Row>(...params: unknown[]) {
          const result = await scheduleOp(
            useExternal,
            () => rawExecute<Row>(...(params as [never])),
            sourceSql,
          );
          return wrapExecuteResult(result, useExternal);
        },
        configurable: true,
      },
      executeForRawResultAsync: {
        value: async function executeRawSerialized<Row extends object>(...params: unknown[]) {
          const result = await scheduleOp(
            useExternal,
            () => rawExecuteForRaw<Row>(...(params as [never])),
            sourceSql,
          );
          return wrapExecuteResult(result, useExternal);
        },
        configurable: true,
      },
      getColumnNamesAsync: {
        value: () => scheduleOp(useExternal, () => rawGetColumnNames()),
        configurable: true,
      },
      finalizeAsync: {
        value: () => scheduleOp(useExternal, () => rawFinalize()),
        configurable: true,
      },
    });
    return statement;
  };

  const finalizeStatementQuietly = async (statement: SQLiteStatement): Promise<void> => {
    try {
      await statement.finalizeAsync();
    } catch {
      // Ignore secondary finalize failures when unwinding a failed statement.
    }
  };

  const executePreparedOp = <R,>(
    useExternal: boolean,
    source: string,
    execFn: (statement: SQLiteStatement) => Promise<R>,
  ): Promise<R> => {
    return scheduleOp(
      useExternal,
      async () => {
        const statement = await rawPrepareAsync!(source);
        let finalized = false;
        try {
          const value = await execFn(statement);
          finalized = true;
          await statement.finalizeAsync();
          return value;
        } catch (error) {
          if (!finalized) {
            finalized = true;
            await finalizeStatementQuietly(statement);
          }
          throw error;
        }
      },
      source,
    );
  };

  const createMethodSet = (useExternal: boolean) => {
    async function* getEachRows<Row>(source: string, ...params: unknown[]): AsyncIterableIterator<Row> {
      if (!rawPrepareAsync) {
        throw new Error('SQLiteDatabase.getEachAsync requires prepareAsync.');
      }
      const statement = await scheduleOp(useExternal, () => rawPrepareAsync(source), source);
      let hasActiveError = false;
      try {
        const result = await scheduleOp(useExternal, () => statement.executeAsync<Row>(...(params as [never])));
        while (true) {
          const step = await scheduleOp(useExternal, () => result.next());
          if (step.done) {
            break;
          }
          yield step.value;
        }
      } catch (error) {
        hasActiveError = true;
        throw error;
      } finally {
        if (hasActiveError) {
          await scheduleOp(useExternal, () => finalizeStatementQuietly(statement));
        } else {
          await scheduleOp(useExternal, () => statement.finalizeAsync());
        }
      }
    }

    return {
    execAsync: (source: string): Promise<void> => {
      if (!rawExecAsync) {
        return Promise.resolve();
      }
      return scheduleOp(useExternal, () => rawExecAsync(source), source);
    },
    prepareAsync: async (source: string): Promise<SQLiteStatement> => {
      if (!rawPrepareAsync) {
        throw new Error('SQLiteDatabase.prepareAsync is not available.');
      }
      const statement = await scheduleOp(useExternal, () => rawPrepareAsync(source));
      return wrapPreparedStatement(statement, useExternal, source);
    },
    runAsync: (source: string, ...params: unknown[]): Promise<SQLiteRunResult> => {
      // Reimplement convenience shorthands via rawPrepareAsync inside enqueueOp rather than
      // calling original db.runAsync, because expo-sqlite calls this.prepareAsync internally
      // and would otherwise re-enter opQueue.
      if (hasNativeDatabase && rawPrepareAsync) {
        return executePreparedOp(useExternal, source, (statement) => statement.executeAsync(...(params as [never])));
      }
      if (!rawRunAsync) {
        throw new Error('SQLiteDatabase.runAsync is not available.');
      }
      return scheduleOp(useExternal, () => rawRunAsync(source, ...(params as [never])), source);
    },
    getFirstAsync: <Row,>(source: string, ...params: unknown[]): Promise<Row | null> => {
      if (hasNativeDatabase && rawPrepareAsync) {
        return executePreparedOp(useExternal, source, async (statement) => {
          const result = await statement.executeAsync<Row>(...(params as [never]));
          return result.getFirstAsync();
        });
      }
      if (!rawGetFirstAsync) {
        throw new Error('SQLiteDatabase.getFirstAsync is not available.');
      }
      return scheduleOp(useExternal, () => rawGetFirstAsync<Row>(source, ...(params as [never])), source);
    },
    getAllAsync: <Row,>(source: string, ...params: unknown[]): Promise<Row[]> => {
      if (hasNativeDatabase && rawPrepareAsync) {
        return executePreparedOp(useExternal, source, async (statement) => {
          const result = await statement.executeAsync<Row>(...(params as [never]));
          return result.getAllAsync();
        });
      }
      if (!rawGetAllAsync) {
        throw new Error('SQLiteDatabase.getAllAsync is not available.');
      }
      return scheduleOp(useExternal, () => rawGetAllAsync<Row>(source, ...(params as [never])), source);
    },
    getEachAsync: <Row,>(source: string, ...params: unknown[]): AsyncIterableIterator<Row> =>
      getEachRows<Row>(source, ...params),
    isInTransactionAsync: (): Promise<boolean> => {
      if (!rawIsInTransactionAsync) {
        return Promise.resolve(false);
      }
      return scheduleOp(useExternal, () => rawIsInTransactionAsync());
    },
  };
  };

  const outerMethods = createMethodSet(true);
  const scopedMethods = createMethodSet(false);

  const runWithSavepoint = async <R,>(task: (txn: T) => Promise<R>, txnHandle: T): Promise<R> => {
    const savepointName = `_pixory_sp_${++nextSavepointId}`;
    await enqueueOpScoped(() => rawExecAsync!(`SAVEPOINT ${savepointName}`));
    try {
      const result = await task(txnHandle);
      await enqueueOpScoped(() => rawExecAsync!(`RELEASE SAVEPOINT ${savepointName}`));
      return result;
    } catch (error) {
      await enqueueOpScoped(async () => {
        try {
          const inTx = rawIsInTransactionAsync ? await rawIsInTransactionAsync() : true;
          if (inTx) {
            await rawExecAsync!(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            await rawExecAsync!(`RELEASE SAVEPOINT ${savepointName}`);
          }
        } catch {
          // Preserve original error if transaction was already aborted by SQLite.
        }
      });
      throw error;
    }
  };

  const createTransactionHandle = (): T => {
    const txnHandle = Object.create(rawDatabase) as T & {
      withExclusiveTransactionAsync?: (task: TransactionCallback) => Promise<void>;
    };
    const runNested = (task: TransactionCallback): Promise<void> =>
      rawExecAsync ? runWithSavepoint(task, txnHandle) : Promise.resolve(task(txnHandle));
    const runNestedScoped = <R,>(task: ScopedTransactionCallback<R>): Promise<R> =>
      rawExecAsync ? runWithSavepoint(task as (txn: T) => Promise<R>, txnHandle) : Promise.resolve(task(txnHandle));

    Object.defineProperties(txnHandle, {
      execAsync: { value: scopedMethods.execAsync, configurable: true },
      runAsync: { value: scopedMethods.runAsync, configurable: true },
      getFirstAsync: { value: scopedMethods.getFirstAsync, configurable: true },
      getAllAsync: { value: scopedMethods.getAllAsync, configurable: true },
      getEachAsync: { value: scopedMethods.getEachAsync, configurable: true },
      prepareAsync: { value: scopedMethods.prepareAsync, configurable: true },
      isInTransactionAsync: { value: scopedMethods.isInTransactionAsync, configurable: true },
      withTransactionAsync: { value: runNested, configurable: true },
      withExclusiveTransactionAsync: { value: runNested, configurable: true },
      closeAsync: { value: () => Promise.resolve(), configurable: true },
    });

    serializedDatabases.add(txnHandle);
    connectionControllers.set(txnHandle, {
      isTransactionHandle: true,
      runScopedTransaction: runNestedScoped,
      getDiagnostics,
    });
    return txnHandle;
  };

  const runTopLevelTransactionWithOptions = async <R,>(
    task: (txn: T) => Promise<R>,
    options: { scoped: boolean },
  ): Promise<R> => {
    return enqueueTx(async () => {
      const txnHandle = createTransactionHandle();
      if (options.scoped) {
        enterScopedExclusion();
      }
      activeTxDepth += 1;
      try {
        if (!rawExecAsync) {
          return await task(txnHandle);
        }
        await enqueueOpScoped(() => rawExecAsync('BEGIN IMMEDIATE'));
        try {
          const result = await task(txnHandle);
          await enqueueOpScoped(() => rawExecAsync('COMMIT'));
          return result;
        } catch (error) {
          await enqueueOpScoped(async () => {
            try {
              const inTx = rawIsInTransactionAsync ? await rawIsInTransactionAsync() : true;
              if (inTx) {
                await rawExecAsync('ROLLBACK');
              }
            } catch {
              // Preserve the original failure rather than masking it with "cannot rollback".
            }
          });
          throw error;
        }
      } finally {
        activeTxDepth = Math.max(0, activeTxDepth - 1);
        if (options.scoped) {
          leaveScopedExclusion();
        }
      }
    });
  };

  const runTopLevelTransaction = (task: TransactionCallback): Promise<void> =>
    runTopLevelTransactionWithOptions(task, { scoped: false });

  Object.defineProperties(rawDatabase, {
    execAsync: { value: outerMethods.execAsync, configurable: true },
    runAsync: { value: outerMethods.runAsync, configurable: true },
    getFirstAsync: { value: outerMethods.getFirstAsync, configurable: true },
    getAllAsync: { value: outerMethods.getAllAsync, configurable: true },
    getEachAsync: { value: outerMethods.getEachAsync, configurable: true },
    prepareAsync: { value: outerMethods.prepareAsync, configurable: true },
    withTransactionAsync: { value: runTopLevelTransaction, configurable: true },
    withExclusiveTransactionAsync: { value: runTopLevelTransaction, configurable: true },
    isInTransactionAsync: { value: outerMethods.isInTransactionAsync, configurable: true },
    ...(rawSerializeAsync
      ? { serializeAsync: { value: (dbName?: string) => scheduleOp(true, () => rawSerializeAsync(dbName)), configurable: true } }
      : {}),
    ...(rawCloseAsync
      ? { closeAsync: { value: () => enqueueTx(() => enqueueOpScoped(() => rawCloseAsync())), configurable: true } }
      : {}),
    ...(rawCreateSessionAsync
      ? {
          createSessionAsync: {
            value: (dbName?: string) => scheduleOp(true, () => rawCreateSessionAsync(dbName)),
            configurable: true,
          },
        }
      : {}),
    ...(rawLoadExtensionAsync
      ? {
          loadExtensionAsync: {
            value: (libPath: string, entryPoint?: string) => scheduleOp(true, () => rawLoadExtensionAsync(libPath, entryPoint)),
            configurable: true,
          },
        }
      : {}),
    ...(rawSyncLibSQL ? { syncLibSQL: { value: () => scheduleOp(true, () => rawSyncLibSQL()), configurable: true } } : {}),
  });

  connectionControllers.set(database, {
    isTransactionHandle: false,
    runScopedTransaction: (task) => runTopLevelTransactionWithOptions(task, { scoped: true }),
    getDiagnostics,
  });

  return database;
}

/**
 * Executes a transaction whose external connection handle ops wait until COMMIT/ROLLBACK,
 * while queries routed through the passed `txDb` handle run immediately inside the transaction.
 */
export async function withScopedTransaction<R>(
  database: SQLiteDatabase,
  task: ScopedTransactionCallback<R>,
): Promise<R> {
  if (!database || typeof database !== 'object') {
    throw new Error('withScopedTransaction requires a valid SQLiteDatabase instance.');
  }
  const existingController = connectionControllers.get(database);
  if (existingController) {
    return existingController.runScopedTransaction(task);
  }
  const serialized = serializeSqliteDatabase(database);
  const controller = connectionControllers.get(serialized);
  if (controller) {
    return controller.runScopedTransaction(task);
  }
  let result!: R;
  await serialized.withTransactionAsync(async () => {
    result = await task(serialized);
  });
  return result;
}

export function getSqliteSerializationDiagnostics(database: unknown): SqliteSerializationDiagnostics {
  if (database && typeof database === 'object') {
    const controller = connectionControllers.get(database);
    if (controller) {
      return controller.getDiagnostics();
    }
  }
  return {
    activeTxDepth: 0,
    activeScopedTxDepth: 0,
    bareWriteWarnings: 0,
    recentBareWrites: [],
  };
}

export function isSerializedSqliteDatabase(database: unknown): boolean {
  return Boolean(database && typeof database === 'object' && serializedDatabases.has(database));
}
