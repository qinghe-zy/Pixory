export type StreamingTailLockState = {
  atBottom: boolean;
  escapedFromLock: boolean;
  nearBottom: boolean;
};

type StreamingTailPerfSnapshot = {
  currentLockState: StreamingTailLockState | null;
  detachedPatchCount: number;
  maxOverReservedHeight: number;
  maxReservedHeight: number;
  measurementCount: number;
  promotionCount: number;
  reconcileCount: number;
  tailStateUpdateCount: number;
};

const snapshot: StreamingTailPerfSnapshot = {
  currentLockState: null,
  detachedPatchCount: 0,
  maxOverReservedHeight: 0,
  maxReservedHeight: 0,
  measurementCount: 0,
  promotionCount: 0,
  reconcileCount: 0,
  tailStateUpdateCount: 0,
};

function runInDev(action: () => void) {
  if (!__DEV__) {
    return;
  }
  action();
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
      snapshot.currentLockState = null;
      snapshot.detachedPatchCount = 0;
      snapshot.maxOverReservedHeight = 0;
      snapshot.maxReservedHeight = 0;
      snapshot.measurementCount = 0;
      snapshot.promotionCount = 0;
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
