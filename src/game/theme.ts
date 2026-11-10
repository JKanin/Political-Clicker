export const FONT = 'system-ui, sans-serif';
export const FONT_HEAD = '"PT Serif", Georgia, "Times New Roman", serif';

export const COLORS = {
  bg: 0x1d110b,
  header: 0x1b100a,
  panel: 0x1b3b30,
  panelEdge: 0x6b4630,
  stitch: 0xe0c27a,
  overlay: 0x0e0805,
  row: 0x3a2a1c,
  rowHover: 0x4d3a28,
  rowEdge: 0xb08d57,
  window: 0x2a2016,
  windowEdge: 0xc9a14a,
  disabled: 0x4b5d7a,
  gold: 0xfde047,
  white: 0xffffff,
  brass: 0xc9a14a,
  brassDark: 0x8a6a2c,
  paper: 0xf3ead3,
  paperEdge: 0xcdbd93,
  paperInk: 0x3b3a45,
  sealRed: 0xb91c1c,
  sealDark: 0x7f1d1d,
  primary: 0x2f86c6,
  primaryHover: 0x4aa3df,
  ok: 0x16a34a,
  danger: 0xdc2626,
  dangerHover: 0xef4444,
  warn: 0xd97706,
  warnFlash: 0xf59e0b,
  sanction: 0xea580c,
  buff: 0x8b5cf6,
  buffHover: 0xa78bfa,
} as const;

export const TEXT = {
  bg: '#1d110b',
  white: '#ffffff',
  gold: '#fde047',
  cream: '#f1deaa',
  muted: '#e2e8f0',
  danger: '#fecaca',
  ok: '#86efac',
} as const;

export const BRANCH = {
  click: {
    fill: 0x33241a,
    ready: 0x5c4122,
    hover: 0x432f1f,
    edge: 0xb08d57,
    inner: 0x7a5a2a,
    accent: 0xfbbf24,
    medal: 0x6b4a1f,
  },
  passive: {
    fill: 0x172a44,
    ready: 0x24507f,
    hover: 0x1f3a5c,
    edge: 0x7da2d4,
    inner: 0x4a6c9a,
    accent: 0x7dd3fc,
    medal: 0x1e3f6b,
  },
} as const;

export function tierOf(owned: number): 0 | 1 | 2 | 3 {
  if (owned >= 25) return 3;
  if (owned >= 10) return 2;
  if (owned >= 5) return 1;
  return 0;
}

export const TIER_COLORS = [0x000000, 0xcd7f32, 0xe2e8f0, 0xfde047] as const;
export const TIER_TEXT = ['#e2e8f0', '#e9a35c', '#f1f5f9', '#fde047'] as const;
