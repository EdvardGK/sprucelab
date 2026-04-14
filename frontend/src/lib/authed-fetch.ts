import { supabase } from './supabase';

/**
 * fetch() wrapper that attaches the current Supabase access token as a
 * Bearer header. Use for Django API calls that need binary responses
 * (arrayBuffer), where axios is awkward. Do NOT use for Supabase Storage
 * signed URLs — those already carry their own auth.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
