import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { LiveFreshness } from './LiveFreshness';

interface TypeBrowserHeaderV2Props {
  loading?: boolean;
  dataUpdatedAt?: number;
}

/**
 * Right-side header content for the Types page — freshness badge + a
 * "Switch to classic" escape link. Page chrome (title/gradient/padding)
 * lives in `<PageShell>` now; this component is consumed via PageShell's
 * `headerRight` slot.
 */
export function TypeBrowserHeaderV2({ dataUpdatedAt }: TypeBrowserHeaderV2Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const switchToV1 = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('v');
    setSearchParams(next, { replace: false });
  };

  return (
    <>
      <LiveFreshness dataUpdatedAt={dataUpdatedAt} />
      <button
        type="button"
        onClick={switchToV1}
        className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
      >
        {t('typesV2.tryV1Link')}
      </button>
    </>
  );
}
