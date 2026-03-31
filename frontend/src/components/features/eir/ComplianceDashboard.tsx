import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { useEIRCompliance, COMPLIANCE_COLORS } from '@/hooks/use-eir';
import type { ComplianceItem } from '@/hooks/use-eir';

interface ComplianceDashboardProps {
  eirId: string;
}

export function ComplianceDashboard({ eirId }: ComplianceDashboardProps) {
  const { t } = useTranslation();
  const { data: items = [], isLoading } = useEIRCompliance(eirId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">...</p>;
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('eir.compliance.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('eir.compliance.noData')}</p>
      </div>
    );
  }

  // Summary stats
  const responded = items.filter((i) => i.response_status && i.response_status !== 'pending').length;
  const willComply = items.filter((i) => i.response_status === 'will_comply').length;
  const validated = items.filter((i) => i.latest_validation).length;
  const validationPassed = items.filter((i) => i.latest_validation?.overall_pass).length;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('eir.compliance.title')}</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          label={t('eir.overview.requirementCount')}
          value={items.length}
        />
        <SummaryCard
          label={t('eir.compliance.requirementStatus')}
          value={`${responded}/${items.length}`}
          sub={`${willComply} ${t('eir.response.compliance.will_comply').toLowerCase()}`}
        />
        <SummaryCard
          label={t('eir.compliance.validationStatus')}
          value={`${validated}/${items.filter((i) => i.has_ids).length}`}
          sub={`${validationPassed} ${t('eir.compliance.passed').toLowerCase()}`}
        />
        <SummaryCard
          label="IDS"
          value={items.filter((i) => i.has_ids).length}
          sub={t('eir.ids.title')}
        />
      </div>

      {/* Requirements grid */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('eir.sections.requirements')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-2 py-1">
              <div className="col-span-1">{t('eir.requirement.code')}</div>
              <div className="col-span-4">{t('eir.requirement.title')}</div>
              <div className="col-span-2">{t('eir.requirement.category')}</div>
              <div className="col-span-2">{t('eir.requirement.severity')}</div>
              <div className="col-span-1">{t('eir.compliance.requirementStatus')}</div>
              <div className="col-span-2">IDS</div>
            </div>
            {/* Rows */}
            {items.map((item) => (
              <ComplianceRow key={item.requirement_id} item={item} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComplianceRow({ item }: { item: ComplianceItem }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-12 gap-2 items-center px-2 py-1.5 text-sm border-b border-border/30 last:border-0 hover:bg-muted/30">
      <div className="col-span-1 font-mono text-xs text-muted-foreground">{item.code}</div>
      <div className="col-span-4 truncate">{item.title}</div>
      <div className="col-span-2">
        <Badge variant="outline" className="text-xs">
          {t(`eir.requirement.categories.${item.category}`)}
        </Badge>
      </div>
      <div className="col-span-2">
        <Badge variant="outline" className="text-xs">
          {t(`eir.requirement.severities.${item.severity}`)}
        </Badge>
      </div>
      <div className="col-span-1">
        {item.response_status ? (
          <Badge className={`text-xs ${COMPLIANCE_COLORS[item.response_status] || ''}`}>
            {t(`eir.response.compliance.${item.response_status}`)}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="col-span-2">
        {item.has_ids ? (
          item.latest_validation ? (
            item.latest_validation.overall_pass ? (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-xs">{t('eir.compliance.passed')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600">
                <XCircle className="h-3.5 w-3.5" />
                <span className="text-xs">{t('eir.compliance.failed')}</span>
              </div>
            )
          ) : (
            <div className="flex items-center gap-1 text-muted-foreground">
              <MinusCircle className="h-3.5 w-3.5" />
              <span className="text-xs">{t('eir.compliance.notValidated')}</span>
            </div>
          )
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
