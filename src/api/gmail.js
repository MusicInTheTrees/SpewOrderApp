import { apiFetch } from './client';

export const createDraft = (sheetId) =>
  apiFetch('/gmail/draft', { method: 'POST', body: { sheetId } });
