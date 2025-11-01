import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingStatusBadgeProps {
  status: 'success' | 'partial' | 'failed';
  className?: string;
}

export function ProcessingStatusBadge({ status, className }: ProcessingStatusBadgeProps) {
  const variants = {
    success: {
      icon: CheckCircle2,
      label: 'Success',
      className: 'bg-green-100 text-green-800 border-green-200',
    },
    partial: {
      icon: AlertTriangle,
      label: 'Partial',
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    },
    failed: {
      icon: XCircle,
      label: 'Failed',
      className: 'bg-red-100 text-red-800 border-red-200',
    },
  };

  const variant = variants[status];
  const Icon = variant.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border',
        variant.className,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{variant.label}</span>
    </span>
  );
}
