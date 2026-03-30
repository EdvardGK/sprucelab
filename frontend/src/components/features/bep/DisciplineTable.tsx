import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import {
  useProjectDisciplines,
  useCreateDiscipline,
  useUpdateDiscipline,
  useDeleteDiscipline,
  STANDARD_DISCIPLINES,
  type ProjectDiscipline,
} from '@/hooks/use-bep';

interface DisciplineTableProps {
  projectId: string;
}

interface LocalDiscipline {
  id?: string;
  discipline_code: string;
  discipline_name: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  software: string;
  is_active: boolean;
  isNew?: boolean;
  isDirty?: boolean;
}

export function DisciplineTable({ projectId }: DisciplineTableProps) {
  const { t } = useTranslation();
  const { data: disciplines = [], isLoading } = useProjectDisciplines(projectId);
  const createMutation = useCreateDiscipline();
  const updateMutation = useUpdateDiscipline();
  const deleteMutation = useDeleteDiscipline();
  const [localDisciplines, setLocalDisciplines] = useState<LocalDiscipline[] | null>(null);

  const displayDisciplines: LocalDiscipline[] = localDisciplines ?? disciplines.map((d) => ({
    id: d.id,
    discipline_code: d.discipline_code,
    discipline_name: d.discipline_name,
    company_name: d.company_name,
    contact_name: d.contact_name,
    contact_email: d.contact_email,
    software: d.software,
    is_active: d.is_active,
  }));

  const setLocal = (updated: LocalDiscipline[]) => {
    setLocalDisciplines(updated);
  };

  const handleUpdate = (index: number, field: keyof LocalDiscipline, value: string | boolean) => {
    const updated = [...displayDisciplines];
    updated[index] = { ...updated[index], [field]: value, isDirty: true };
    setLocal(updated);
  };

  const handleCodeSelect = (index: number, code: string) => {
    const std = STANDARD_DISCIPLINES.find((d) => d.code === code);
    const updated = [...displayDisciplines];
    updated[index] = {
      ...updated[index],
      discipline_code: code,
      discipline_name: std?.name || updated[index].discipline_name,
      isDirty: true,
    };
    setLocal(updated);
  };

  const handleAdd = () => {
    // Find first unused standard discipline code
    const usedCodes = new Set(displayDisciplines.map((d) => d.discipline_code));
    const available = STANDARD_DISCIPLINES.find((d) => !usedCodes.has(d.code));

    setLocal([
      ...displayDisciplines,
      {
        discipline_code: available?.code || '',
        discipline_name: available?.name || '',
        company_name: '',
        contact_name: '',
        contact_email: '',
        software: '',
        is_active: true,
        isNew: true,
        isDirty: true,
      },
    ]);
  };

  const handleDelete = async (index: number) => {
    const discipline = displayDisciplines[index];
    if (discipline.id) {
      deleteMutation.mutate({ id: discipline.id, projectId });
    }
    const updated = displayDisciplines.filter((_, i) => i !== index);
    setLocal(updated.length > 0 ? updated : null);
  };

  const handleSave = async () => {
    const dirtyItems = displayDisciplines.filter((d) => d.isDirty);
    for (const item of dirtyItems) {
      if (item.isNew) {
        await createMutation.mutateAsync({
          project: projectId,
          discipline_code: item.discipline_code,
          discipline_name: item.discipline_name,
          company_name: item.company_name,
          contact_name: item.contact_name,
          contact_email: item.contact_email,
          software: item.software,
          is_active: item.is_active,
        });
      } else if (item.id) {
        await updateMutation.mutateAsync({
          id: item.id,
          discipline_code: item.discipline_code,
          discipline_name: item.discipline_name,
          company_name: item.company_name,
          contact_name: item.contact_name,
          contact_email: item.contact_email,
          software: item.software,
          is_active: item.is_active,
        });
      }
    }
    setLocalDisciplines(null);
  };

  const hasDirty = displayDisciplines.some((d) => d.isDirty);
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
            <CardTitle className="text-base">{t('bep.disciplines.title')}</CardTitle>
            <Button variant="outline" size="sm" onClick={handleAdd}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t('bep.disciplines.add')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {displayDisciplines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('bep.disciplines.empty')}
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium w-28">{t('bep.disciplines.code')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('bep.disciplines.name')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('bep.disciplines.company')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('bep.disciplines.contact')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('bep.disciplines.software')}</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayDisciplines.map((disc, index) => (
                    <tr
                      key={disc.id || `new-${index}`}
                      className={`border-b last:border-0 ${disc.isDirty ? 'bg-amber-50/50' : ''} ${!disc.is_active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-3 py-1.5">
                        <Select
                          value={disc.discipline_code}
                          onValueChange={(v) => handleCodeSelect(index, v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder={t('bep.disciplines.selectCode')} />
                          </SelectTrigger>
                          <SelectContent>
                            {STANDARD_DISCIPLINES.map((std) => (
                              <SelectItem key={std.code} value={std.code}>
                                {std.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={disc.discipline_name}
                          onChange={(e) => handleUpdate(index, 'discipline_name', e.target.value)}
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={disc.company_name}
                          onChange={(e) => handleUpdate(index, 'company_name', e.target.value)}
                          className="h-8"
                          placeholder={t('bep.disciplines.companyPlaceholder')}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={disc.contact_name}
                          onChange={(e) => handleUpdate(index, 'contact_name', e.target.value)}
                          className="h-8"
                          placeholder="FMA"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={disc.software}
                          onChange={(e) => handleUpdate(index, 'software', e.target.value)}
                          className="h-8"
                          placeholder="Revit, Archicad..."
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
