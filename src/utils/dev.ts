export const isDevToolsEnabled = __DEV__;

export function devLog(...args: unknown[]) {
  if (isDevToolsEnabled) {
    console.log(...args);
  }
}
