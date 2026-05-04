import axios, { type InternalAxiosRequestConfig } from 'axios';
import { supabase } from './supabase';

const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1';

const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (DEV_AUTH_BYPASS) return config;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401 && !DEV_AUTH_BYPASS) {
      // Backend rejected our token. Ask Supabase to refresh; if that fails
      // or still yields no session, sign out hard and bounce to /login so
      // the user doesn't sit on a zombie app shell.
      try {
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !data.session) {
          await supabase.auth.signOut();
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.replace('/login');
          }
        }
      } catch {
        await supabase.auth.signOut().catch(() => undefined);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.replace('/login');
        }
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
