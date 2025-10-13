import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// Type definitions
interface Script {
  id: string;
  name: string;
  description: string;
  code: string;
  category: string;
  parameters_schema: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface ScriptExecution {
  id: string;
  script: string;
  model: string;
  status: 'queued' | 'running' | 'success' | 'error';
  parameters: Record<string, any>;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  output_log: string | null;
  result_data: Record<string, any>;
  error_message: string | null;
  created_at: string;
}

interface ExecuteScriptRequest {
  script_id: string;
  model_id: string;
  parameters?: Record<string, any>;
}

// Query keys
export const scriptKeys = {
  all: ['scripts'] as const,
  lists: () => [...scriptKeys.all, 'list'] as const,
  list: () => [...scriptKeys.lists()] as const,
  details: () => [...scriptKeys.all, 'detail'] as const,
  detail: (id: string) => [...scriptKeys.details(), id] as const,
  byName: (name: string) => [...scriptKeys.all, 'name', name] as const,
};

export const executionKeys = {
  all: ['script-executions'] as const,
  lists: () => [...executionKeys.all, 'list'] as const,
  list: (modelId?: string) => [...executionKeys.lists(), { modelId }] as const,
  details: () => [...executionKeys.all, 'detail'] as const,
  detail: (id: string) => [...executionKeys.details(), id] as const,
  forScript: (modelId: string, scriptId: string) =>
    [...executionKeys.all, 'model', modelId, 'script', scriptId] as const,
};

/**
 * Fetch all scripts
 */
export function useScripts() {
  return useQuery({
    queryKey: scriptKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<Script[]>('/scripts/');
      return response.data;
    },
  });
}

/**
 * Fetch script by ID
 */
export function useScript(id: string) {
  return useQuery({
    queryKey: scriptKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<Script>(`/scripts/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch script by name
 */
export function useScriptByName(name: string) {
  return useQuery({
    queryKey: scriptKeys.byName(name),
    queryFn: async () => {
      const response = await apiClient.get<Script[]>(`/scripts/?name=${encodeURIComponent(name)}`);
      // Return first matching script
      return response.data[0] || null;
    },
    enabled: !!name,
  });
}

/**
 * Fetch executions for a model
 */
export function useScriptExecutions(modelId: string) {
  return useQuery({
    queryKey: executionKeys.list(modelId),
    queryFn: async () => {
      const response = await apiClient.get<ScriptExecution[]>(`/models/${modelId}/script-executions/`);
      return response.data;
    },
    enabled: !!modelId,
  });
}

/**
 * Fetch single execution
 */
export function useScriptExecution(executionId: string) {
  return useQuery({
    queryKey: executionKeys.detail(executionId),
    queryFn: async () => {
      const response = await apiClient.get<ScriptExecution>(`/script-executions/${executionId}/`);
      return response.data;
    },
    enabled: !!executionId,
  });
}

/**
 * Execute script mutation
 */
export function useExecuteScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ExecuteScriptRequest) => {
      const response = await apiClient.post<ScriptExecution>(
        `/models/${data.model_id}/execute-script/`,
        {
          script_id: data.script_id,
          parameters: data.parameters || {},
        },
        {
          timeout: 600000, // 10 minutes for script execution
        }
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      // Invalidate executions list for this model
      queryClient.invalidateQueries({
        queryKey: executionKeys.list(variables.model_id)
      });

      // Invalidate cached execution for this script
      queryClient.invalidateQueries({
        queryKey: executionKeys.forScript(variables.model_id, variables.script_id)
      });
    },
  });
}

/**
 * Combined hook: Execute script if not cached, return cached result otherwise
 *
 * This hook is perfect for dashboard components that need script results.
 * It will:
 * 1. Find the script by name
 * 2. Check for existing (recent) execution
 * 3. Use cached result or trigger new execution
 *
 * @param modelId - Model to run script on
 * @param scriptName - Name of the script
 * @param parameters - Script parameters (optional)
 * @param cacheTime - How long to cache results in milliseconds (default: 5 minutes)
 */
export function useScriptResult(
  modelId: string,
  scriptName: string,
  parameters?: Record<string, any>,
  cacheTime: number = 5 * 60 * 1000
) {
  // 1. Find script by name
  const { data: script, isLoading: scriptLoading, error: scriptError } = useScriptByName(scriptName);

  // 2. Fetch or execute script
  const { data: execution, isLoading: executionLoading, error: executionError } = useQuery({
    queryKey: executionKeys.forScript(modelId, script?.id || ''),
    queryFn: async () => {
      if (!script) throw new Error('Script not found');

      // Check for recent execution
      const executionsResponse = await apiClient.get<ScriptExecution[]>(
        `/models/${modelId}/script-executions/?script=${script.id}`
      );

      const executions = executionsResponse.data;

      // Find recent successful execution
      const recentExecution = executions.find(
        (ex) => ex.status === 'success' &&
        ex.created_at &&
        (Date.now() - new Date(ex.created_at).getTime() < cacheTime)
      );

      if (recentExecution) {
        return recentExecution;
      }

      // No recent execution, trigger new one
      const response = await apiClient.post<ScriptExecution>(
        `/models/${modelId}/execute-script/`,
        {
          script_id: script.id,
          parameters: parameters || {},
        },
        {
          timeout: 600000, // 10 minutes
        }
      );

      return response.data;
    },
    enabled: !!modelId && !!script,
    staleTime: cacheTime,
    gcTime: cacheTime * 2, // Keep in cache for twice as long
    refetchInterval: (query) => {
      // Poll every 2 seconds if running
      const data = query.state.data;
      if (data?.status === 'queued' || data?.status === 'running') {
        return 2000;
      }
      return false;
    },
  });

  const isLoading = scriptLoading || executionLoading;
  const error = scriptError || executionError;

  return {
    // Script info
    script,

    // Execution info
    execution,
    executionId: execution?.id,
    status: execution?.status,

    // Result data (for dashboard consumption)
    data: execution?.result_data,

    // Logs and error
    outputLog: execution?.output_log,
    errorMessage: execution?.error_message,

    // Timing
    duration: execution?.duration_ms,

    // Loading states
    isLoading,
    isExecuting: execution?.status === 'running' || execution?.status === 'queued',
    isSuccess: execution?.status === 'success',
    isError: execution?.status === 'error' || !!error,

    // Error
    error,
  };
}

/**
 * Convenience hook for QTO analysis
 */
export function useQTOAnalysis(modelId: string) {
  return useScriptResult(modelId, 'QTO Analyzer');
}

/**
 * Convenience hook for MMI analysis
 */
export function useMMIAnalysis(modelId: string) {
  return useScriptResult(modelId, 'MMI Analyzer');
}
