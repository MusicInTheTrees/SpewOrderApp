import { apiFetch } from './client';

export const listDesigns = () => apiFetch('/drive/designs');
export const refreshDesigns = () => apiFetch('/drive/designs/refresh', { method: 'POST' });
