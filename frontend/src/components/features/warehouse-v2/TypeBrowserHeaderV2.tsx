import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

interface TypeBrowserHeaderV2Props {
  loading?: boolean;
}

export function TypeBrowserHeaderV2(_props: TypeBrowserHeaderV2Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const switchToV1 = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('v');
    setSearchParams(next, { replace: false });
  };

  return (
    <header className="flex items-center justify-between gap-[clamp(0.5rem,1vw,1rem)] flex-shrink-0">
      <h1 className="text-[clamp(1rem,1.6vw,1.5rem)] font-semibold tracking-tight">
        {t('typesV2.title')}
      </h1>
      <button
        type="button"
        onClick={switchToV1}
        className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
      >
        {t('typesV2.tryV1Link')}
      </button>
    </header>
  );
}
