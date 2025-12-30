/**
 * Instance Viewer - 3D element preview tile
 *
 * Simple wrapper around ThatOpen Components fragments viewer.
 * Shows instances of the selected IFC type with highlight and navigation.
 *
 * Designed as a minimal tile view - no sidebars or HUD.
 * Use fullscreen mode for more controls.
 */

import { TypeInstanceViewer } from './TypeInstanceViewer';

interface InstanceViewerProps {
  modelId: string;
  typeId: string | null;
  className?: string;
}

export function InstanceViewer({
  modelId,
  typeId,
  className,
}: InstanceViewerProps) {
  return (
    <TypeInstanceViewer
      modelId={modelId}
      typeId={typeId}
      className={className}
    />
  );
}
