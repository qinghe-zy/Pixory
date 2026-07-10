export type StreamingTailLockState = {
  atBottom: boolean;
  escapedFromLock: boolean;
  nearBottom: boolean;
};

type StreamingTailPerfSnapshot = {
  blockMountCounts: Record<string, number>;
  blockTimings: Record<
    string,
    {
      firstTextVisibleAt?: number;
      measuredAt?: number;
      mountedAt?: number;
      promotedAt?: number;
    }
  >;
  currentLockState: StreamingTailLockState | null;
  detachedPatchCount: number;
  firstTextVisibleCount: number;
  maxMeasurementDiff: number;
  maxOverReservedHeight: number;
  maxReservedHeight: number;
  measuredBlockCount: number;
  measurementCount: number;
  promotionCount: number;
  promotedBlockCount: number;
  reconcileCount: number;
  tailStateUpdateCount: number;
};

const snapshot: StreamingTailPerfSnapshot = {
  blockMountCounts: {},
  blockTimings: {},
  currentLockState: null,
  detachedPatchCount: 0,
  firstTextVisibleCount: 0,
  maxMeasurementDiff: 0,
  maxOverReservedHeight: 0,
  maxReservedHeight: 0,
  measuredBlockCount: 0,
  measurementCount: 0,
  promotionCount: 0,
  promotedBlockCount: 0,
  reconcileCount: 0,
  tailStateUpdateCount: 0,
};

function runInDev(action: () => void) {
  if (!__DEV__) {
    return;
  }
  action();
}

function timingForBlock(blockId: string) {
  const current = snapshot.blockTimings[blockId] ?? {};
  snapshot.blockTimings[blockId] = current;
  return current;
}

export const streamingTailPerfDebug = {
  incrementDetachedPatchCount() {
    runInDev(() => {
      snapshot.detachedPatchCount += 1;
    });
  },

  incrementMeasurementCount() {
    runInDev(() => {
      snapshot.measurementCount += 1;
    });
  },

  incrementPromotionCount() {
    runInDev(() => {
      snapshot.promotionCount += 1;
    });
  },

  incrementReconcileCount() {
    runInDev(() => {
      snapshot.reconcileCount += 1;
    });
  },

  incrementTailStateUpdateCount() {
    runInDev(() => {
      snapshot.tailStateUpdateCount += 1;
    });
  },

  recordLockState(lockState: StreamingTailLockState) {
    runInDev(() => {
      snapshot.currentLockState = lockState;
    });
  },

  recordTailReplayBlockMounted(input: {
    blockId: string;
    finalized: boolean;
  }) {
    runInDev(() => {
      const mountCount = (snapshot.blockMountCounts[input.blockId] ?? 0) + 1;
      snapshot.blockMountCounts[input.blockId] = mountCount;
      timingForBlock(input.blockId).mountedAt = Date.now();
      if (input.finalized && mountCount > 1) {
        throw new Error(
          `Tail replay block remounted after finalization: ${input.blockId}`,
        );
      }
    });
  },

  recordTailReplayBlockMeasured(input: {
    blockId: string;
    height: number;
  }) {
    runInDev(() => {
      void input.blockId;
      void input.height;
      timingForBlock(input.blockId).measuredAt = Date.now();
      snapshot.measuredBlockCount += 1;
    });
  },

  recordTailReplayBlockPromoted(input: {
    blockId: string;
    finalized: boolean;
  }) {
    runInDev(() => {
      void input.blockId;
      void input.finalized;
      timingForBlock(input.blockId).promotedAt = Date.now();
      snapshot.promotedBlockCount += 1;
    });
  },

  recordTailReplayFirstTextVisible(input: {
    blockId: string;
  }) {
    runInDev(() => {
      void input.blockId;
      timingForBlock(input.blockId).firstTextVisibleAt = Date.now();
      snapshot.firstTextVisibleCount += 1;
    });
  },

  recordTailReplayMeasurementDiff(input: {
    blockId: string;
    diff: number;
  }) {
    runInDev(() => {
      void input.blockId;
      snapshot.maxMeasurementDiff = Math.max(
        snapshot.maxMeasurementDiff,
        Math.abs(input.diff),
      );
    });
  },

  recordTailReplayNegativeDebt(input: {
    debtHeight: number;
    reason: string;
  }) {
    runInDev(() => {
      if (input.debtHeight < 0) {
        throw new Error(
          `Tail replay negative debt (${input.reason}): ${input.debtHeight}`,
        );
      }
    });
  },

  recordTailReplayUnsafePayoff(input: {
    debtHeight: number;
    reason: string;
  }) {
    runInDev(() => {
      if (input.debtHeight > 0) {
        throw new Error(
          `Tail replay unsafe debt payoff (${input.reason}): ${input.debtHeight}`,
        );
      }
    });
  },

  recordReservedHeights(input: {
    overReservedHeight: number;
    totalReservedHeight: number;
  }) {
    runInDev(() => {
      snapshot.maxReservedHeight = Math.max(
        snapshot.maxReservedHeight,
        input.totalReservedHeight,
      );
      snapshot.maxOverReservedHeight = Math.max(
        snapshot.maxOverReservedHeight,
        input.overReservedHeight,
      );
    });
  },

  reset() {
    runInDev(() => {
      snapshot.blockMountCounts = {};
      snapshot.blockTimings = {};
      snapshot.currentLockState = null;
      snapshot.detachedPatchCount = 0;
      snapshot.firstTextVisibleCount = 0;
      snapshot.maxMeasurementDiff = 0;
      snapshot.maxOverReservedHeight = 0;
      snapshot.maxReservedHeight = 0;
      snapshot.measuredBlockCount = 0;
      snapshot.measurementCount = 0;
      snapshot.promotionCount = 0;
      snapshot.promotedBlockCount = 0;
      snapshot.reconcileCount = 0;
      snapshot.tailStateUpdateCount = 0;
    });
  },

  snapshot(): StreamingTailPerfSnapshot | null {
    if (!__DEV__) {
      return null;
    }
    return { ...snapshot };
  },
};
