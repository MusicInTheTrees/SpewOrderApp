import { apiFetch } from './client';

export const getAuthStatus = () => apiFetch('/auth/status');
export const getAuthUrl = () => apiFetch('/auth/url').then(d => d.url);
export const logout = () => apiFetch('/auth/logout', { method: 'POST' });
