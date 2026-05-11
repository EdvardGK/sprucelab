import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useCreateWebhookSubscription,
  type WebhookSubscriptionWithSecret,
} from '@/hooks/use-webhooks';
import { useProjects } from '@/hooks/use-projects';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateWebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (subscription: WebhookSubscriptionWithSecret) => void;
}

/**
 * Common platform events. Free-form input is still allowed — the backend
 * accepts any ``event_type`` so emerging events (types.classified,
 * quantities.extracted, ...) work without a schema migration. This list
 * is just an autocomplete hint.
 */
const COMMON_EVENTS = [
  'model.processed',
  'model.failed',
  'document.processed',
  'claim.extracted',
  'verification.complete',
  'webhook.test',
];

const ALL_PROJECTS_VALUE = '__all__';

export function CreateWebhookDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateWebhookDialogProps) {
  const { t } = useTranslation();
  const { data: projects } = useProjects();
  const createMutation = useCreateWebhookSubscription();

  const [eventType, setEventType] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [description, setDescription] = useState('');
  const [project, setProject] = useState<string>(ALL_PROJECTS_VALUE);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEventType('');
    setTargetUrl('');
    setDescription('');
    setProject(ALL_PROJECTS_VALUE);
    setIsActive(true);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!eventType.trim() || !targetUrl.trim()) {
      setError(t('webhooks.form.errorRequired'));
      return;
    }

    try {
      const created = await createMutation.mutateAsync({
        event_type: eventType.trim(),
        target_url: targetUrl.trim(),
        description: description.trim(),
        project: project === ALL_PROJECTS_VALUE ? null : project,
        is_active: isActive,
      });
      onCreated(created);
      reset();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('webhooks.form.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('webhooks.form.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-event-type">
              {t('webhooks.fields.eventType')}
            </Label>
            <Input
              id="webhook-event-type"
              list="webhook-event-options"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder={t('webhooks.fields.eventTypePlaceholder')}
              required
            />
            <datalist id="webhook-event-options">
              {COMMON_EVENTS.map((evt) => (
                <option key={evt} value={evt} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-target-url">
              {t('webhooks.fields.targetUrl')}
            </Label>
            <Input
              id="webhook-target-url"
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com/hooks/sprucelab"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-project">
              {t('webhooks.fields.project')}
            </Label>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger id="webhook-project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROJECTS_VALUE}>
                  {t('webhooks.fields.projectAll')}
                </SelectItem>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary">
              {t('webhooks.fields.projectHelp')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-description">
              {t('webhooks.fields.description')}
            </Label>
            <Input
              id="webhook-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('webhooks.fields.descriptionPlaceholder')}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="webhook-is-active"
              checked={isActive}
              onCheckedChange={(v) => setIsActive(v === true)}
            />
            <Label htmlFor="webhook-is-active" className="cursor-pointer">
              {t('webhooks.fields.isActive')}
            </Label>
          </div>

          {error && (
            <p
              role="alert"
              className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-red-600"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {t('webhooks.form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
