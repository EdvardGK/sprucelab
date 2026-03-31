import { useState } from 'react';
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
import { Plus, Send, Wand2, Loader2 } from 'lucide-react';
import {
  useBEPResponses,
  useCreateBEPResponse,
  useSubmitBEPResponse,
  useAutoPopulateResponse,
  useResponseItems,
  useUpdateResponseItem,
  COMPLIANCE_STATUSES,
  COMPLIANCE_COLORS,
} from '@/hooks/use-eir';
import type { BEPResponse, BEPResponseItem } from '@/hooks/use-eir';

interface BEPResponsePanelProps {
  eirId: string;
}

const responseStatusColors: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  submitted: 'bg-blue-100 text-blue-800 border-blue-200',
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  revision_requested: 'bg-red-100 text-red-800 border-red-200',
};

export function BEPResponsePanel({ eirId }: BEPResponsePanelProps) {
  const { t } = useTranslation();
  const { data: responses = [], isLoading } = useBEPResponses(eirId);
  const createResponse = useCreateBEPResponse();
  const submitResponse = useSubmitBEPResponse();
  const autoPopulate = useAutoPopulateResponse();

  const latestResponse = responses[0] || null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!latestResponse) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('eir.response.title')}</h2>
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">{t('eir.response.noResponse')}</p>
            <Button
              onClick={() => createResponse.mutate({ eir: eirId })}
              disabled={createResponse.isPending}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t('eir.response.create')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Response header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('eir.response.title')}</h2>
        <div className="flex items-center gap-2">
          <Badge className={responseStatusColors[latestResponse.status] || ''}>
            {t(`eir.response.status.${latestResponse.status}`)}
          </Badge>
          {latestResponse.status === 'draft' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => autoPopulate.mutate(latestResponse.id)}
                disabled={autoPopulate.isPending}
              >
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                {t('eir.response.autoPopulate')}
              </Button>
              <Button
                size="sm"
                onClick={() => submitResponse.mutate(latestResponse.id)}
                disabled={submitResponse.isPending}
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {t('eir.response.submit')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Response metadata */}
      {latestResponse.status === 'draft' && (
        <ResponseMetadataForm response={latestResponse} />
      )}

      {/* Response items */}
      <ResponseItemList responseId={latestResponse.id} readOnly={latestResponse.status !== 'draft'} />
    </div>
  );
}

function ResponseMetadataForm({ response }: { response: BEPResponse }) {
  const { t } = useTranslation();
  const { mutate: update } = useCreateBEPResponse(); // reuse for simplicity
  // We'll use useUpdateBEPResponse in reality
  const { useUpdateBEPResponse: useUpdate } = require('@/hooks/use-eir');

  return null; // Simplified — metadata editing can be added later
}

function ResponseItemList({ responseId, readOnly }: { responseId: string; readOnly: boolean }) {
  const { t } = useTranslation();
  const { data: items = [], isLoading } = useResponseItems(responseId);
  const updateItem = useUpdateResponseItem();

  if (isLoading) return <p className="text-sm text-muted-foreground">...</p>;

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('eir.response.noResponse')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ResponseItemRow
          key={item.id}
          item={item}
          readOnly={readOnly}
          onUpdate={(data) => updateItem.mutate({ id: item.id, ...data })}
        />
      ))}
    </div>
  );
}

function ResponseItemRow({
  item,
  readOnly,
  onUpdate,
}: {
  item: BEPResponseItem;
  readOnly: boolean;
  onUpdate: (data: Partial<BEPResponseItem>) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-mono text-xs text-muted-foreground w-20">
          {item.requirement_code}
        </span>
        <span className="text-sm flex-1">{item.requirement_title}</span>
        {readOnly ? (
          <Badge className={`text-xs ${COMPLIANCE_COLORS[item.compliance_status] || ''}`}>
            {t(`eir.response.compliance.${item.compliance_status}`)}
          </Badge>
        ) : (
          <Select
            value={item.compliance_status}
            onValueChange={(v) => onUpdate({ compliance_status: v as BEPResponseItem['compliance_status'] })}
          >
            <SelectTrigger className="w-40 h-7 text-xs" onClick={(e) => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPLIANCE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`eir.response.compliance.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {expanded && (
        <CardContent className="pt-0 pb-3 px-4 space-y-3">
          {readOnly ? (
            <>
              {item.method_description && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t('eir.response.item.method')}</Label>
                  <p className="text-sm">{item.method_description}</p>
                </div>
              )}
              {item.issues && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t('eir.response.item.issues')}</Label>
                  <p className="text-sm">{item.issues}</p>
                </div>
              )}
              {item.wishes && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t('eir.response.item.wishes')}</Label>
                  <p className="text-sm">{item.wishes}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">{t('eir.response.item.method')}</Label>
                <Textarea
                  value={item.method_description}
                  onChange={(e) => onUpdate({ method_description: e.target.value })}
                  rows={2}
                  placeholder={t('eir.response.item.method')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('eir.response.item.issues')}</Label>
                  <Textarea
                    value={item.issues}
                    onChange={(e) => onUpdate({ issues: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('eir.response.item.wishes')}</Label>
                  <Textarea
                    value={item.wishes}
                    onChange={(e) => onUpdate({ wishes: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('eir.response.item.discipline')}</Label>
                  <Input
                    value={item.responsible_discipline}
                    onChange={(e) => onUpdate({ responsible_discipline: e.target.value })}
                    placeholder="ARK, RIB, ..."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('eir.response.item.toolNotes')}</Label>
                  <Input
                    value={item.tool_notes}
                    onChange={(e) => onUpdate({ tool_notes: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
