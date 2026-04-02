/**
 * Field & Compliance types.
 *
 * Maps to Django apps/field/ models.
 */

export type ChecklistStatus = 'draft' | 'in_progress' | 'completed' | 'signed'
export type CheckItemStatus = 'pending' | 'ok' | 'deviation' | 'not_applicable'

export type ReferenceType =
  | 'drawing'
  | 'tek17'
  | 'product_manual'
  | 'design_spec'
  | 'ns_standard'
  | 'custom'
  | 'none'

export type DeviationResponsible = 'prosjekterende' | 'utførende' | 'annet'
export type DeviationAction = 'stopp' | 'fortsett_med_forbehold' | 'foreslå_løsning'

export interface ChecklistTemplate {
  id: string
  project: string | null
  name: string
  description: string | null
  category: string
  regulation_ref: string | null
  is_system_template: boolean
  version: number
  item_count?: number
  items?: ChecklistTemplateItem[]
  created_at: string
  updated_at: string
}

export interface ChecklistTemplateItem {
  id: string
  template: string
  sort_order: number
  title: string
  description: string | null
  reference_type: ReferenceType
  reference_code: string | null
  reference_description: string | null
  reference_document_url: string | null
  reference_page: string | null
  acceptance_criteria: string | null
  measurement_unit: string | null
  tolerance_min: number | null
  tolerance_max: number | null
  requires_photo: boolean
  requires_measurement: boolean
  is_critical: boolean
  created_at: string
}

export interface ChecklistProgress {
  total: number
  ok: number
  deviations: number
  not_applicable: number
  pending: number
}

export interface Checklist {
  id: string
  project: string
  template: string | null
  template_name: string | null
  name: string
  location: string | null
  status: ChecklistStatus
  assigned_to: string | null
  started_at: string | null
  completed_at: string | null
  signed_by: string | null
  signed_at: string | null
  created_by: string | null
  progress: ChecklistProgress
  items?: CheckItem[]
  created_at: string
  updated_at: string
}

export interface CheckItem {
  id: string
  checklist: string
  template_item: string | null
  sort_order: number
  title: string
  reference_type: ReferenceType | null
  reference_code: string | null
  reference_description: string | null
  reference_document_url: string | null
  reference_page: string | null
  acceptance_criteria: string | null
  measurement_unit: string | null
  tolerance_min: number | null
  tolerance_max: number | null
  requires_photo: boolean
  is_critical: boolean
  // Worker input
  status: CheckItemStatus
  measured_value: number | null
  notes: string | null
  checked_by: string | null
  checked_at: string | null
  // Deviation
  deviation_description: string | null
  deviation_responsible: DeviationResponsible | null
  deviation_action: DeviationAction | null
  deviation_resolved: boolean
  deviation_resolved_by: string | null
  deviation_resolved_at: string | null
  // Computed
  is_out_of_tolerance: boolean
  created_at: string
  updated_at: string
}

// Display configs
export const REFERENCE_TYPE_CONFIG: Record<ReferenceType, { label: string; color: string; bgColor: string }> = {
  drawing: { label: 'Tegning', color: 'text-blueprint', bgColor: 'bg-blueprint-light' },
  tek17: { label: 'TEK17', color: 'text-regulation', bgColor: 'bg-regulation-light' },
  product_manual: { label: 'Produktblad', color: 'text-product', bgColor: 'bg-product-light' },
  ns_standard: { label: 'NS Standard', color: 'text-standard', bgColor: 'bg-standard-light' },
  design_spec: { label: 'Prosjektbeskrivelse', color: 'text-spec', bgColor: 'bg-spec-light' },
  custom: { label: 'Annet', color: 'text-concrete', bgColor: 'bg-muted-light' },
  none: { label: '', color: '', bgColor: '' },
}

export const DEVIATION_RESPONSIBLE_LABELS: Record<DeviationResponsible, string> = {
  prosjekterende: 'Prosjekterende',
  utførende: 'Utførende',
  annet: 'Annet',
}

export const DEVIATION_ACTION_LABELS: Record<DeviationAction, string> = {
  stopp: 'Stopp arbeidet og varsle prosjektleder',
  fortsett_med_forbehold: 'Fortsett med forbehold (dokumentert)',
  foreslå_løsning: 'Foreslå løsning',
}
