const UNITS = [
  { v: 1e15, s: ' Bd' },
  { v: 1e12, s: ' Bn' },
  { v: 1e9, s: ' Md' },
  { v: 1e6, s: ' M' },
];

/** 1 234 · 12,5 M · 3,41 Md */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const abs = Math.abs(n);
  for (const u of UNITS) {
    if (abs >= u.v) return (n / u.v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + u.s;
  }
  if (abs < 10 && abs % 1 !== 0) return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return Math.floor(n).toLocaleString('fr-FR');
}

export function fmtRate(n: number): string {
  if (n > 0 && n < 10) return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return fmt(n);
}

export function fmtDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}
