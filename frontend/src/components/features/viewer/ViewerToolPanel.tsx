/**
 * ViewerToolPanel - Blender-inspired right panel with vertical tabs
 *
 * Features:
 * - Proportional width: clamp(320px, 25vw, 480px)
 * - Vertical tabs on left edge
 * - Larger, readable text (14px base)
 * - Resizable via drag handle
 * - Collapsible to icon strip
 *
 * Tabs:
 * - Properties: Element details (ElementPropertiesPanel)
 * - Sections: Section plane management
 * - Models: Model visibility toggles
 *
 * Note: Filters moved to left ViewerTypeToolbar
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Info,
  Scissors,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Check,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ElementPropertiesPanel, type ElementProperties } from './ElementPropertiesPanel';
import { SectionPlanesPanel } from './SectionPlanesPanel';
import type { SectionPlane } from '@/hooks/useSectionPlanes';

// ============================================================================
// Types
// ============================================================================

export type TabId = 'properties' | 'sections' | 'models';

export interface TypeFilter {
  type: string;
  count: number;
  visible: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  visible: boolean;
}

interface ViewerToolPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;

  // Properties tab
  selectedElement: ElementProperties | null;
  onClearSelection?: () => void;

  // Sections tab
  sectionPlanes: SectionPlane[];
  activePlaneId: string | null;
  onSelectPlane: (id: string | null) => void;
  onDeletePlane: (id: string) => void;
  onClearAllPlanes: () => void;

  // Models tab
  models: ModelInfo[];
  onToggleModelVisibility: (id: string) => void;

  className?: string;
}

// ============================================================================
// Tab Configuration
// ============================================================================

const TABS: { id: TabId; icon: React.ElementType; label: string; shortcut: string }[] = [
  { id: 'properties', icon: Info, label: 'Properties', shortcut: '1' },
  { id: 'sections', icon: Scissors, label: 'Sections', shortcut: '2' },
  { id: 'models', icon: Layers, label: 'Models', shortcut: '3' },
];

// Proportional sizing with bounds - COMFORTABLE, not cramped
const MIN_WIDTH = 360;  // Enough for readable content
const MAX_WIDTH = 520;  // Room for long property values
const DEFAULT_WIDTH = 400; // Comfortable default
const COLLAPSED_WIDTH = 64; // Room for icons + labels

// ============================================================================
// Component
// ============================================================================

export function ViewerToolPanel({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  selectedElement,
  onClearSelection,
  sectionPlanes,
  activePlaneId,
  onSelectPlane,
  onDeletePlane,
  onClearAllPlanes,
  models,
  onToggleModelVisibility,
  className,
}: ViewerToolPanelProps) {
  // Panel width state for resizing
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('viewer-panel-width');
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const isResizing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Save width to localStorage
  useEffect(() => {
    if (!collapsed) {
      localStorage.setItem('viewer-panel-width', String(panelWidth));
    }
  }, [panelWidth, collapsed]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !panelRef.current) return;

      const panelRect = panelRef.current.getBoundingClientRect();
      const newWidth = panelRect.right - e.clientX;
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // ] to toggle panel
      if (e.key === ']') {
        e.preventDefault();
        onToggle();
        return;
      }

      // 1-3 to switch tabs (when expanded)
      if (!collapsed && ['1', '2', '3'].includes(e.key)) {
        const tabIndex = parseInt(e.key) - 1;
        if (TABS[tabIndex]) {
          e.preventDefault();
          onTabChange(TABS[tabIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [collapsed, onToggle, onTabChange]);

  const currentWidth = collapsed ? COLLAPSED_WIDTH : panelWidth;

  return (
    <div
      ref={panelRef}
      className={cn(
        'relative flex bg-surface border-l border-border transition-all duration-200 ease-out',
        className
      )}
      style={{
        width: currentWidth,
        minWidth: currentWidth,
      }}
    >
      {/* Resize Handle (only when expanded) */}
      {!collapsed && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30 transition-colors group z-10"
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-6 w-6 text-text-tertiary" />
          </div>
        </div>
      )}

      {/* Collapsed: Vertical Icon Strip */}
      {collapsed && (
        <div className="flex flex-col items-center pt-3 gap-3 w-full px-1.5">
          {/* Toggle Button - inline at top */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 rounded-lg hover:bg-surface-hover flex-shrink-0"
            title="Expand (])"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const hasBadge =
              (tab.id === 'sections' && sectionPlanes.length > 0) ||
              (tab.id === 'properties' && selectedElement);

            return (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  if (collapsed) onToggle();
                }}
                className={cn(
                  // Comfortable buttons: 56x56px with good click targets
                  'relative rounded-xl transition-colors flex flex-col items-center justify-center gap-1',
                  'min-w-[56px] min-h-[56px] p-2',
                  isActive
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                )}
                title={`${tab.label} (${tab.shortcut})`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {hasBadge && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-accent rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded: Vertical Tabs + Content */}
      {!collapsed && (
        <div className="flex flex-1 min-w-0">
          {/* Vertical Tab Bar (left edge) - comfortable sizing */}
          <div className="w-[72px] bg-surface-dark border-r border-border flex flex-col pt-3 gap-2 flex-shrink-0 px-2">
            {/* Toggle Button - inline at top */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 rounded-lg hover:bg-surface-hover flex-shrink-0 mx-auto mb-2"
              title="Collapse (])"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const hasBadge =
                (tab.id === 'sections' && sectionPlanes.length > 0) ||
                (tab.id === 'properties' && selectedElement);

              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    // Comfortable tab buttons with clear active state
                    'relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg transition-colors',
                    isActive
                      ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                      : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                  )}
                  title={`${tab.label} (${tab.shortcut})`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[11px] font-medium">{tab.label}</span>
                  {hasBadge && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-accent rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content (with larger, readable text) */}
          <div className="flex-1 overflow-y-auto min-h-0 min-w-0">
            {activeTab === 'properties' && (
              <PropertiesTab element={selectedElement} onClose={onClearSelection} />
            )}
            {activeTab === 'sections' && (
              <SectionsTab
                planes={sectionPlanes}
                activePlaneId={activePlaneId}
                onSelectPlane={onSelectPlane}
                onDeletePlane={onDeletePlane}
                onClearAll={onClearAllPlanes}
              />
            )}
            {activeTab === 'models' && (
              <ModelsTab models={models} onToggle={onToggleModelVisibility} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab Content Components
// ============================================================================

function PropertiesTab({
  element,
  onClose,
}: {
  element: ElementProperties | null;
  onClose?: () => void;
}) {
  if (!element) {
    return (
      <div className="p-8 text-center text-text-tertiary">
        <Info className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-base">Click an element to see its properties</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <ElementPropertiesPanel element={element} onClose={onClose} className="shadow-none border-0" />
    </div>
  );
}

function SectionsTab({
  planes,
  activePlaneId,
  onSelectPlane,
  onDeletePlane,
  onClearAll,
}: {
  planes: SectionPlane[];
  activePlaneId: string | null;
  onSelectPlane: (id: string | null) => void;
  onDeletePlane: (id: string) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="p-5">
      <SectionPlanesPanel
        planes={planes}
        activePlaneId={activePlaneId}
        onSelectPlane={onSelectPlane}
        onDeletePlane={onDeletePlane}
        onClearAll={onClearAll}
        className="shadow-none border-0"
      />
    </div>
  );
}

function ModelsTab({
  models,
  onToggle,
}: {
  models: ModelInfo[];
  onToggle: (id: string) => void;
}) {
  const allVisible = models.every((m) => m.visible);
  const visibleCount = models.filter((m) => m.visible).length;

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-text-primary">Models</h3>
        {models.length > 1 && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            {allVisible ? (
              <>
                <Check className="h-4 w-4 text-success" />
                <span>All visible</span>
              </>
            ) : (
              <span>{visibleCount}/{models.length} visible</span>
            )}
          </div>
        )}
      </div>

      {models.length === 0 ? (
        <p className="text-base text-text-tertiary text-center py-8">No models loaded</p>
      ) : (
        <div className="space-y-2">
          {models.map((model) => (
            <div
              key={model.id}
              className={cn(
                // Comfortable row height with good click target
                'flex items-center gap-4 p-4 rounded-xl transition-colors',
                'hover:bg-surface-hover',
                model.visible ? 'bg-surface' : 'bg-surface/50'
              )}
            >
              <button
                onClick={() => onToggle(model.id)}
                className={cn(
                  // Comfortable button size
                  'p-2 rounded-lg transition-colors',
                  model.visible
                    ? 'text-accent hover:bg-accent/20'
                    : 'text-text-tertiary hover:bg-surface-hover'
                )}
              >
                {model.visible ? (
                  <Eye className="h-5 w-5" />
                ) : (
                  <EyeOff className="h-5 w-5" />
                )}
              </button>
              <span
                className={cn(
                  // Readable text size
                  'flex-1 text-base truncate',
                  model.visible ? 'text-text-primary' : 'text-text-tertiary'
                )}
              >
                {model.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
