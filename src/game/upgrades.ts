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
  { id: 'manual', name: 'Перейти на ручное управление', description: '+800 за клик', kind: 'click', value: 800, baseCost: 200000 },
  { id: 'committee', name: 'Создать комитет по контролю', description: '+8 тыс в секунду', kind: 'passive', value: 8000, baseCost: 2800000 },
  { id: 'referendum', name: 'Провести референдум', description: '+4 тыс за клик', kind: 'click', value: 4000, baseCost: 1200000 },
  { id: 'party', name: 'Основать партию власти', description: '+45 тыс в секунду', kind: 'passive', value: 45000, baseCost: 17000000 },
  { id: 'immunity', name: 'Закон о неприкосновенности', description: '+20 тыс за клик', kind: 'click', value: 20000, baseCost: 7000000 },
  { id: 'security', name: 'Подчинить силовые ведомства', description: '+250 тыс в секунду', kind: 'passive', value: 250000, baseCost: 100000000 },
  { id: 'cult', name: 'Создать культ личности', description: '+100 тыс за клик', kind: 'click', value: 100000, baseCost: 40000000 },
  { id: 'banks', name: 'Взять под контроль банки', description: '+1,4 млн в секунду', kind: 'passive', value: 1400000, baseCost: 600000000 },
  { id: 'guarantor', name: 'Стать гарантом конституции', description: '+500 тыс за клик', kind: 'click', value: 500000, baseCost: 220000000 },
  { id: 'oil', name: 'Национализировать нефтегаз', description: '+8 млн в секунду', kind: 'passive', value: 8000000, baseCost: 3600000000 },
  { id: 'marshal', name: 'Присвоить звание маршала', description: '+2,5 млн за клик', kind: 'click', value: 2500000, baseCost: 1200000000 },
  { id: 'vertical', name: 'Выстроить вертикаль власти', description: '+45 млн в секунду', kind: 'passive', value: 45000000, baseCost: 22000000000 },
  { id: 'lifelong', name: 'Продлить полномочия пожизненно', description: '+12 млн за клик', kind: 'click', value: 12000000, baseCost: 6500000000 },
  { id: 'union', name: 'Создать наднациональный союз', description: '+250 млн в секунду', kind: 'passive', value: 250000000, baseCost: 130000000000 },
  { id: 'newera', name: 'Провозгласить новую эру', description: '+60 млн за клик', kind: 'click', value: 60000000, baseCost: 36000000000 },
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