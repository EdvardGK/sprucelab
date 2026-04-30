import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Send, FileText, Shield, ClipboardList } from 'lucide-react';
import type { EIR } from '@/hooks/use-eir';
import { useUpdateEIR, useIssueEIR } from '@/hooks/use-eir';
import { useState } from 'react';

interface EIROverviewProps {
  eir: EIR;
}

const statusColors: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  issued: 'bg-blue-100 text-blue-800 border-blue-200',
  responded: 'bg-purple-100 text-purple-800 border-purple-200',
  agreed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  superseded: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function EIROverview({ eir }: EIROverviewProps) {
  const { t } = useTranslation();
  const updateEIR = useUpdateEIR();
  const issueEIR = useIssueEIR();

  const [title, setTitle] = useState(eir.title);
  const [description, setDescription] = useState(eir.description);
  const [issuerName, setIssuerName] = useState(eir.issuer_name);
  const [issuerOrg, setIssuerOrg] = useState(eir.issuer_organization);
  const [framework, setFramework] = useState(eir.framework);

  const isDirty =
    title !== eir.title ||
    description !== eir.description ||
    issuerName !== eir.issuer_name ||
    issuerOrg !== eir.issuer_organization ||
    framework !== eir.framework;

  const handleSave = () => {
    updateEIR.mutate({
      id: eir.id,
      title,
      description,
      issuer_name: issuerName,
      issuer_organization: issuerOrg,
      framework,
    });
  };

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{eir.title}</h2>
          <p className="text-sm text-muted-foreground">
            {t('eir.overview.version')} {eir.version} — {eir.framework.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusColors[eir.status] || statusColors.draft}>
            {t(`eir.status.${eir.status}`)}
          </Badge>
          {eir.status === 'draft' && (
            <Button
              size="sm"
              onClick={() => issueEIR.mutate(eir.id)}
              disabled={issueEIR.isPending}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {t('eir.status.issued')}
            </Button>
          )}
        </div>
      </div>

      {/* Quick reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('bep.overview.quickReference')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <QuickRefRow
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label={t('eir.overview.requirementCount')}
              value={String(eir.requirement_count ?? eir.requirements?.length ?? 0)}
            />
            <QuickRefRow
              icon={<Shield className="h-3.5 w-3.5" />}
              label={t('eir.overview.idsCount')}
              value={String(eir.ids_count ?? eir.ids_specifications?.length ?? 0)}
            />
            <QuickRefRow
              icon={<FileText className="h-3.5 w-3.5" />}
              label={t('eir.overview.framework')}
              value={eir.framework.toUpperCase()}
            />
            <QuickRefRow
              icon={<FileText className="h-3.5 w-3.5" />}
              label={t('bep.technical.ifcVersion')}
              value={eir.ifc_version}
            />
            {eir.issuer_name && (
              <QuickRefRow
                icon={<FileText className="h-3.5 w-3.5" />}
                label={t('eir.overview.issuer')}
                value={`${eir.issuer_name}${eir.issuer_organization ? ` (${eir.issuer_organization})` : ''}`}
              />
            )}
            {eir.issued_at && (
              <QuickRefRow
                icon={<Send className="h-3.5 w-3.5" />}
                label={t('eir.overview.issuedAt')}
                value={new Date(eir.issued_at).toLocaleDateString()}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit form (draft only) */}
      {eir.status === 'draft' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>{t('eir.requirement.title')}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('eir.requirement.description')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('eir.overview.issuer')}</Label>
                <Input value={issuerName} onChange={(e) => setIssuerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('eir.overview.organization')}</Label>
                <Input value={issuerOrg} onChange={(e) => setIssuerOrg(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('eir.overview.framework')}</Label>
              <Select value={framework} onValueChange={(v) => setFramework(v as EIR['framework'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iso19650">ISO 19650</SelectItem>
                  <SelectItem value="ns8360">NS 8360</SelectItem>
                  <SelectItem value="pofin">POFIN</SelectItem>
                  <SelectItem value="custom">{t('bep.classificationSystems.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isDirty && (
              <Button onClick={handleSave} disabled={updateEIR.isPending}>
                {t('bep.actions.save')}
              </Button>
            )}
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
