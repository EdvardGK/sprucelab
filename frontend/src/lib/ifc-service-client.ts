/**
 * FastAPI IFC Service Client
 *
 * Client for the FastAPI microservice that handles IFC file processing.
 * Use this for querying element properties instead of Django's entity API.
 *
 * Flow:
 * 1. Call openFromUrl(fileUrl) with model's file_url → get file_id
 * 2. Call getElement(fileId, guid) → get full properties
 * 3. Cache file_id per model for subsequent queries
 */

// Use VITE_IFC_SERVICE_URL for production, fallback to localhost for local dev
// Note: FastAPI serves endpoints under /api/v1/ifc/
const IFC_SERVICE_URL = import.meta.env.VITE_IFC_SERVICE_URL || 'http://localhost:8100/api/v1';

// Retry configuration for handling transient errors
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 5000,
};

/**
 * Fetch with automatic retry for connection errors.
 * Uses exponential backoff with jitter.
 */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = RETRY_CONFIG.maxRetries
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error as Error;

      // Only retry on network errors (connection refused, timeout, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        if (attempt < retries) {
          // Exponential backoff with jitter
          const delay = Math.min(
            RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500,
            RETRY_CONFIG.maxDelayMs
          );
          console.warn(
            `[IFC Service] Connection failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${Math.round(delay)}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }

  throw lastError || new Error('Failed after retries');
}

interface IFCOpenResponse {
  file_id: string;
  ifc_schema: string;
  element_count: number;
  type_count: number;
  spatial_elements: number;
  file_size_mb: number;
}

interface ElementSummary {
  guid: string;
  ifc_type: string;
  name: string | null;
  storey: string | null;
}

interface ElementDetail {
  guid: string;
  ifc_type: string;
  name: string | null;
  description: string | null;
  object_type: string | null;
  storey: string | null;
  properties: Record<string, Record<string, any>>;
  quantities: Record<string, { value: number; unit: string }>;
  materials: string[];
  type_name: string | null;
}

interface ElementListResponse {
  elements: ElementSummary[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

interface MeshGeometry {
  guid: string;
  ifc_type: string;
  name: string | null;
  vertices: number[][];
  faces: number[][];
  vertex_count: number;
  face_count: number;
}

// Cache file_id per URL to avoid re-loading
const fileIdCache = new Map<string, string>();

/**
 * Open an IFC file from a URL (e.g., Supabase Storage).
 * Returns file_id for subsequent queries.
 */
export async function openFromUrl(fileUrl: string): Promise<IFCOpenResponse> {
  // Check cache
  const cached = fileIdCache.get(fileUrl);
  if (cached) {
    // Get info for cached file
    const response = await fetchWithRetry(`${IFC_SERVICE_URL}/ifc/${cached}/info`);
    if (response.ok) {
      return response.json();
    }
    // Cache invalid, remove it
    fileIdCache.delete(fileUrl);
  }

  // Load file
  const response = await fetchWithRetry(`${IFC_SERVICE_URL}/ifc/open/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_url: fileUrl }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to load IFC: ${error}`);
  }

  const data: IFCOpenResponse = await response.json();
  fileIdCache.set(fileUrl, data.file_id);
  return data;
}

/**
 * Get paginated list of elements from a loaded IFC file.
 */
export async function getElements(
  fileId: string,
  options?: {
    ifcType?: string;
    offset?: number;
    limit?: number;
  }
): Promise<ElementListResponse> {
  const params = new URLSearchParams();
  if (options?.ifcType) params.set('ifc_type', options.ifcType);
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.limit) params.set('limit', String(options.limit));

  const response = await fetchWithRetry(
    `${IFC_SERVICE_URL}/ifc/${fileId}/elements?${params.toString()}`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get elements: ${error}`);
  }

  return response.json();
}

/**
 * Get detailed properties for a single element by GUID.
 */
export async function getElement(fileId: string, guid: string): Promise<ElementDetail> {
  const response = await fetchWithRetry(`${IFC_SERVICE_URL}/ifc/${fileId}/elements/${guid}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get element: ${error}`);
  }

  return response.json();
}

/**
 * Get detailed properties for a single element by Express ID (step_id).
 * Use this when you have the Express ID from ThatOpen/web-ifc.
 */
export async function getElementByExpressId(fileId: string, expressId: number): Promise<ElementDetail> {
  const response = await fetchWithRetry(`${IFC_SERVICE_URL}/ifc/${fileId}/elements/by-express-id/${expressId}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get element: ${error}`);
  }

  return response.json();
}

/**
 * Get file info for a loaded file.
 */
export async function getFileInfo(fileId: string): Promise<IFCOpenResponse> {
  const response = await fetchWithRetry(`${IFC_SERVICE_URL}/ifc/${fileId}/info`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get file info: ${error}`);
  }

  return response.json();
}

/**
 * Get mesh geometry (vertices, faces) for a single element.
 * Used by Plotly viewer for 3D previews.
 *
 * Returns null if element has no geometry (e.g., IfcSpace, IfcBuildingStorey, abstract types).
 */
export async function getElementGeometry(fileId: string, guid: string): Promise<MeshGeometry | null> {
  const response = await fetchWithRetry(`${IFC_SERVICE_URL}/ifc/${fileId}/geometry/${guid}`);

  if (!response.ok) {
    // 404 or geometry extraction errors are expected for some elements
    if (response.status === 404 || response.status === 422) {
      console.debug(`[IFC] No geometry for element ${guid}`);
      return null;
    }
    const error = await response.text();
    throw new Error(`Failed to get geometry: ${error}`);
  }

  return response.json();
}

/**
 * Get the cached file_id for a URL, or null if not cached.
 */
export function getCachedFileId(fileUrl: string): string | null {
  return fileIdCache.get(fileUrl) || null;
}

/**
 * Clear the file_id cache.
 */
export function clearCache(): void {
  fileIdCache.clear();
}

export type { IFCOpenResponse, ElementSummary, ElementDetail, ElementListResponse, MeshGeometry };
