export const globalScrollState = {
  isScrolling: false,
};

export const createScrollHandlers = () => {
  return {
    onScrollBeginDrag: () => {
      globalScrollState.isScrolling = true;
    },
    onScrollEndDrag: (e: any) => {
      // If velocity is 0, momentum scroll won't trigger, so we end scrolling here
      const velocity = e.nativeEvent.velocity;
      if (!velocity || (Math.abs(velocity.y) === 0 && Math.abs(velocity.x) === 0)) {
        globalScrollState.isScrolling = false;
      }
    },
    onMomentumScrollBegin: () => {
      globalScrollState.isScrolling = true;
    },
    onMomentumScrollEnd: () => {
      globalScrollState.isScrolling = false;
    },
  };
};
