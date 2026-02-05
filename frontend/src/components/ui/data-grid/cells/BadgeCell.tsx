interface BadgeCellProps {
  value: string | null | undefined;
  /** CSS class suffix for dg-badge-{status} */
  badgeClass?: string;
  label?: string;
}

export function BadgeCell({ value, badgeClass, label }: BadgeCellProps) {
  if (!value) return <span style={{ color: 'var(--dg-text-placeholder)' }}>—</span>;

  const cls = badgeClass || value;
  return <span className={`dg-badge dg-badge-${cls}`}>{label || value}</span>;
}
