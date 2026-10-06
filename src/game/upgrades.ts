export type UpgradeKind = 'click' | 'passive';

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  kind: UpgradeKind;
  /** click: + к власти за клик; passive: + к власти в секунду */
  value: number;
  baseCost: number;
}

/** Рост цены с каждой покупкой: cost = baseCost * COST_GROWTH ^ owned */
export const COST_GROWTH = 1.15;

export const UPGRADES: UpgradeDef[] = [
  { id: 'pen', name: 'Золотое перо', description: '+1 за клик', kind: 'click', value: 1, baseCost: 15 },
  { id: 'secretary', name: 'Личный секретарь', description: '+1 в секунду', kind: 'passive', value: 1, baseCost: 50 },
  { id: 'stamp', name: 'Гербовая печать', description: '+5 за клик', kind: 'click', value: 5, baseCost: 250 },
  { id: 'ministry', name: 'Министерство', description: '+8 в секунду', kind: 'passive', value: 8, baseCost: 800 },
  { id: 'edo', name: 'Электронный документооборот', description: '+30 за клик', kind: 'click', value: 30, baseCost: 3500 },
  { id: 'administration', name: 'Администрация', description: '+50 в секунду', kind: 'passive', value: 50, baseCost: 12000 },
  { id: 'corporation', name: 'Госкорпорация', description: '+300 в секунду', kind: 'passive', value: 300, baseCost: 80000 },
];

export function upgradeCost(def: UpgradeDef, owned: number): number {
  return Math.ceil(def.baseCost * Math.pow(COST_GROWTH, owned));
}

export function formatNumber(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  const units = ['тыс', 'млн', 'млрд', 'трлн', 'квадр'];
  let value = n;
  let i = -1;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}