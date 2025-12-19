/**
 * Instance Viewer - Wrapper for 3D element previews
 *
 * Supports two viewer modes:
 * - 'thatopen': ThatOpen Components (full-featured but requires WebGL)
 * - 'plotly': Plotly.js (lightweight, works everywhere)
 * - 'auto': Try ThatOpen first, fall back to Plotly on error
 */

import { useState, useEffect } from 'react';
import { TypeInstanceViewer } from './TypeInstanceViewer';
import { PlotlyInstanceViewer } from './PlotlyInstanceViewer';

type ViewerMode = 'thatopen' | 'plotly' | 'auto';

interface InstanceViewerProps {
  modelId: string;
  typeId: string | null;
  className?: string;
  mode?: ViewerMode;
}

export function InstanceViewer({
  modelId,
  typeId,
  className,
  mode = 'auto'
}: InstanceViewerProps) {
  const [activeMode, setActiveMode] = useState<'thatopen' | 'plotly'>(
    mode === 'plotly' ? 'plotly' : 'thatopen'
  );
  const [thatopenFailed, setThatopenFailed] = useState(false);

  // Reset failure state when model changes
  useEffect(() => {
    if (mode === 'auto') {
      setThatopenFailed(false);
      setActiveMode('thatopen');
    }
  }, [modelId, mode]);

  // Handle ThatOpen error in auto mode
  useEffect(() => {
    if (mode === 'auto' && thatopenFailed) {
      setActiveMode('plotly');
    }
  }, [mode, thatopenFailed]);

  // Use specific mode
  if (mode === 'plotly') {
    return (
      <PlotlyInstanceViewer
        modelId={modelId}
        typeId={typeId}
        className={className}
      />
    );
  }

  if (mode === 'thatopen') {
    return (
      <TypeInstanceViewer
        modelId={modelId}
        typeId={typeId}
        className={className}
      />
    );
  }

  // Auto mode: show ThatOpen but catch errors
  if (activeMode === 'plotly') {
    return (
      <PlotlyInstanceViewer
        modelId={modelId}
        typeId={typeId}
        className={className}
      />
    );
  }

  // Wrap ThatOpen in error boundary behavior
  return (
    <ThatOpenWithFallback
      modelId={modelId}
      typeId={typeId}
      className={className}
      onError={() => setThatopenFailed(true)}
    />
  );
}

// Helper component to catch ThatOpen initialization errors
function ThatOpenWithFallback({
  modelId,
  typeId,
  className,
  onError
}: InstanceViewerProps & { onError: () => void }) {
  const [hasError, setHasError] = useState(false);

  // Check for WebGL support
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setHasError(true);
        onError();
      }
    } catch {
      setHasError(true);
      onError();
    }
  }, [onError]);

  if (hasError) {
    return (
      <PlotlyInstanceViewer
        modelId={modelId}
        typeId={typeId ?? null}
        className={className}
      />
    );
  }

  return (
    <TypeInstanceViewer
      modelId={modelId}
      typeId={typeId ?? null}
      className={className}
    />
  );
}

export type { ViewerMode };
