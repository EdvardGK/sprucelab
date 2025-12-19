/**
 * Plotly Instance Viewer
 *
 * Lightweight 3D mesh viewer using Plotly.js for IFC element previews.
 * Alternative to ThatOpen-based TypeInstanceViewer when WebGL fails or
 * for simpler deployment.
 *
 * Based on the original ifc_preview.py from sidequests/reduzer-mapping.
 */

import { useEffect, useState, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Box } from 'lucide-react';
import { useTypeInstances } from '@/hooks/use-warehouse';
import { openFromUrl, getElementGeometry, type MeshGeometry } from '@/lib/ifc-service-client';

// API base URL for model data
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Base URL for building absolute file URLs
const FILE_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface PlotlyInstanceViewerProps {
  modelId: string;
  typeId: string | null;
  className?: string;
}

export function PlotlyInstanceViewer({ modelId, typeId, className }: PlotlyInstanceViewerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [geometry, setGeometry] = useState<MeshGeometry | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);

  // Fetch instances for the selected type
  const { data: instanceData, isLoading: isLoadingInstances } = useTypeInstances(typeId);

  const instances = instanceData?.instances || [];
  const totalCount = instanceData?.total_count || 0;
  const currentInstance = instances[currentIndex];

  // Reset index when type changes
  useEffect(() => {
    setCurrentIndex(0);
    setGeometry(null);
  }, [typeId]);

  // Load IFC file and get file_id when model changes
  useEffect(() => {
    if (!modelId) return;

    const loadFile = async () => {
      try {
        // Get model info to get file URL
        const modelResponse = await fetch(`${API_BASE}/models/${modelId}/`);
        if (!modelResponse.ok) {
          throw new Error('Model not found');
        }
        const modelData = await modelResponse.json();
        if (!modelData.file_url) {
          throw new Error('No IFC file available');
        }

        // Build full URL for FastAPI service (relative URLs need base)
        const fullFileUrl = modelData.file_url.startsWith('http')
          ? modelData.file_url
          : `${FILE_BASE_URL}${modelData.file_url}`;

        // Open file in FastAPI service
        const openResult = await openFromUrl(fullFileUrl);
        setFileId(openResult.file_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model');
      }
    };

    loadFile();
  }, [modelId]);

  // Fetch geometry when current instance changes
  useEffect(() => {
    if (!fileId || !currentInstance) {
      setGeometry(null);
      return;
    }

    const fetchGeometry = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const geom = await getElementGeometry(fileId, currentInstance.ifc_guid);
        setGeometry(geom);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load geometry');
        setGeometry(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGeometry();
  }, [fileId, currentInstance]);

  // Navigation handlers
  const goToPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(0, i - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex(i => Math.min(totalCount - 1, i + 1));
  }, [totalCount]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext]);

  // Placeholder when no type selected
  if (!typeId) {
    return (
      <div className={`flex flex-col items-center justify-center bg-background-secondary rounded-lg ${className}`}>
        <Box className="h-12 w-12 text-text-tertiary mb-2" />
        <p className="text-sm text-text-secondary">Select a type to preview instances</p>
      </div>
    );
  }

  // Create Plotly data from geometry
  // Note: Using 'as any' because plotly.js types are overly strict for mesh3d
  const plotData = geometry ? [{
    type: 'mesh3d',
    x: geometry.vertices.map(v => v[0]),
    y: geometry.vertices.map(v => v[1]),
    z: geometry.vertices.map(v => v[2]),
    i: geometry.faces.map(f => f[0]),
    j: geometry.faces.map(f => f[1]),
    k: geometry.faces.map(f => f[2]),
    color: '#4A90D9',
    opacity: 0.9,
    flatshading: true,
    lighting: {
      ambient: 0.5,
      diffuse: 0.8,
      specular: 0.2,
      roughness: 0.5,
    },
    lightposition: { x: 100, y: 100, z: 200 },
    hoverinfo: 'text',
    hovertext: geometry.name || geometry.guid,
  } as any] : [];

  const layout = {
    scene: {
      xaxis: { visible: false },
      yaxis: { visible: false },
      zaxis: { visible: false },
      aspectmode: 'data' as const,
      camera: {
        eye: { x: 1.5, y: 1.5, z: 1.0 },
        center: { x: 0, y: 0, z: 0 },
      },
      bgcolor: 'rgba(26, 31, 36, 1)',
    },
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  return (
    <div className={`flex flex-col bg-background-secondary rounded-lg overflow-hidden ${className}`}>
      {/* 3D Canvas */}
      <div className="relative flex-1 min-h-[200px]">
        {geometry && (
          // @ts-ignore - react-plotly.js types incompatible with React 18
          <Plot
            data={plotData}
            layout={layout}
            config={config}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
          />
        )}

        {/* Loading overlay */}
        {(isLoading || isLoadingInstances) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background-secondary/80">
            <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background-secondary/80">
            <AlertCircle className="h-8 w-8 text-status-error mb-2" />
            <p className="text-sm text-status-error text-center px-4">{error}</p>
          </div>
        )}

        {/* No geometry overlay */}
        {!isLoading && !error && !geometry && currentInstance && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background-secondary">
            <Box className="h-8 w-8 text-text-tertiary mb-2" />
            <p className="text-sm text-text-secondary">No geometry available</p>
          </div>
        )}
      </div>

      {/* Instance navigation */}
      <div className="flex items-center justify-between p-3 border-t border-border-primary">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPrev}
          disabled={currentIndex === 0 || isLoading}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Prev
        </Button>

        <div className="text-center">
          <span className="text-sm font-medium text-text-primary">
            {totalCount > 0 ? `${currentIndex + 1} of ${totalCount}` : 'No instances'}
          </span>
          {currentInstance && (
            <p className="text-xs text-text-secondary truncate max-w-[150px]">
              {currentInstance.name || currentInstance.ifc_guid}
            </p>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={goToNext}
          disabled={currentIndex >= totalCount - 1 || isLoading}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
