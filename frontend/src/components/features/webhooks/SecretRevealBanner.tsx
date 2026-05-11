import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, KeyRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SecretRevealBannerProps {
  secret: string;
  onDismiss: () => void;
}

/**
 * One-shot HMAC secret banner.
 *
 * The plaintext secret is returned exactly once by the backend (on create
 * or rotate). This banner makes the dismissal explicit — the user has to
 * close it, which mirrors the "save it now or lose it forever" semantics
 * of the API.
 */
export function SecretRevealBanner({ secret, onDismiss }: SecretRevealBannerProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in insecure contexts; the secret remains
      // visible in the banner so the user can copy manually.
    }
  };

  return (
    <div
      role="alert"
      className="rounded-md border border-yellow-300 bg-yellow-50 p-[clamp(0.5rem,1.5vw,1rem)] text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-100"
    >
      <div className="flex items-start gap-[clamp(0.5rem,1.5vw,1rem)]">
        <KeyRound className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[clamp(0.75rem,1.5vw,0.875rem)] font-semibold">
            {t('webhooks.secret.title')}
          </h3>
          <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] mt-1">
            {t('webhooks.secret.warning')}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white/60 px-2 py-1 font-mono text-[clamp(0.625rem,1.2vw,0.75rem)] dark:bg-black/30">
              {secret}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {t('webhooks.secret.copied')}
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  {t('webhooks.secret.copy')}
                </>
              )}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
          aria-label={t('webhooks.secret.dismiss')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
