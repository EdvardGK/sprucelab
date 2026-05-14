/**
 * Formatters + tone resolution used across every admin page.
 *
 * Tone mirrors AnalysisKpiCluster (Model dashboard) so KPI tiles read
 * with the same visual grammar as Types/Models — green/amber/red rings
 * driven off success-rate thresholds.
 */

export type Tone = 'neutral' | 'good' | 'warning' | 'danger';

export const TONE_STYLES: Record<Tone, { card: string; value: string; icon: string; spark: string }> = {
  neutral: {
    card: '',
    value: 'text-text-primary',
    icon: 'text-text-tertiary',
    spark: 'hsl(220 9% 46%)',
  },
  good: {
    card: 'ring-1 ring-[hsl(158_70%_28%/0.25)]',
    value: 'text-[hsl(158_70%_28%)]',
    icon: 'text-[hsl(158_70%_28%)]',
    spark: 'hsl(158 70% 28%)',
  },
  warning: {
    card: 'ring-1 ring-amber-400/40',
    value: 'text-amber-600 dark:text-amber-400',
    icon: 'text-amber-500',
    spark: 'hsl(38 92% 50%)',
  },
  danger: {
    card: 'ring-1 ring-red-400/50',
    value: 'text-red-600 dark:text-red-400',
    icon: 'text-red-500',
    spark: 'hsl(0 84% 60%)',
  },
};

export function toneForRate(frac: number | null | undefined): Tone {
  if (frac == null) return 'neutral';
  if (frac >= 0.95) return 'good';
  if (frac >= 0.8) return 'warning';
  return 'danger';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('nb-NO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatSeconds(s: number | null | undefined): string {
  if (s == null) return '—';
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return formatSeconds(ms / 1000);
}

export function formatPercent(frac: number | null | undefined): string {
  if (frac == null) return '—';
  return `${(frac * 100).toFixed(1)}%`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const days = Math.floor(h / 24);
  return `${days}d ${h % 24}h ago`;
}
