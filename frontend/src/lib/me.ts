import apiClient from './api-client';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface MeProfile {
  supabase_id: string | null;
  display_name: string;
  avatar_url: string;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  signup_metadata: Record<string, unknown>;
  created_at: string | null;
}

export interface MeResponse {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  profile: MeProfile | null;
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>('/me/');
  return data;
}

export async function updateMyProfile(input: {
  display_name?: string;
  signup_metadata?: Record<string, unknown>;
}): Promise<MeResponse> {
  const { data } = await apiClient.patch<MeResponse>('/me/profile/', input);
  return data;
}
