import * as React from 'react';

import { cn } from '@/lib/utils';

interface PageShellProps {
  /** Page title — renders as `<h1>` at clamp(1rem, 1.6vw, 1.5rem). */
  title: string;
  /** Optional subtitle, rendered as muted text beside (or below) the title. */
  subtitle?: string;
  /** Right-aligned slot for header actions (freshness badge, filter chips, switches, etc.). */
  headerRight?: React.ReactNode;
  /** Optional extra classes on the root element. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Canonical page chrome — 3px brand gradient strip + clamp header + page
 * padding. The page scrolls naturally; no viewport math, no max-width cap.
 *
 * Surfaces that lift the Types v2 design language use this primitive so the
 * gradient strip, header size, and outer padding live in exactly one place.
 *
 * Cards inside the page own their own bounded scroll (`max-h-[...]` etc.) —
 * never the shell.
 */
export function PageShell({
  title,
  subtitle,
  headerRight,
  className,
  children,
}: PageShellProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-[clamp(0.5rem,1vh,1rem)] px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.75rem,1.5vh,1.25rem)]',
        className
      )}
    >
      {/* Signature gradient accent — skiplum-reports pattern */}
      <div
        className="h-[3px] w-full rounded-full bg-gradient-to-r from-[#D0D34D] via-[#157954] to-[#21263A]"
        aria-hidden="true"
      />

      <header className="flex items-baseline justify-between gap-[clamp(0.5rem,1vw,1rem)] flex-wrap flex-shrink-0">
        <div className="flex items-baseline gap-[clamp(0.5rem,1vw,1rem)] flex-wrap min-w-0">
          <h1 className="text-[clamp(1rem,1.6vw,1.5rem)] font-semibold tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <span className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground">
              {subtitle}
            </span>
          )}
        </div>
        {headerRight && (
          <div className="flex items-center gap-[clamp(0.5rem,1vw,1rem)] flex-wrap">
            {headerRight}
          </div>
        )}
      </header>

      {children}
    </div>
  );
}
