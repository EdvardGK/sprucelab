import { ReactNode } from 'react';

interface AppHeaderProps {
  children: ReactNode;
}

export function AppHeader({ children }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-background-elevated px-4 py-3">
      {children}
    </header>
  );
}
