import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Archive, MapPin, Building2, Users, Settings2, Layers } from 'lucide-react';
import type { BEPConfiguration, ProjectCoordinates, ProjectDiscipline, ProjectStorey } from '@/hooks/use-bep';

interface BEPOverviewProps {
  bep: BEPConfiguration;
  coordinates: ProjectCoordinates | null;
  disciplines: ProjectDiscipline[];
  storeys: ProjectStorey[];
  onActivate?: () => void;
  isActivating?: boolean;
}

const statusColors: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  archived: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function BEPOverview({
  bep,
  coordinates,
  disciplines,
  storeys,
  onActivate,
  isActivating,
}: BEPOverviewProps) {
  const { t } = useTranslation();
  const activeDisciplines = disciplines.filter((d) => d.is_active);

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{bep.name}</h2>
          <p className="text-sm text-muted-foreground">
            {t('bep.overview.version')} {bep.version} — {bep.framework.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusColors[bep.status] || statusColors.draft}>
            {t(`bep.status.${bep.status}`)}
          </Badge>
          {bep.status === 'draft' && onActivate && (
            <Button size="sm" onClick={onActivate} disabled={isActivating}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              {t('bep.actions.activate')}
            </Button>
          )}
        </div>
      </div>

      {/* Quick reference — mirrors Skiplum BEP "Hurtigreferanse" */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('bep.overview.quickReference')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <QuickRefRow
              icon={<MapPin className="h-3.5 w-3.5" />}
              label={t('bep.coordinates.crs')}
              value={
                coordinates
                  ? `EPSG:${coordinates.horizontal_crs_epsg} (${coordinates.horizontal_crs_name})`
                  : t('bep.overview.notConfigured')
              }
            />
            <QuickRefRow
              icon={<MapPin className="h-3.5 w-3.5" />}
              label={t('bep.coordinates.origin')}
              value={
                coordinates
                  ? `E: ${coordinates.local_origin_x}, N: ${coordinates.local_origin_y}, H: ${coordinates.local_origin_z}`
                  : '—'
              }
            />
            <QuickRefRow
              icon={<Settings2 className="h-3.5 w-3.5" />}
              label={t('bep.technical.units')}
              value={
                bep.technical_requirements
                  ? `${bep.technical_requirements.length_unit === 'MILLIMETRE' ? 'mm' : 'm'} (${t('bep.technical.model')})`
                  : t('bep.overview.notConfigured')
              }
            />
            <QuickRefRow
              icon={<Settings2 className="h-3.5 w-3.5" />}
              label={t('bep.technical.ifcVersion')}
              value={bep.technical_requirements?.ifc_schema || t('bep.overview.notConfigured')}
            />
            <QuickRefRow
              icon={<Building2 className="h-3.5 w-3.5" />}
              label={t('bep.storeys.title')}
              value={
                storeys.length > 0
                  ? `${storeys.length} ${t('bep.storeys.defined')}`
                  : t('bep.overview.notConfigured')
              }
            />
            <QuickRefRow
              icon={<Users className="h-3.5 w-3.5" />}
              label={t('bep.disciplines.title')}
              value={
                activeDisciplines.length > 0
                  ? activeDisciplines.map((d) => d.discipline_code).join(', ')
                  : t('bep.overview.notConfigured')
              }
            />
            <QuickRefRow
              icon={<Layers className="h-3.5 w-3.5" />}
              label={t('bep.mmi.title')}
              value={
                bep.mmi_scale && bep.mmi_scale.length > 0
                  ? `${bep.mmi_scale.length} ${t('bep.mmi.levels')}`
                  : t('bep.overview.notConfigured')
              }
            />
            <QuickRefRow
              icon={<Archive className="h-3.5 w-3.5" />}
              label={t('bep.overview.classification')}
              value={bep.classification_system ? t(`bep.classificationSystems.${bep.classification_system}`) : t('bep.overview.notConfigured')}
            />
          </div>
        </CardContent>
      </Card>

      {bep.description && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('bep.overview.description')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{bep.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuickRefRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <span className="font-medium text-muted-foreground min-w-[120px]">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
