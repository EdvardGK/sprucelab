/**
 * Upload Context - Manages background file uploads with direct Supabase upload.
 *
 * Uploads directly to Supabase Storage (bypassing Django) to avoid OOM issues.
 * Flow: getUploadUrl → direct PUT to Supabase → confirmUpload
 * Shows real upload progress and toast notifications.
 */

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { getUploadUrl, confirmUpload } from '@/hooks/use-models';
import apiClient from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { modelKeys } from '@/hooks/use-models';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

export interface UploadFile {
  id: string;
  file: File;
  projectId: string;
  status: UploadStatus;
  progress: number; // 0-100, real progress from XHR
  error?: string;
}

interface UploadContextValue {
  uploads: UploadFile[];
  addFiles: (files: File[], projectId: string) => void;
  removeFile: (id: string) => void;
  retryFile: (id: string) => void;
  startUpload: () => void;
  clearCompleted: () => void;
  isUploading: boolean;
  hasActiveUploads: boolean;
}

const UploadContext = createContext<UploadContextValue | null>(null);

/**
 * Upload a file directly to Supabase using presigned URL.
 * Uses XMLHttpRequest for progress tracking.
 */
export class UploadHttpError extends Error {
  status: number;
  constructor(status: number, statusText: string) {
    super(`Upload failed with status ${status}: ${statusText}`);
    this.status = status;
    this.name = 'UploadHttpError';
  }
}

export class UploadNetworkError extends Error {
  constructor() {
    super('Network error during upload');
    this.name = 'UploadNetworkError';
  }
}

export class UploadAbortedError extends Error {
  constructor() {
    super('Upload aborted');
    this.name = 'UploadAbortedError';
  }
}

function friendlyUploadError(err: unknown, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (err instanceof UploadHttpError) {
    if (err.status === 413) return t('modelUpload.errorTooLargeForServer');
    return t('modelUpload.errorGeneric', { status: err.status });
  }
  if (err instanceof UploadNetworkError) return t('modelUpload.errorNetwork');
  if (err instanceof UploadAbortedError) return t('modelUpload.errorAborted');
  // Axios errors from Django local-upload path
  const axiosErr = err as { response?: { status?: number }; message?: string };
  if (axiosErr?.response?.status === 413) return t('modelUpload.errorTooLargeForServer');
  if (axiosErr?.response?.status) return t('modelUpload.errorGeneric', { status: axiosErr.response.status });
  return err instanceof Error ? err.message : 'Upload failed';
}

function uploadToSupabase(
  file: File,
  uploadUrl: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new UploadHttpError(xhr.status, xhr.statusText));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new UploadNetworkError());
    });

    xhr.addEventListener('abort', () => {
      reject(new UploadAbortedError());
    });

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.send(file);
  });
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { success, error: toastError, warning } = useToast();
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const queryClient = useQueryClient();
  const isUploadingRef = useRef(false);

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

  const retryFile = useCallback((id: string) => {
    // Reset the row back to pending so the next startUpload() pass picks
    // it up. Per-row retry beats "dismiss + start over" — the tester
    // report flagged this as a missing affordance on 413 failures.
    setUploads(prev =>
      prev.map(u =>
        u.id === id
          ? { ...u, status: 'pending' as UploadStatus, error: undefined, progress: 0 }
          : u
      )
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.status === 'pending' || u.status === 'uploading'));
  }, []);

  const uploadSingleFile = useCallback(async (upload: UploadFile): Promise<{ success: boolean; name: string; error?: string }> => {
    try {
      // Try direct Supabase upload first, fall back to Django upload for local dev
      let useLocalUpload = false;
      let urlData;

      try {
        urlData = await getUploadUrl(upload.projectId, upload.file.name);
      } catch {
        // No cloud storage configured - use local Django upload
        useLocalUpload = true;
      }

      if (useLocalUpload) {
        // Local dev: upload directly through Django
        const formData = new FormData();
        formData.append('file', upload.file);
        formData.append('project_id', upload.projectId);
        formData.append('name', upload.file.name.replace(/\.ifc$/i, ''));

        await apiClient.post('/models/upload/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
              setUploads(prev =>
                prev.map(u => (u.id === upload.id ? { ...u, progress } : u))
              );
            }
          },
        });
      } else {
        // Production: upload directly to Supabase via presigned URL
        await uploadToSupabase(upload.file, urlData!.upload_url, (progress) => {
          setUploads(prev =>
            prev.map(u => (u.id === upload.id ? { ...u, progress } : u))
          );
        });

        await confirmUpload({
          project_id: upload.projectId,
          file_path: urlData!.file_path,
          file_url: urlData!.file_url,
          filename: upload.file.name,
          file_size: upload.file.size,
          name: upload.file.name.replace(/\.ifc$/i, ''),
        });
      }

      // Mark as success
      setUploads(prev =>
        prev.map(u =>
          u.id === upload.id ? { ...u, status: 'success' as UploadStatus, progress: 100 } : u
        )
      );

      // Invalidate model list
      queryClient.invalidateQueries({ queryKey: modelKeys.list(upload.projectId) });

      return { success: true, name: upload.file.name };
    } catch (err) {
      const errorMsg = friendlyUploadError(err, t);
      setUploads(prev =>
        prev.map(u =>
          u.id === upload.id
            ? { ...u, status: 'error' as UploadStatus, error: errorMsg, progress: 0 }
            : u
        )
      );
      return { success: false, name: upload.file.name, error: errorMsg };
    }
  }, [queryClient, t]);

  const startUpload = useCallback(async () => {
    // Prevent concurrent upload batches
    if (isUploadingRef.current) return;

    const pendingUploads = uploads.filter(u => u.status === 'pending');
    if (pendingUploads.length === 0) return;

    isUploadingRef.current = true;

    // Mark all pending as uploading
    setUploads(prev =>
      prev.map(u => (u.status === 'pending' ? { ...u, status: 'uploading' as UploadStatus } : u))
    );

    // Upload all in parallel
    const results = await Promise.allSettled(
      pendingUploads.map(upload => uploadSingleFile(upload))
    );

    isUploadingRef.current = false;

    // Show toast summary
    const successCount = results.filter(
      r => r.status === 'fulfilled' && r.value.success
    ).length;
    const failCount = results.length - successCount;

    if (successCount > 0 && failCount === 0) {
      success(t('modelUpload.toastSuccess', { count: successCount }));
    } else if (successCount > 0 && failCount > 0) {
      warning(t('modelUpload.toastPartial', { success: successCount, failed: failCount }));
    } else if (failCount > 0) {
      toastError(t('modelUpload.toastFailed', { count: failCount }));
    }
  }, [uploads, uploadSingleFile, t, success, warning, toastError]);

  return (
    <UploadContext.Provider
      value={{
        uploads,
        addFiles,
        removeFile,
        retryFile,
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
