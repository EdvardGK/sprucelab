import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  MapPin,
  Building2,
  Users,
  Settings2,
  Layers,
  LayoutDashboard,
  Plus,
  Loader2,
} from 'lucide-react';
import {
  useProjectBEP,
  useCreateBEP,
  useActivateBEP,
  useProjectCoordinates,
  useProjectDisciplines,
  useProjectStoreys,
} from '@/hooks/use-bep';
import { BEPOverview } from '@/components/features/bep/BEPOverview';
import { CoordinateSystemForm } from '@/components/features/bep/CoordinateSystemForm';
import { StoreyTable } from '@/components/features/bep/StoreyTable';
import { DisciplineTable } from '@/components/features/bep/DisciplineTable';
import { TechnicalRequirementsForm } from '@/components/features/bep/TechnicalRequirementsForm';
import { MMITableMaker } from '@/components/features/bep/MMITableMaker';

type Section = 'overview' | 'coordinates' | 'storeys' | 'disciplines' | 'technical' | 'mmi';

const SECTIONS: { id: Section; icon: React.ElementType; labelKey: string }[] = [
  { id: 'overview', icon: LayoutDashboard, labelKey: 'bep.sections.overview' },
  { id: 'coordinates', icon: MapPin, labelKey: 'bep.sections.coordinates' },
  { id: 'storeys', icon: Building2, labelKey: 'bep.sections.storeys' },
  { id: 'disciplines', icon: Users, labelKey: 'bep.sections.disciplines' },
  { id: 'technical', icon: Settings2, labelKey: 'bep.sections.technical' },
  { id: 'mmi', icon: Layers, labelKey: 'bep.sections.mmi' },
];

export default function ProjectBEP() {
  const { id: projectId } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<Section>('overview');

  const { data: bep, isLoading: bepLoading } = useProjectBEP(projectId!);
  const { data: coordinates } = useProjectCoordinates(projectId!);
  const { data: disciplines = [] } = useProjectDisciplines(projectId!);
  const { data: storeys = [] } = useProjectStoreys(projectId!);
  const createBEP = useCreateBEP();
  const activateBEP = useActivateBEP();

  const handleCreateBEP = () => {
    createBEP.mutate(
      {
        project: projectId!,
        name: 'BIM-gjennomføringsplan',
        framework: 'pofin',
        description: '',
      },
      {
        onSuccess: (newBep) => {
          activateBEP.mutate(newBep.id);
        },
      }
    );
  };

  if (bepLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // No BEP yet — show creation prompt
  if (!bep) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>{t('bep.create.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('bep.create.description')}
              </p>
              <Button
                onClick={handleCreateBEP}
                disabled={createBEP.isPending}
                className="w-full"
              >
                {createBEP.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                {t('bep.create.button')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Section sidebar */}
        <div className="w-52 border-r border-border/50 bg-muted/30 p-2 flex flex-col">
          <div className="px-3 py-2 mb-2">
            <h1 className="text-sm font-semibold">{t('bep.title')}</h1>
          </div>
          <nav className="space-y-0.5">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                    activeSection === section.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(section.labelKey)}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl">
            {activeSection === 'overview' && (
              <BEPOverview
                bep={bep}
                coordinates={coordinates ?? null}
                disciplines={disciplines}
                storeys={storeys}
                onActivate={
                  bep.status === 'draft'
                    ? () => activateBEP.mutate(bep.id)
                    : undefined
                }
                isActivating={activateBEP.isPending}
              />
            )}
            {activeSection === 'coordinates' && (
              <CoordinateSystemForm projectId={projectId!} />
            )}
            {activeSection === 'storeys' && (
              <StoreyTable projectId={projectId!} />
            )}
            {activeSection === 'disciplines' && (
              <DisciplineTable projectId={projectId!} />
            )}
            {activeSection === 'technical' && (
              <TechnicalRequirementsForm bepId={bep.id} />
            )}
            {activeSection === 'mmi' && (
              <MMITableMaker projectId={projectId!} />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
