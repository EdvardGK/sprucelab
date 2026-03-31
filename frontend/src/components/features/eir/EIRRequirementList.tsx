import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  useEIRRequirements,
  useCreateRequirement,
  useUpdateRequirement,
  useDeleteRequirement,
  EIR_CATEGORIES,
  SEVERITY_LEVELS,
  SEVERITY_COLORS,
} from '@/hooks/use-eir';
import type { EIRRequirement } from '@/hooks/use-eir';

interface EIRRequirementListProps {
  eirId: string;
  readOnly?: boolean;
}

export function EIRRequirementList({ eirId, readOnly }: EIRRequirementListProps) {
  const { t } = useTranslation();
  const { data: requirements = [], isLoading } = useEIRRequirements(eirId);
  const createReq = useCreateRequirement();
  const updateReq = useUpdateRequirement();
  const deleteReq = useDeleteRequirement();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // New requirement form state
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<string>('general');
  const [newSeverity, setNewSeverity] = useState<string>('mandatory');

  const handleAdd = () => {
    if (!newCode || !newTitle) return;
    createReq.mutate(
      {
        eir: eirId,
        code: newCode,
        title: newTitle,
        description: newDescription,
        category: newCategory as EIRRequirement['category'],
        severity: newSeverity as EIRRequirement['severity'],
        order: requirements.length,
      },
      {
        onSuccess: () => {
          setNewCode('');
          setNewTitle('');
          setNewDescription('');
          setNewCategory('general');
          setNewSeverity('mandatory');
          setShowAddForm(false);
        },
      }
    );
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('eir.sections.requirements')}</h2>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('eir.requirement.add')}
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('eir.requirement.code')}</Label>
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="EIR-001"
                />
              </div>
              <div className="col-span-3 space-y-1">
                <Label className="text-xs">{t('eir.requirement.title')}</Label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('eir.requirement.description')}</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('eir.requirement.category')}</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EIR_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {t(`eir.requirement.categories.${cat}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('eir.requirement.severity')}</Label>
                <Select value={newSeverity} onValueChange={setNewSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_LEVELS.map((sev) => (
                      <SelectItem key={sev} value={sev}>
                        {t(`eir.requirement.severities.${sev}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={createReq.isPending || !newCode || !newTitle}>
                {t('bep.actions.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Requirements list */}
      {requirements.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('eir.overview.noRequirements')}</p>
      ) : (
        <div className="space-y-1">
          {requirements.map((req) => (
            <RequirementRow
              key={req.id}
              requirement={req}
              expanded={expandedId === req.id}
              onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
              readOnly={readOnly}
              onUpdate={(data) => updateReq.mutate({ id: req.id, ...data })}
              onDelete={() => deleteReq.mutate({ id: req.id, eirId })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequirementRow({
  requirement: req,
  expanded,
  onToggle,
  readOnly,
  onUpdate,
  onDelete,
}: {
  requirement: EIRRequirement;
  expanded: boolean;
  onToggle: () => void;
  readOnly?: boolean;
  onUpdate: (_data: Partial<EIRRequirement>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-mono text-xs text-muted-foreground w-20">{req.code}</span>
        <span className="text-sm flex-1">{req.title}</span>
        <Badge variant="outline" className="text-xs">
          {t(`eir.requirement.categories.${req.category}`)}
        </Badge>
        <Badge className={`text-xs ${SEVERITY_COLORS[req.severity] || ''}`}>
          {t(`eir.requirement.severities.${req.severity}`)}
        </Badge>
      </div>
      {expanded && (
        <CardContent className="pt-0 pb-3 px-4 ml-7 space-y-2">
          {req.description && (
            <p className="text-sm text-muted-foreground">{req.description}</p>
          )}
          {req.instructions && (
            <p className="text-xs text-muted-foreground italic">{req.instructions}</p>
          )}
          {req.ids_specification_detail && (
            <div className="text-xs text-blue-600">
              IDS: {req.ids_specification_detail.title}
            </div>
          )}
          {!readOnly && (
            <div className="pt-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t('common.delete')}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
