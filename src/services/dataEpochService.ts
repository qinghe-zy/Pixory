export type DataEpochDomain = 'ipLibrary' | 'media' | `chatThread:${string}`;
export type DataEpochScope = 'global' | 'normal' | 'personal';

const dataEpochs = new Map<string, number>();

function epochKey(domain: DataEpochDomain, scope: DataEpochScope): string {
  return `${scope}:${domain}`;
}

function getScopedEpoch(domain: DataEpochDomain, scope: DataEpochScope): number {
  return dataEpochs.get(epochKey(domain, scope)) ?? 0;
}

export function getDataEpoch(domain: DataEpochDomain, scope: DataEpochScope = 'global'): number {
  const globalEpoch = getScopedEpoch(domain, 'global');
  return scope === 'global' ? globalEpoch : globalEpoch + getScopedEpoch(domain, scope);
}

export function bumpDataEpoch(domain: DataEpochDomain, scope: DataEpochScope = 'global'): number {
  dataEpochs.set(epochKey(domain, scope), getScopedEpoch(domain, scope) + 1);
  return getDataEpoch(domain, scope);
}
