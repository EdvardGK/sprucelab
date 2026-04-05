import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import {
  useProjectStoreys,
  useCreateStorey,
  useUpdateStorey,
  useDeleteStorey,
} from '@/hooks/use-bep';

interface StoreyTableProps {
  projectId: string;
}

interface LocalStorey {
  id?: string;
  storey_name: string;
  storey_code: string;
  elevation_m: string;
  tolerance_m: string;
  order: number;
  isNew?: boolean;
  isDirty?: boolean;
}

export function StoreyTable({ projectId }: StoreyTableProps) {
  const { t } = useTranslation();
  const { data: storeys = [], isLoading } = useProjectStoreys(projectId);
  const createMutation = useCreateStorey();
  const updateMutation = useUpdateStorey();
  const deleteMutation = useDeleteStorey();
  const [localStoreys, setLocalStoreys] = useState<LocalStorey[] | null>(null);

  const displayStoreys: LocalStorey[] = localStoreys ?? storeys.map((s) => ({
    id: s.id,
    storey_name: s.storey_name,
    storey_code: s.storey_code,
    elevation_m: s.elevation_m,
    tolerance_m: s.tolerance_m,
    order: s.order,
  }));

  const setLocal = (updated: LocalStorey[]) => {
    setLocalStoreys(updated);
  };

  const handleUpdate = (index: number, field: keyof LocalStorey, value: string | number) => {
    const updated = [...displayStoreys];
    updated[index] = { ...updated[index], [field]: value, isDirty: true };
    setLocal(updated);
  };

  const handleAdd = () => {
    const maxOrder = displayStoreys.length > 0
      ? Math.max(...displayStoreys.map((s) => s.order))
      : -1;
    setLocal([
      ...displayStoreys,
      {
        storey_name: '',
        storey_code: '',
        elevation_m: '0',
        tolerance_m: '0.01',
        order: maxOrder + 1,
        isNew: true,
        isDirty: true,
      },
    ]);
  };

  const handleDelete = async (index: number) => {
    const storey = displayStoreys[index];
    if (storey.id) {
      deleteMutation.mutate({ id: storey.id, projectId });
    }
    const updated = displayStoreys.filter((_, i) => i !== index);
    setLocal(updated.length > 0 ? updated : null);
  };

  const handleSave = async () => {
    const dirtyStoreys = displayStoreys.filter((s) => s.isDirty);
    for (const storey of dirtyStoreys) {
      if (storey.isNew) {
        await createMutation.mutateAsync({
          project: projectId,
          storey_name: storey.storey_name,
          storey_code: storey.storey_code,
          elevation_m: storey.elevation_m,
          tolerance_m: storey.tolerance_m,
          order: storey.order,
        });
      } else if (storey.id) {
        await updateMutation.mutateAsync({
          id: storey.id,
          storey_name: storey.storey_name,
          storey_code: storey.storey_code,
          elevation_m: storey.elevation_m,
          tolerance_m: storey.tolerance_m,
          order: storey.order,
        });
      }
    }
    setLocalStoreys(null);
  };

  const hasDirty = displayStoreys.some((s) => s.isDirty);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t('bep.storeys.title')}</CardTitle>
            <Button variant="outline" size="sm" onClick={handleAdd}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t('bep.storeys.add')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {displayStoreys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('bep.storeys.empty')}
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">{t('bep.storeys.name')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('bep.storeys.code')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('bep.storeys.elevation')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('bep.storeys.tolerance')}</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayStoreys.map((storey, index) => (
                    <tr
                      key={storey.id || `new-${index}`}
                      className={`border-b last:border-0 ${storey.isDirty ? 'bg-amber-50/50' : ''}`}
                    >
                      <td className="px-3 py-1.5 text-muted-foreground">{storey.order}</td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={storey.storey_name}
                          onChange={(e) => handleUpdate(index, 'storey_name', e.target.value)}
                          className="h-8"
                          placeholder="Plan 01"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={storey.storey_code}
                          onChange={(e) => handleUpdate(index, 'storey_code', e.target.value)}
                          className="h-8 w-20"
                          placeholder="01"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          value={storey.elevation_m}
                          onChange={(e) => handleUpdate(index, 'elevation_m', e.target.value)}
                          className="h-8 w-28"
                          placeholder="m"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          step="0.001"
                          value={storey.tolerance_m}
                          onChange={(e) => handleUpdate(index, 'tolerance_m', e.target.value)}
                          className="h-8 w-24"
                          placeholder="m"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {hasDirty && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
}
