import { Loader2, CheckCircle, XCircle, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ModelStatusBadgeProps {
  status: 'uploading' | 'processing' | 'ready' | 'error';
  className?: string;
}

export function ModelStatusBadge({ status, className }: ModelStatusBadgeProps) {
  const statusConfig = {
    uploading: {
      icon: Upload,
      label: 'Uploading',
      variant: 'default' as const,
      animate: true,
    },
    processing: {
      icon: Loader2,
      label: 'Processing',
      variant: 'default' as const,
      animate: true,
    },
    ready: {
      icon: CheckCircle,
      label: 'Ready',
      variant: 'success' as const,
      animate: false,
    },
    error: {
      icon: XCircle,
      label: 'Error',
      variant: 'destructive' as const,
      animate: false,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={className}>
      <Icon className={`mr-1 h-3 w-3 ${config.animate ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
}
