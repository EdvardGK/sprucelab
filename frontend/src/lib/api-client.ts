import axios, { type InternalAxiosRequestConfig } from 'axios';
import { supabase } from './supabase';

const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
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
    if (error?.response?.status === 401) {
      // Token expired or invalid — let the AuthContext detect session loss
      // via onAuthStateChange and redirect to /login. We don't force signOut
      // here because a legitimate refresh may already be in flight.
      console.warn('[api-client] 401 from backend — session may be stale');
    }
    return Promise.reject(error);
  },
);

export default apiClient;
