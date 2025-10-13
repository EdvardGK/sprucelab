import { useState } from 'react';
import { ChevronRight, ChevronDown, Eye, EyeOff, MoreVertical, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ViewerGroup } from '@/lib/api-types';

interface ViewerTreeProps {
  groups: ViewerGroup[];
  onModelVisibilityToggle?: (modelId: string, visible: boolean) => void;
  onGroupVisibilityToggle?: (groupId: string, visible: boolean) => void;
  onModelSettings?: (modelId: string) => void;
}

export function ViewerTree({
  groups,
  onModelVisibilityToggle,
  onGroupVisibilityToggle,
  onModelSettings,
}: ViewerTreeProps) {
  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <GroupNode
          key={group.id}
          group={group}
          level={0}
          onModelVisibilityToggle={onModelVisibilityToggle}
          onGroupVisibilityToggle={onGroupVisibilityToggle}
          onModelSettings={onModelSettings}
        />
      ))}
    </div>
  );
}

interface GroupNodeProps {
  group: ViewerGroup;
  level: number;
  onModelVisibilityToggle?: (modelId: string, visible: boolean) => void;
  onGroupVisibilityToggle?: (groupId: string, visible: boolean) => void;
  onModelSettings?: (modelId: string) => void;
}

function GroupNode({
  group,
  level,
  onModelVisibilityToggle,
  onGroupVisibilityToggle,
  onModelSettings,
}: GroupNodeProps) {
  const [isExpanded, setIsExpanded] = useState(group.is_expanded);
  const [groupVisible, setGroupVisible] = useState(true);

  const hasChildren = (group.models && group.models.length > 0);

  const handleGroupVisibilityToggle = () => {
    const newVisible = !groupVisible;
    setGroupVisible(newVisible);

    // Toggle visibility for all models in this group
    if (onGroupVisibilityToggle) {
      onGroupVisibilityToggle(group.id, newVisible);
    }

    // Toggle all models
    group.models?.forEach((model) => {
      if (onModelVisibilityToggle) {
        onModelVisibilityToggle(model.id, newVisible);
      }
    });
  };

  const getGroupIcon = (type: string) => {
    switch (type) {
      case 'building':
        return '🏢';
      case 'phase':
        return '📅';
      case 'discipline':
        return '🔧';
      case 'zone':
        return '📍';
      default:
        return '📁';
    }
  };

  return (
    <div>
      {/* Group Header */}
      <div
        className={cn(
          'flex items-center gap-1 py-1.5 px-2 rounded hover:bg-surface-hover group/item',
          level > 0 && 'ml-4'
        )}
      >
        {/* Expand/Collapse Button */}
        {hasChildren && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0 hover:bg-transparent"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-text-tertiary" />
            )}
          </Button>
        )}
        {!hasChildren && <div className="w-5" />}

        {/* Group Icon and Name */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-sm">{getGroupIcon(group.group_type)}</span>
          <span className="text-xs font-medium text-text-primary truncate">
            {group.name}
          </span>
          <span className="text-[10px] text-text-tertiary">
            ({group.model_count})
          </span>
        </div>

        {/* Visibility Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 p-0 opacity-0 group-hover/item:opacity-100 transition-opacity"
          onClick={handleGroupVisibilityToggle}
        >
          {groupVisible ? (
            <Eye className="h-3.5 w-3.5 text-text-secondary" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-text-tertiary" />
          )}
        </Button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="ml-2">
          {/* Models in this group */}
          {group.models?.map((model) => (
            <ModelNode
              key={model.id}
              model={model}
              level={level + 1}
              onVisibilityToggle={onModelVisibilityToggle}
              onSettings={onModelSettings}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ModelNodeProps {
  model: any;
  level: number;
  onVisibilityToggle?: (modelId: string, visible: boolean) => void;
  onSettings?: (modelId: string) => void;
}

function ModelNode({ model, level, onVisibilityToggle, onSettings }: ModelNodeProps) {
  const [visible, setVisible] = useState(model.is_visible);

  const handleVisibilityToggle = () => {
    const newVisible = !visible;
    setVisible(newVisible);
    if (onVisibilityToggle) {
      onVisibilityToggle(model.id, newVisible);
    }
  };

  const hasOffset = model.offset_x !== 0 || model.offset_y !== 0 || model.offset_z !== 0;
  const hasRotation = model.rotation !== 0;
  const hasColorOverride = !!model.color_override;

  return (
    <div
      className={cn(
        'flex items-center gap-1 py-1.5 px-2 rounded hover:bg-surface-hover group/model',
        level > 0 && 'ml-4'
      )}
    >
      <div className="w-5" /> {/* Spacer for alignment */}

      {/* Model Icon */}
      <Box className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />

      {/* Model Name */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text-secondary truncate">
          {model.model_name}
        </div>
        {/* Indicators */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {hasColorOverride && (
            <div
              className="h-2 w-2 rounded-full border border-border"
              style={{ backgroundColor: model.color_override }}
              title="Custom color"
            />
          )}
          {hasOffset && (
            <span className="text-[9px] text-text-tertiary" title="Offset applied">
              📐
            </span>
          )}
          {hasRotation && (
            <span className="text-[9px] text-text-tertiary" title="Rotation applied">
              🔄
            </span>
          )}
          {model.opacity < 1 && (
            <span className="text-[9px] text-text-tertiary" title={`Opacity: ${Math.round(model.opacity * 100)}%`}>
              ◐
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover/model:opacity-100 transition-opacity">
        {/* Visibility Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 p-0"
          onClick={handleVisibilityToggle}
        >
          {visible ? (
            <Eye className="h-3.5 w-3.5 text-text-secondary" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-text-tertiary" />
          )}
        </Button>

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 p-0"
          onClick={() => onSettings?.(model.id)}
        >
          <MoreVertical className="h-3.5 w-3.5 text-text-secondary" />
        </Button>
      </div>
    </div>
  );
}
