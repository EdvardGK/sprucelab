import { KeyboardEvent, MouseEvent, ReactNode, createElement } from 'react';

import { cn } from '@/lib/utils';

interface DrillTargetProps {
  onActivate: () => void;
  active?: boolean;
  as?: 'div' | 'button' | 'span';
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  children: ReactNode;
}

export function DrillTarget({
  onActivate,
  active = false,
  as = 'div',
  className,
  ariaLabel,
  disabled = false,
  children,
}: DrillTargetProps) {
  const handleClick = (e: MouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    onActivate();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onActivate();
    }
  };

  const isButton = as === 'button';

  return createElement(
    as,
    {
      onClick: handleClick,
      onKeyDown: isButton ? undefined : handleKeyDown,
      role: isButton ? undefined : 'button',
      tabIndex: isButton ? undefined : disabled ? -1 : 0,
      'aria-pressed': active,
      'aria-label': ariaLabel,
      'aria-disabled': disabled || undefined,
      type: isButton ? 'button' : undefined,
      className: cn(
        'transition-all',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:brightness-110 hover:outline hover:outline-1 hover:outline-primary hover:outline-offset-[1px]',
        active && 'outline outline-1 outline-primary outline-offset-[1px]',
        'focus:outline focus:outline-1 focus:outline-primary focus:outline-offset-[1px] focus-visible:ring-2 focus-visible:ring-primary/30',
        className,
      ),
    },
    children,
  );
}
