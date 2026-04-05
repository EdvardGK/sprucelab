import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2 } from 'lucide-react';
import { useProjectCoordinates, useSaveCoordinates } from '@/hooks/use-bep';

interface CoordinateSystemFormProps {
  projectId: string;
}

const VERTICAL_CRS_OPTIONS = [
  { value: 'NN2000', label: 'NN2000' },
  { value: 'NN1954', label: 'NN1954' },
  { value: 'EVRF2007', label: 'EVRF2007' },
  { value: 'EGM96', label: 'EGM96' },
  { value: 'EGM2008', label: 'EGM2008' },
];

const COMMON_CRS = [
  { epsg: 5105, name: 'ETRS89/NTM sone 5 + NN2000' },
  { epsg: 5106, name: 'ETRS89/NTM sone 6 + NN2000' },
  { epsg: 5107, name: 'ETRS89/NTM sone 7 + NN2000' },
  { epsg: 5108, name: 'ETRS89/NTM sone 8 + NN2000' },
  { epsg: 5109, name: 'ETRS89/NTM sone 9 + NN2000' },
  { epsg: 5110, name: 'ETRS89/NTM sone 10 + NN2000' },
  { epsg: 5111, name: 'ETRS89/NTM sone 11 + NN2000' },
  { epsg: 5112, name: 'ETRS89/NTM sone 12 + NN2000' },
  { epsg: 5113, name: 'ETRS89/NTM sone 13 + NN2000' },
  { epsg: 5114, name: 'ETRS89/NTM sone 14 + NN2000' },
  { epsg: 25832, name: 'ETRS89/UTM sone 32N' },
  { epsg: 25833, name: 'ETRS89/UTM sone 33N' },
  { epsg: 25835, name: 'ETRS89/UTM sone 35N' },
];

type FormData = {
  horizontal_crs_epsg: number;
  horizontal_crs_name: string;
  vertical_crs: string;
  local_origin_x: string;
  local_origin_y: string;
  local_origin_z: string;
  eastings: string;
  northings: string;
  orthometric_height: string;
  true_north_rotation: string;
  position_tolerance_m: string;
  rotation_tolerance_deg: string;
};

const DEFAULT_FORM: FormData = {
  horizontal_crs_epsg: 5110,
  horizontal_crs_name: 'ETRS89/NTM sone 10 + NN2000',
  vertical_crs: 'NN2000',
  local_origin_x: '0',
  local_origin_y: '0',
  local_origin_z: '0',
  eastings: '',
  northings: '',
  orthometric_height: '',
  true_north_rotation: '0',
  position_tolerance_m: '0.1',
  rotation_tolerance_deg: '0.1',
};

export function CoordinateSystemForm({ projectId }: CoordinateSystemFormProps) {
  const { t } = useTranslation();
  const { data: existing, isLoading } = useProjectCoordinates(projectId);
  const saveMutation = useSaveCoordinates();
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        horizontal_crs_epsg: existing.horizontal_crs_epsg,
        horizontal_crs_name: existing.horizontal_crs_name,
        vertical_crs: existing.vertical_crs,
        local_origin_x: existing.local_origin_x,
        local_origin_y: existing.local_origin_y,
        local_origin_z: existing.local_origin_z,
        eastings: existing.eastings || '',
        northings: existing.northings || '',
        orthometric_height: existing.orthometric_height || '',
        true_north_rotation: existing.true_north_rotation,
        position_tolerance_m: existing.position_tolerance_m,
        rotation_tolerance_deg: existing.rotation_tolerance_deg,
      });
      setHasChanges(false);
    }
  }, [existing]);

  const updateField = (field: keyof FormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleCRSSelect = (epsgStr: string) => {
    const epsg = parseInt(epsgStr, 10);
    const crs = COMMON_CRS.find((c) => c.epsg === epsg);
    setForm((prev) => ({
      ...prev,
      horizontal_crs_epsg: epsg,
      horizontal_crs_name: crs?.name || prev.horizontal_crs_name,
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate({
      ...(existing?.id ? { id: existing.id } : {}),
      project: projectId,
      ...form,
      eastings: form.eastings || null,
      northings: form.northings || null,
      orthometric_height: form.orthometric_height || null,
    } as any, {
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
      {/* CRS Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('bep.coordinates.crsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('bep.coordinates.epsg')}</Label>
              <Select
                value={String(form.horizontal_crs_epsg)}
                onValueChange={handleCRSSelect}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_CRS.map((crs) => (
                    <SelectItem key={crs.epsg} value={String(crs.epsg)}>
                      EPSG:{crs.epsg} — {crs.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('bep.coordinates.verticalCrs')}</Label>
              <Select
                value={form.vertical_crs}
                onValueChange={(v) => updateField('vertical_crs', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERTICAL_CRS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('bep.coordinates.crsName')}</Label>
            <Input
              value={form.horizontal_crs_name}
              onChange={(e) => updateField('horizontal_crs_name', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Local Origin (Project Basepoint) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('bep.coordinates.localOrigin')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>X (E)</Label>
              <Input
                type="number"
                step="0.001"
                value={form.local_origin_x}
                onChange={(e) => updateField('local_origin_x', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Y (N)</Label>
              <Input
                type="number"
                step="0.001"
                value={form.local_origin_y}
                onChange={(e) => updateField('local_origin_y', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Z (H)</Label>
              <Input
                type="number"
                step="0.001"
                value={form.local_origin_z}
                onChange={(e) => updateField('local_origin_z', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global Position */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('bep.coordinates.globalPosition')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('bep.coordinates.eastings')}</Label>
              <Input
                type="number"
                step="0.001"
                value={form.eastings}
                onChange={(e) => updateField('eastings', e.target.value)}
                placeholder="m"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('bep.coordinates.northings')}</Label>
              <Input
                type="number"
                step="0.001"
                value={form.northings}
                onChange={(e) => updateField('northings', e.target.value)}
                placeholder="m"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('bep.coordinates.height')}</Label>
              <Input
                type="number"
                step="0.001"
                value={form.orthometric_height}
                onChange={(e) => updateField('orthometric_height', e.target.value)}
                placeholder="m"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('bep.coordinates.rotation')}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.true_north_rotation}
                onChange={(e) => updateField('true_north_rotation', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('bep.coordinates.positionTolerance')}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.position_tolerance_m}
                onChange={(e) => updateField('position_tolerance_m', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('bep.coordinates.rotationTolerance')}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.rotation_tolerance_deg}
                onChange={(e) => updateField('rotation_tolerance_deg', e.target.value)}
              />
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
