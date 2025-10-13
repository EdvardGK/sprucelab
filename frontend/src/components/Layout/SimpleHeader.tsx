import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Search, Bell, Settings, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SimpleHeaderProps {
  children?: ReactNode;
}

export function SimpleHeader({ children }: SimpleHeaderProps) {
  return (
    <header className="border-b border-border bg-background-elevated">
      <div className="flex h-14 items-center justify-between px-6">
        {/* Left side - Logo and workspace name */}
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">
              SF
            </div>
            <span className="text-lg font-semibold text-text-primary">Spruce Forge</span>
          </Link>
        </div>

        {/* Center - Page content (optional) */}
        {children && (
          <div className="flex flex-1 items-center justify-center">
            {children}
          </div>
        )}

        {/* Right side - Actions and user profile */}
        <div className="flex items-center gap-2">
          {/* Search button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </Button>

          {/* Settings */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>

          {/* Help */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Help"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>

          {/* User profile */}
          <button
            className="ml-2 flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface transition-colors"
            aria-label="User menu"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              U
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
