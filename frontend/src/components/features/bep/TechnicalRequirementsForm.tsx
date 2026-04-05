import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2 } from 'lucide-react';
import { useTechnicalRequirement, useSaveTechnicalRequirement } from '@/hooks/use-bep';

interface TechnicalRequirementsFormProps {
  bepId: string;
}

type FormData = {
  ifc_schema: 'IFC2X3' | 'IFC4' | 'IFC4X3';
  model_view_definition: string;
  coordinate_system_name: string;
  coordinate_system_description: string;
  length_unit: 'METRE' | 'MILLIMETRE';
  area_unit: string;
  volume_unit: string;
  geometry_tolerance: number;
  max_file_size_mb: number;
};

const DEFAULT_FORM: FormData = {
  ifc_schema: 'IFC4',
  model_view_definition: '',
  coordinate_system_name: 'EPSG:5110',
  coordinate_system_description: '',
  length_unit: 'MILLIMETRE',
  area_unit: 'SQUARE_METRE',
  volume_unit: 'CUBIC_METRE',
  geometry_tolerance: 0.001,
  max_file_size_mb: 500,
};

export function TechnicalRequirementsForm({ bepId }: TechnicalRequirementsFormProps) {
  const { t } = useTranslation();
  const { data: existing, isLoading } = useTechnicalRequirement(bepId);
  const saveMutation = useSaveTechnicalRequirement();
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        ifc_schema: existing.ifc_schema,
        model_view_definition: existing.model_view_definition,
        coordinate_system_name: existing.coordinate_system_name,
        coordinate_system_description: existing.coordinate_system_description,
        length_unit: existing.length_unit,
        area_unit: existing.area_unit,
        volume_unit: existing.volume_unit,
        geometry_tolerance: existing.geometry_tolerance,
        max_file_size_mb: existing.max_file_size_mb,
      });
      setHasChanges(false);
    }
  }, [existing]);

  const updateField = (field: keyof FormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate({
      ...(existing?.id ? { id: existing.id } : {}),
      bep: bepId,
      ...form,
    } as Partial<import('@/hooks/use-bep').TechnicalRequirement> & { bep: string }, {
      onSuccess: () => setHasChanges(false),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* IFC Schema */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('bep.technical.ifcSettings')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('bep.technical.ifcVersion')}</Label>
              <Select
                value={form.ifc_schema}
                onValueChange={(v) => updateField('ifc_schema', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IFC2X3">IFC 2x3</SelectItem>
                  <SelectItem value="IFC4">IFC4</SelectItem>
                  <SelectItem value="IFC4X3">IFC 4x3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('bep.technical.mvd')}</Label>
              <Input
                value={form.model_view_definition}
                onChange={(e) => updateField('model_view_definition', e.target.value)}
                placeholder="ReferenceView, DesignTransferView"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Units */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('bep.technical.units')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('bep.technical.lengthUnit')}</Label>
              <Select
                value={form.length_unit}
                onValueChange={(v) => updateField('length_unit', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MILLIMETRE">mm</SelectItem>
                  <SelectItem value="METRE">m</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('bep.technical.areaUnit')}</Label>
              <Select
                value={form.area_unit}
                onValueChange={(v) => updateField('area_unit', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SQUARE_METRE">m²</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('bep.technical.volumeUnit')}</Label>
              <Select
                value={form.volume_unit}
                onValueChange={(v) => updateField('volume_unit', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUBIC_METRE">m³</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tolerances & Limits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('bep.technical.limits')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('bep.technical.geometryTolerance')}</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.geometry_tolerance}
                onChange={(e) => updateField('geometry_tolerance', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('bep.technical.maxFileSize')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={form.max_file_size_mb}
                  onChange={(e) => updateField('max_file_size_mb', parseInt(e.target.value) || 0)}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">MB</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
