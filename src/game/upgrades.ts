import { GAME_CONFIG } from './gameConfig';

export type UpgradeKind = 'click' | 'passive';

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  kind: UpgradeKind;
  value: number;
  baseCost: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'pen', name: 'Купить золотую ручку', description: '+1 за клик', kind: 'click', value: 1, baseCost: 15 },
  { id: 'secretary', name: 'Нанять секретаря', description: '+1 в секунду', kind: 'passive', value: 1, baseCost: 50 },
  { id: 'stamp', name: 'Установить новую печать', description: '+5 за клик', kind: 'click', value: 5, baseCost: 250 },
  { id: 'ministry', name: 'Поставить своего министра', description: '+8 в секунду', kind: 'passive', value: 8, baseCost: 800 },
  { id: 'edo', name: 'Ввести электронный документооборот', description: '+30 за клик', kind: 'click', value: 30, baseCost: 3500 },
  { id: 'emergency', name: 'Получить чрезвычайные полномочия', description: '+150 за клик', kind: 'click', value: 150, baseCost: 30000 },
  { id: 'administration', name: 'Внедрить своего в администрацию', description: '+50 в секунду', kind: 'passive', value: 50, baseCost: 12000 },
  { id: 'corporation', name: 'Создать госкорпорацию', description: '+300 в секунду', kind: 'passive', value: 300, baseCost: 80000 },
  { id: 'media', name: 'Взять под контроль СМИ', description: '+1500 в секунду', kind: 'passive', value: 1500, baseCost: 450000 },
];

export function upgradeCost(def: UpgradeDef, owned: number): number {
  return Math.ceil(def.baseCost * Math.pow(GAME_CONFIG.costGrowth, owned));
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