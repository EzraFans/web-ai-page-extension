import { doubaoAdapter } from './doubao';
import { deepseekAdapter } from './deepseek';
import type { SiteAdapter } from './types';

export type { SiteAdapter } from './types';

export const ADAPTERS: SiteAdapter[] = [doubaoAdapter, deepseekAdapter];

export function adapterForCurrentHost(): SiteAdapter | null {
  const host = location.hostname;
  return ADAPTERS.find((a) => a.hostnames.includes(host)) ?? null;
}
