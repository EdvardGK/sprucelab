import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';

interface AppLayoutProps {
  children: ReactNode;
  headerContent?: ReactNode;
}

export function AppLayout({ children, headerContent }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        {headerContent && <AppHeader>{headerContent}</AppHeader>}

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
