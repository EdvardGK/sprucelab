import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bookmark, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useProjectFilter,
  useProjectFilterActions,
} from '@/contexts/ProjectFilterProvider';
import {
  createFilterContext,
  type FilterContext,
} from '@/lib/embed/types';
import {
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
  type SavedFilterPayload,
} from '@/hooks/use-saved-filters';

/**
 * Small dropdown that lets the user list, save, restore and delete personal
 * `SavedFilter` rows for the current project. First UI consumer of
 * `/api/filters/saved/`.
 *
 * Restore semantics: REPLACE current filter state (not merge). That matches
 * user intuition for "load a saved view".
 *
 * Library + Pin + Announcement UI is deferred — see Track F PR 1.5 scope.
 */
export function SavedFiltersDropdown() {
  const { t } = useTranslation();
  const { id: projectId } = useParams<{ id: string }>();
  const filter = useProjectFilter();
  const { replace } = useProjectFilterActions();

  const { data: savedFilters, isLoading } = useSavedFilters(projectId);
  const createMutation = useCreateSavedFilter();
  const deleteMutation = useDeleteSavedFilter();

  const [open, setOpen] = useState(false);

  if (!projectId) return null;

  const handleSave = async () => {
    const name = window.prompt(t('filters.saved.namePrompt'));
    if (!name || !name.trim()) return;
    const payload = filterToPayload(filter);
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        payload,
        projectId,
      });
    } catch (err) {
      // Fail loudly — surface to console; the toast hook isn't injected here.
      console.error('[SavedFiltersDropdown] save failed', err);
    }
  };

  const handleRestore = (payload: SavedFilterPayload) => {
    const next = createFilterContext({
      project_id: projectId,
      protocol_version: filter.protocol_version,
      mode: filter.mode,
      selected_express_id: filter.selected_express_id,
      ...stripInvariants(payload),
    });
    replace(next);
    setOpen(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      console.error('[SavedFiltersDropdown] delete failed', err);
    }
  };

  const items = savedFilters ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('filters.saved.trigger')}
          className="inline-flex items-center gap-[3px] px-[7px] py-[2px] rounded-[3px] text-[clamp(0.5rem,1vw,0.625rem)] font-semibold bg-white/[0.04] text-white/55 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/80 transition-colors"
        >
          <Bookmark className="h-[clamp(0.625rem,1.2vw,0.75rem)] w-[clamp(0.625rem,1.2vw,0.75rem)]" />
          <span>{t('filters.saved.trigger')}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[clamp(180px,18vw,240px)] bg-[rgba(15,19,33,0.95)] backdrop-blur-[14px] border border-white/[0.08] text-white/75 p-1"
      >
        <div className="flex flex-col gap-[2px]">
          {isLoading ? (
            <div className="px-2 py-1 text-[clamp(0.5rem,1vw,0.625rem)] text-white/40">
              {t('common.loading')}
            </div>
          ) : items.length === 0 ? (
            <div className="px-2 py-1 text-[clamp(0.5rem,1vw,0.625rem)] text-white/40">
              {t('filters.saved.empty')}
            </div>
          ) : (
            items.map((sf) => (
              <button
                key={sf.id}
                type="button"
                onClick={() => {
                  // Restore needs the full payload — list serializer omits it,
                  // so refetch the detail row on demand.
                  void restoreFromDetail(sf.id, handleRestore);
                }}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-[3px] text-[clamp(0.5rem,1vw,0.625rem)] text-white/75 hover:bg-white/[0.08] cursor-pointer"
              >
                <span className="truncate">{sf.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={t('filters.saved.delete', { name: sf.name })}
                  onClick={(e) => handleDelete(sf.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleDelete(sf.id, e as unknown as React.MouseEvent);
                    }
                  }}
                  className="w-[clamp(0.75rem,1.5vw,1rem)] h-[clamp(0.75rem,1.5vw,1rem)] flex items-center justify-center opacity-50 hover:opacity-100 hover:text-white"
                >
                  <X className="w-[clamp(0.5rem,1vw,0.625rem)] h-[clamp(0.5rem,1vw,0.625rem)]" />
                </span>
              </button>
            ))
          )}
          <div className="h-px bg-white/[0.06] my-1" />
          <button
            type="button"
            onClick={handleSave}
            disabled={createMutation.isPending}
            className="flex items-center gap-[5px] px-2 py-1 rounded-[3px] text-[clamp(0.5rem,1vw,0.625rem)] text-white/75 hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Save className="h-[clamp(0.625rem,1.2vw,0.75rem)] w-[clamp(0.625rem,1.2vw,0.75rem)]" />
            <span>{t('filters.saved.saveCurrent')}</span>
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Slim the current FilterContext down to the open-ended dimensions and
 * lens namespaces. The invariants (mode, project_id, protocol_version,
 * selected_express_id) are intentionally dropped — they're either route- or
 * session-scoped and don't belong in a "saved view".
 *
 * Mirrors `useProjectFilterUrl.projectToPayload` semantics.
 */
function filterToPayload(state: FilterContext): SavedFilterPayload {
  const payload: SavedFilterPayload = {};
  if (state.ifc_class !== undefined) payload.ifc_class = state.ifc_class;
  if (state.excluded_ifc_class !== undefined)
    payload.excluded_ifc_class = state.excluded_ifc_class;
  if (state.floor_code !== undefined) payload.floor_code = state.floor_code;
  if (state.discipline !== undefined) payload.discipline = state.discipline;
  if (state.mmi !== undefined) payload.mmi = state.mmi;
  if (state.materials !== undefined) payload.materials = state.materials;
  if (state.type_id !== undefined) payload.type_id = state.type_id;
  if (state.ns3451 !== undefined) payload.ns3451 = state.ns3451;
  if (state.verification !== undefined) payload.verification = state.verification;
  if (state.systems !== undefined) payload.systems = state.systems;
  if (state.hidden_models !== undefined) payload.hidden_models = state.hidden_models;
  if (state.selected_type_ids !== undefined)
    payload.selected_type_ids = state.selected_type_ids;
  if (state.selected_global_ids !== undefined)
    payload.selected_global_ids = state.selected_global_ids;
  if (state.color_by !== undefined) payload.color_by = state.color_by;
  if (state.quality !== undefined) payload.quality = state.quality;
  return payload;
}

/**
 * Drop the session-scoped invariants from a stored payload so the live
 * provider's invariants survive a restore.
 */
function stripInvariants(payload: SavedFilterPayload): SavedFilterPayload {
  const {
    mode: _mode,
    project_id: _pid,
    protocol_version: _pv,
    selected_express_id: _sid,
    ...rest
  } = payload;
  void _mode;
  void _pid;
  void _pv;
  void _sid;
  return rest;
}

async function restoreFromDetail(
  id: string,
  apply: (payload: SavedFilterPayload) => void,
) {
  // Inline import to avoid importing apiClient at module top in a UI file.
  const { default: apiClient } = await import('@/lib/api-client');
  const { data } = await apiClient.get<{ payload: SavedFilterPayload }>(
    `/filters/saved/${id}/`,
  );
  apply(data.payload ?? {});
}
