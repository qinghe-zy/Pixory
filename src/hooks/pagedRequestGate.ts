export interface PagedRequestToken {
  generation: number;
  requestKey: string;
}

export function createPagedRequestGate(initialRequestKey: string) {
  let generation = 0;
  let requestKey = initialRequestKey;

  return {
    syncRequestKey(nextRequestKey: string) {
      if (nextRequestKey !== requestKey) {
        requestKey = nextRequestKey;
        generation += 1;
      }
    },
    beginRequest(): PagedRequestToken {
      generation += 1;
      return { generation, requestKey };
    },
    isCurrent(token: PagedRequestToken): boolean {
      return token.generation === generation && token.requestKey === requestKey;
    },
    invalidate() {
      generation += 1;
    },
  };
}
