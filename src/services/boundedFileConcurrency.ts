export const MAX_FILE_TASK_CONCURRENCY = 4;

export interface BoundedFileTaskOptions {
  signal?: AbortSignal;
}

function createAbortError(): Error {
  const error = new Error('File work was aborted.');
  error.name = 'AbortError';
  return error;
}

/**
 * Runs filesystem work through a fixed worker cursor. Results stay aligned with
 * input order and one failed item never rejects the whole batch.
 */
export async function settleFileTasksWithConcurrency<T, TResult>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<TResult>,
  options: BoundedFileTaskOptions = {},
): Promise<PromiseSettledResult<TResult>[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FILE_TASK_CONCURRENCY) {
    throw new Error(`File task concurrency must be between 1 and ${MAX_FILE_TASK_CONCURRENCY}.`);
  }

  const results = new Array<PromiseSettledResult<TResult>>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (!options.signal?.aborted && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = {
          status: 'fulfilled',
          value: await mapper(items[index], index),
        };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (options.signal?.aborted) {
    for (let index = 0; index < results.length; index += 1) {
      if (!results[index]) {
        results[index] = { status: 'rejected', reason: createAbortError() };
      }
    }
  }
  return results;
}
