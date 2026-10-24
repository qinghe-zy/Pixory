import PinyinMatch from 'pinyin-match';
import { SEARCHABLE_FEATURE_CATALOG } from './searchActionCatalog';

export interface SearchAction {
  id: string;
  title: string;
  icon: string;
  aliases: string[];
  route: string;
  routeParams?: any;
}

export const GLOBAL_ACTIONS: SearchAction[] = SEARCHABLE_FEATURE_CATALOG
  .filter(entry => entry.enableInGlobalSearch !== false)
  .map(entry => ({
    id: entry.id,
    title: entry.title,
    icon: entry.icon,
    aliases: [...entry.aliases],
    route: entry.route,
    ...(entry.routeParams ? { routeParams: entry.routeParams } : {}),
  }));

export interface MatchedAction extends SearchAction {
  matchedAlias?: string;
}

export function searchActions(query: string): MatchedAction[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];

  const results: MatchedAction[] = [];

  for (const action of GLOBAL_ACTIONS) {
    if (PinyinMatch.match(action.title, keyword)) {
      results.push(action);
      continue;
    }

    for (const alias of action.aliases) {
      if (PinyinMatch.match(alias, keyword)) {
        results.push({ ...action, matchedAlias: alias });
        break;
      }
    }
  }

  return results;
}

export function getRandomRecommendedActions(count: number): SearchAction[] {
  const shuffled = [...GLOBAL_ACTIONS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
