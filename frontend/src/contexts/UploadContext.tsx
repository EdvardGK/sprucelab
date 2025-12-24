/**
 * Upload Context - Manages background file uploads.
 *
 * Allows uploads to continue even when the upload dialog is closed.
 * Shows toast notifications when uploads complete.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useUploadModel } from '@/hooks/use-models';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

export interface UploadFile {
  id: string;
  file: File;
  projectId: string;
  status: UploadStatus;
  progress: number; // 0-100, simulated for now
  error?: string;
}

interface UploadContextValue {
  uploads: UploadFile[];
  addFiles: (files: File[], projectId: string) => void;
  removeFile: (id: string) => void;
  startUpload: () => void;
  clearCompleted: () => void;
  isUploading: boolean;
  hasActiveUploads: boolean;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { success, error: toastError, warning } = useToast();
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const uploadModel = useUploadModel();

  const isUploading = uploads.some(u => u.status === 'uploading');
  const hasActiveUploads = uploads.some(u => u.status === 'pending' || u.status === 'uploading');

  const addFiles = useCallback((files: File[], projectId: string) => {
    const newUploads: UploadFile[] = files.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      projectId,
      status: 'pending',
      progress: 0,
    }));
    setUploads(prev => [...prev, ...newUploads]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.status === 'pending' || u.status === 'uploading'));
  }, []);

  const simulateProgress = useCallback((id: string) => {
    // Simulate upload progress with increasing speed towards the end
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 90) {
        // Hold at 90% until actual completion
        progress = 90;
        clearInterval(interval);
      }
      setUploads(prev =>
        prev.map(u => (u.id === id && u.status === 'uploading' ? { ...u, progress } : u))
      );
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const startUpload = useCallback(async () => {
    const pendingUploads = uploads.filter(u => u.status === 'pending');
    if (pendingUploads.length === 0) return;

    // Mark all pending as uploading
    setUploads(prev =>
      prev.map(u => (u.status === 'pending' ? { ...u, status: 'uploading' as UploadStatus } : u))
    );

    // Start progress simulation for each file
    const cleanupFns = pendingUploads.map(upload => simulateProgress(upload.id));

    // Upload all in parallel
    const results = await Promise.allSettled(
      pendingUploads.map(async upload => {
        try {
          await uploadModel.mutateAsync({
            file: upload.file,
            project: upload.projectId,
            name: upload.file.name.replace(/\.ifc$/i, ''),
          });

          setUploads(prev =>
            prev.map(u =>
              u.id === upload.id ? { ...u, status: 'success' as UploadStatus, progress: 100 } : u
            )
          );

          return { id: upload.id, success: true, name: upload.file.name };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Upload failed';
          setUploads(prev =>
            prev.map(u =>
              u.id === upload.id
                ? { ...u, status: 'error' as UploadStatus, error: errorMsg, progress: 0 }
                : u
            )
          );
          return { id: upload.id, success: false, name: upload.file.name, error: errorMsg };
        }
      })
    );

    // Clean up progress simulations
    cleanupFns.forEach(cleanup => cleanup());

    // Show toast summary
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failCount = results.length - successCount;

    if (successCount > 0 && failCount === 0) {
      success(t('modelUpload.toastSuccess', { count: successCount }));
    } else if (successCount > 0 && failCount > 0) {
      warning(t('modelUpload.toastPartial', { success: successCount, failed: failCount }));
    } else if (failCount > 0) {
      toastError(t('modelUpload.toastFailed', { count: failCount }));
    }
  }, [uploads, uploadModel, simulateProgress, t, success, warning, toastError]);

  return (
    <UploadContext.Provider
      value={{
        uploads,
        addFiles,
        removeFile,
        startUpload,
        clearCompleted,
        isUploading,
        hasActiveUploads,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadContext() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUploadContext must be used within UploadProvider');
  }
  return context;
}
