import { useToastStore } from '@/hooks/use-toast';
import { Toast } from './toast';

export function Toaster() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          variant={toast.variant}
          title={toast.title}
          description={toast.description}
          onClose={() => removeToast(toast.id)}
          className="animate-in slide-in-from-right-full fade-in duration-200"
        />
      ))}
    </div>
  );
}
