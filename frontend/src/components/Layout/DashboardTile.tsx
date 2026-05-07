import * as React from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DashboardTileProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  variant?: 'default' | 'highlight' | 'accent';
}

const variantClass: Record<NonNullable<DashboardTileProps['variant']>, string> = {
  default: '',
  highlight: 'ring-1 ring-primary/30',
  accent: 'ring-1 ring-accent/40',
};

export function DashboardTile({
  id,
  variant = 'default',
  className,
  children,
  style,
  ...rest
}: DashboardTileProps) {
  return (
    <Card
      data-tile-id={id}
      style={style}
      className={cn(
        'h-full w-full flex flex-col overflow-hidden transition-shadow',
        variantClass[variant],
        className
      )}
      {...rest}
    >
      {children}
    </Card>
  );
}
