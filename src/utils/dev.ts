export const isDevToolsEnabled = __DEV__ && process.env.EXPO_PUBLIC_PIXORY_DEV_TOOLS === '1';

export function devLog(...args: unknown[]) {
  if (isDevToolsEnabled) {
    console.log(...args);
  }
}
