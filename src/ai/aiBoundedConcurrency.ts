export async function settleWithConcurrency<T, TResult>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Concurrency limit must be a positive integer.');
  }
  const results = new Array<PromiseSettledResult<TResult>>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
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
  return results;
}
