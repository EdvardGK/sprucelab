import { useState, useMemo } from 'react';
import {
  Card,
  Title,
  Text,
  Grid,
  Flex,
  Badge,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  TextInput,
  NumberInput,
} from '@tremor/react';
import { Plus, Trash2, Download, RefreshCw, Save, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectBEP, useBEPTemplates, type MMIScaleDefinition } from '@/hooks/use-bep';

interface MMITableMakerProps {
  projectId: string;
}

// Standard Norwegian MMI-veileder 2.0 template (19 levels: 0-600)
const MMI_VEILEDER_TEMPLATE: Omit<MMIScaleDefinition, 'id'>[] = [
  { mmi_level: 0, name: 'Ikke definert', name_en: 'Not defined', description: 'Ingen krav til modellinnhold', color_hex: '#CCCCCC', color_rgb: '204,204,204', geometry_requirements: {}, information_requirements: {}, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 0 },
  { mmi_level: 100, name: 'MMI 100', name_en: 'MMI 100', description: 'Skissefase - Symbolsk/skjematisk', color_hex: '#BE2823', color_rgb: '190,40,35', geometry_requirements: { detail_level: 'symbolic' }, information_requirements: { requires_name: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 1 },
  { mmi_level: 125, name: 'MMI 125', name_en: 'MMI 125', description: 'Utvidet skisse', color_hex: '#D44C3F', color_rgb: '212,76,63', geometry_requirements: { detail_level: 'symbolic' }, information_requirements: { requires_name: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 2 },
  { mmi_level: 150, name: 'MMI 150', name_en: 'MMI 150', description: 'Prinsipp', color_hex: '#E07050', color_rgb: '224,112,80', geometry_requirements: { detail_level: 'approximate' }, information_requirements: { requires_name: true, requires_description: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 3 },
  { mmi_level: 175, name: 'MMI 175', name_en: 'MMI 175', description: 'Utvidet prinsipp', color_hex: '#E88D4E', color_rgb: '232,141,78', geometry_requirements: { detail_level: 'approximate' }, information_requirements: { requires_name: true, requires_description: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 4 },
  { mmi_level: 200, name: 'MMI 200', name_en: 'MMI 200', description: 'Forprosjekt', color_hex: '#ED9D3D', color_rgb: '237,157,61', geometry_requirements: { detail_level: 'approximate' }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 5 },
  { mmi_level: 225, name: 'MMI 225', name_en: 'MMI 225', description: 'Utvidet forprosjekt', color_hex: '#F5B843', color_rgb: '245,184,67', geometry_requirements: { detail_level: 'approximate' }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 6 },
  { mmi_level: 250, name: 'MMI 250', name_en: 'MMI 250', description: 'Systemvalg', color_hex: '#F9D048', color_rgb: '249,208,72', geometry_requirements: { detail_level: 'approximate' }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 7 },
  { mmi_level: 275, name: 'MMI 275', name_en: 'MMI 275', description: 'Utvidet systemvalg', color_hex: '#FCDE4C', color_rgb: '252,222,76', geometry_requirements: { detail_level: 'detailed' }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 8 },
  { mmi_level: 300, name: 'MMI 300', name_en: 'MMI 300', description: 'Detaljprosjekt', color_hex: '#FCE74E', color_rgb: '252,231,78', geometry_requirements: { detail_level: 'detailed' }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, min_property_count: 5 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 9 },
  { mmi_level: 325, name: 'MMI 325', name_en: 'MMI 325', description: 'Utvidet detaljprosjekt', color_hex: '#D6E04E', color_rgb: '214,224,78', geometry_requirements: { detail_level: 'detailed' }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, min_property_count: 8 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 10 },
  { mmi_level: 350, name: 'MMI 350', name_en: 'MMI 350', description: 'Arbeidstegning', color_hex: '#B0D34E', color_rgb: '176,211,78', geometry_requirements: { detail_level: 'detailed', requires_3d: true }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, min_property_count: 10 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 11 },
  { mmi_level: 375, name: 'MMI 375', name_en: 'MMI 375', description: 'Utvidet arbeidstegning', color_hex: '#8DC94C', color_rgb: '141,201,76', geometry_requirements: { detail_level: 'detailed', requires_3d: true }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, requires_system_membership: true, min_property_count: 12 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 12 },
  { mmi_level: 400, name: 'MMI 400', name_en: 'MMI 400', description: 'Produksjon', color_hex: '#5DB94B', color_rgb: '93,185,75', geometry_requirements: { detail_level: 'detailed', requires_3d: true, collision_ready: true }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, requires_system_membership: true, min_property_count: 15 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 13 },
  { mmi_level: 425, name: 'MMI 425', name_en: 'MMI 425', description: 'Utvidet produksjon', color_hex: '#40A048', color_rgb: '64,160,72', geometry_requirements: { detail_level: 'detailed', requires_3d: true, collision_ready: true }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, requires_system_membership: true, min_property_count: 18 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 14 },
  { mmi_level: 450, name: 'MMI 450', name_en: 'MMI 450', description: 'Montasje', color_hex: '#2C8846', color_rgb: '44,136,70', geometry_requirements: { detail_level: 'as_built', requires_3d: true, collision_ready: true }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, requires_system_membership: true, min_property_count: 20 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 15 },
  { mmi_level: 475, name: 'MMI 475', name_en: 'MMI 475', description: 'Utvidet montasje', color_hex: '#1A7044', color_rgb: '26,112,68', geometry_requirements: { detail_level: 'as_built', requires_3d: true, collision_ready: true }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, requires_system_membership: true, min_property_count: 22 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 16 },
  { mmi_level: 500, name: 'MMI 500', name_en: 'MMI 500', description: 'Som bygget', color_hex: '#0A5842', color_rgb: '10,88,66', geometry_requirements: { detail_level: 'as_built', requires_3d: true, collision_ready: true }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, requires_system_membership: true, min_property_count: 25 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 17 },
  { mmi_level: 600, name: 'MMI 600', name_en: 'MMI 600', description: 'Forvaltning/drift', color_hex: '#004C41', color_rgb: '0,76,65', geometry_requirements: { detail_level: 'as_built', requires_3d: true }, information_requirements: { requires_name: true, requires_description: true, requires_classification: true, requires_material: true, requires_system_membership: true, min_property_count: 30 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 18 },
];

// Simplified template (6 levels)
const SIMPLIFIED_TEMPLATE: Omit<MMIScaleDefinition, 'id'>[] = [
  { mmi_level: 0, name: 'Ikke definert', name_en: 'Not defined', description: 'Ingen krav', color_hex: '#CCCCCC', color_rgb: '204,204,204', geometry_requirements: {}, information_requirements: {}, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 0 },
  { mmi_level: 100, name: 'Konsept', name_en: 'Concept', description: 'Skissefase', color_hex: '#BE2823', color_rgb: '190,40,35', geometry_requirements: { detail_level: 'symbolic' }, information_requirements: { requires_name: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 1 },
  { mmi_level: 200, name: 'Forprosjekt', name_en: 'Preliminary', description: 'Forprosjekt', color_hex: '#ED9D3D', color_rgb: '237,157,61', geometry_requirements: { detail_level: 'approximate' }, information_requirements: { requires_name: true, requires_classification: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 2 },
  { mmi_level: 300, name: 'Detaljprosjekt', name_en: 'Detailed', description: 'Detaljert design', color_hex: '#FCE74E', color_rgb: '252,231,78', geometry_requirements: { detail_level: 'detailed' }, information_requirements: { requires_name: true, requires_classification: true, requires_material: true }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 3 },
  { mmi_level: 400, name: 'Produksjon', name_en: 'Production', description: 'Produksjonsklart', color_hex: '#5DB94B', color_rgb: '93,185,75', geometry_requirements: { detail_level: 'detailed', collision_ready: true }, information_requirements: { requires_name: true, requires_classification: true, requires_material: true, min_property_count: 15 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 4 },
  { mmi_level: 500, name: 'Som bygget', name_en: 'As-built', description: 'Som bygget', color_hex: '#004C41', color_rgb: '0,76,65', geometry_requirements: { detail_level: 'as_built' }, information_requirements: { requires_name: true, requires_classification: true, requires_material: true, min_property_count: 25 }, discipline_specific_rules: {}, applies_to_disciplines: [], display_order: 5 },
];

type TemplateType = 'mmi-veileder' | 'simplified' | 'custom';

export function MMITableMaker({ projectId }: MMITableMakerProps) {
  const { data: activeBEP, isLoading: bepLoading } = useProjectBEP(projectId);
  const { data: _templates } = useBEPTemplates(); // TODO: Use templates for template selector

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('mmi-veileder');
  const [mmiLevels, setMmiLevels] = useState<Omit<MMIScaleDefinition, 'id'>[]>(MMI_VEILEDER_TEMPLATE);
  const [hasChanges, setHasChanges] = useState(false);

  // Load from active BEP if available
  useMemo(() => {
    if (activeBEP?.mmi_scale && activeBEP.mmi_scale.length > 0) {
      setMmiLevels(activeBEP.mmi_scale);
      setSelectedTemplate('custom');
    }
  }, [activeBEP]);

  const handleLoadTemplate = (template: TemplateType) => {
    setSelectedTemplate(template);
    switch (template) {
      case 'mmi-veileder':
        setMmiLevels(MMI_VEILEDER_TEMPLATE);
        break;
      case 'simplified':
        setMmiLevels(SIMPLIFIED_TEMPLATE);
        break;
      case 'custom':
        setMmiLevels([]);
        break;
    }
    setHasChanges(true);
  };

  const handleUpdateLevel = (index: number, field: keyof Omit<MMIScaleDefinition, 'id'>, value: any) => {
    const updated = [...mmiLevels];
    updated[index] = { ...updated[index], [field]: value };
    setMmiLevels(updated);
    setHasChanges(true);
  };

  const handleAddLevel = () => {
    const maxLevel = Math.max(...mmiLevels.map((l) => l.mmi_level), 0);
    const newLevel: Omit<MMIScaleDefinition, 'id'> = {
      mmi_level: maxLevel + 100,
      name: `MMI ${maxLevel + 100}`,
      name_en: `MMI ${maxLevel + 100}`,
      description: '',
      color_hex: '#808080',
      color_rgb: '128,128,128',
      geometry_requirements: {},
      information_requirements: {},
      discipline_specific_rules: {},
      applies_to_disciplines: [],
      display_order: mmiLevels.length,
    };
    setMmiLevels([...mmiLevels, newLevel]);
    setHasChanges(true);
  };

  const handleRemoveLevel = (index: number) => {
    const updated = mmiLevels.filter((_, i) => i !== index);
    setMmiLevels(updated);
    setHasChanges(true);
  };

  const handleSave = async () => {
    // TODO: Implement save to BEP API
    console.log('Saving MMI scale:', mmiLevels);
    alert('Save functionality coming soon! Check console for data.');
  };

  const handleExport = () => {
    const exportData = {
      template: selectedTemplate,
      levels: mmiLevels,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mmi-scale-${projectId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (bepLoading) {
    return (
      <Card className="p-6">
        <Flex justifyContent="center" className="py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          <Text className="ml-2">Loading BEP configuration...</Text>
        </Flex>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <Flex justifyContent="between" alignItems="start">
          <div>
            <Title>MMI Table Maker</Title>
            <Text className="mt-1">
              Configure Model Maturity Index levels for your project
            </Text>
            {activeBEP && (
              <Badge color="emerald" className="mt-2">
                Active BEP: {activeBEP.name} (v{activeBEP.version})
              </Badge>
            )}
          </div>
          <Flex className="gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges}
              className={hasChanges ? 'bg-primary' : ''}
            >
              <Save className="mr-2 h-4 w-4" />
              Save to BEP
            </Button>
          </Flex>
        </Flex>
      </Card>

      {/* Template Selection */}
      <Card>
        <Title>Template</Title>
        <Text className="mb-4">Start from a standard template or create custom levels</Text>
        <Grid numItemsMd={3} className="gap-4">
          <button
            onClick={() => handleLoadTemplate('mmi-veileder')}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              selectedTemplate === 'mmi-veileder'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Text className="font-semibold">MMI-veileder 2.0</Text>
            <Text className="text-xs text-gray-400 mt-1">
              Official Norwegian standard (19 levels: 0-600)
            </Text>
            <Badge color="blue" className="mt-2">
              Recommended
            </Badge>
          </button>

          <button
            onClick={() => handleLoadTemplate('simplified')}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              selectedTemplate === 'simplified'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Text className="font-semibold">Simplified</Text>
            <Text className="text-xs text-gray-400 mt-1">
              Basic scale (6 levels: 0, 100, 200, 300, 400, 500)
            </Text>
          </button>

          <button
            onClick={() => handleLoadTemplate('custom')}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              selectedTemplate === 'custom'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <Text className="font-semibold">Custom</Text>
            <Text className="text-xs text-gray-400 mt-1">
              Start from scratch and define your own levels
            </Text>
          </button>
        </Grid>
      </Card>

      {/* MMI Levels Table */}
      <Card>
        <Flex justifyContent="between" alignItems="center" className="mb-4">
          <div>
            <Title>MMI Levels ({mmiLevels.length})</Title>
            <Text>Edit level details, descriptions, and colors</Text>
          </div>
          <Button variant="outline" size="sm" onClick={handleAddLevel}>
            <Plus className="mr-2 h-4 w-4" />
            Add Level
          </Button>
        </Flex>

        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-20">Level</TableHeaderCell>
              <TableHeaderCell className="w-16">Color</TableHeaderCell>
              <TableHeaderCell>Name (NO)</TableHeaderCell>
              <TableHeaderCell>Name (EN)</TableHeaderCell>
              <TableHeaderCell>Description</TableHeaderCell>
              <TableHeaderCell className="w-20">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mmiLevels.map((level, index) => (
              <TableRow key={index}>
                <TableCell>
                  <NumberInput
                    value={level.mmi_level}
                    onValueChange={(val) => handleUpdateLevel(index, 'mmi_level', val)}
                    className="w-20"
                    min={0}
                    max={2000}
                    step={25}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={level.color_hex}
                      onChange={(e) => handleUpdateLevel(index, 'color_hex', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-border"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <TextInput
                    value={level.name}
                    onChange={(e) => handleUpdateLevel(index, 'name', e.target.value)}
                    className="w-full"
                  />
                </TableCell>
                <TableCell>
                  <TextInput
                    value={level.name_en}
                    onChange={(e) => handleUpdateLevel(index, 'name_en', e.target.value)}
                    className="w-full"
                  />
                </TableCell>
                <TableCell>
                  <TextInput
                    value={level.description}
                    onChange={(e) => handleUpdateLevel(index, 'description', e.target.value)}
                    className="w-full"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-error/10 hover:text-error"
                    onClick={() => handleRemoveLevel(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {mmiLevels.length === 0 && (
          <div className="text-center py-12">
            <Palette className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <Text className="text-gray-400">No MMI levels defined</Text>
            <Text className="text-xs text-gray-500 mt-1">
              Click "Add Level" to create custom levels
            </Text>
          </div>
        )}
      </Card>

      {/* Preview */}
      <Card>
        <Title>Color Scale Preview</Title>
        <Text className="mb-4">Visual representation of your MMI scale</Text>
        <div className="flex gap-1 h-8 rounded overflow-hidden">
          {mmiLevels.map((level, index) => (
            <div
              key={index}
              className="flex-1 flex items-center justify-center text-xs font-medium"
              style={{ backgroundColor: level.color_hex }}
              title={`MMI ${level.mmi_level}: ${level.name}`}
            >
              {level.mmi_level}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>Low maturity</span>
          <span>High maturity</span>
        </div>
      </Card>
    </div>
  );
}
