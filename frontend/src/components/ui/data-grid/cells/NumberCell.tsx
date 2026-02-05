interface NumberCellProps {
  value: number | null | undefined;
  format?: 'integer' | 'decimal' | 'percent';
}

export function NumberCell({ value, format = 'integer' }: NumberCellProps) {
  if (value == null) return <span style={{ color: 'var(--dg-text-placeholder)' }}>—</span>;

  let display: string;
  switch (format) {
    case 'percent':
      display = `${Math.round(value)}%`;
      break;
    case 'decimal':
      display = value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
      break;
    default:
      display = value.toLocaleString();
  }

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', width: '100%', display: 'inline-block' }}>
      {display}
    </span>
  );
}
