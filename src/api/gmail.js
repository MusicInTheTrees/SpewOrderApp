import { apiFetch } from './client';

export const upsertDraft = (sheetId, draftId = null) =>
  apiFetch('/gmail/draft', { method: 'POST', body: { sheetId, draftId } });
