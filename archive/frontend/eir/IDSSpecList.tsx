import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, FileCode } from 'lucide-react';
import {
  useIDSSpecifications,
  useCreateIDS,
  useDeleteIDS,
} from '@/hooks/use-eir';

interface IDSSpecListProps {
  eirId: string;
  readOnly?: boolean;
}

const sourceColors: Record<string, string> = {
  imported: 'bg-blue-100 text-blue-800',
  authored: 'bg-purple-100 text-purple-800',
  library: 'bg-emerald-100 text-emerald-800',
};

export function IDSSpecList({ eirId, readOnly }: IDSSpecListProps) {
  const { t } = useTranslation();
  const { data: specs = [], isLoading } = useIDSSpecifications({ eir: eirId });
  const createIDS = useCreateIDS();
  const deleteIDS = useDeleteIDS();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const handleAdd = () => {
    if (!newTitle) return;
    createIDS.mutate(
      {
        title: newTitle,
        description: newDescription,
        eir: eirId,
        source: 'authored',
        structured_specs: [],
      },
      {
        onSuccess: () => {
          setNewTitle('');
          setNewDescription('');
          setShowAddForm(false);
        },
      }
    );
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('eir.ids.title')}</h2>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('eir.ids.add')}
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('eir.requirement.title')}</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('eir.requirement.description')}</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={createIDS.isPending || !newTitle}>
                {t('bep.actions.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {specs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('eir.ids.noSpecs')}</p>
      ) : (
        <div className="space-y-2">
          {specs.map((spec) => (
            <Card key={spec.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{spec.title}</p>
                    {spec.description && (
                      <p className="text-xs text-muted-foreground">{spec.description}</p>
                    )}
                  </div>
                  <Badge className={`text-xs ${sourceColors[spec.source] || ''}`}>
                    {t(`eir.ids.sources.${spec.source}`)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {spec.specification_count} {t('eir.ids.specCount').toLowerCase()}
                  </span>
                  {spec.ifc_versions.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {spec.ifc_versions.join(', ')}
                    </Badge>
                  )}
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive h-7 w-7 p-0"
                      onClick={() => deleteIDS.mutate({ id: spec.id, eirId })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
