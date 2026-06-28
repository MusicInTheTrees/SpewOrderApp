const request = require('supertest');

jest.mock('../auth/oauth', () => ({
  createOAuth2Client: jest.fn(() => ({
    generateAuthUrl: jest.fn(() => 'https://accounts.google.com/mock'),
  })),
  loadTokens: jest.fn(),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
  getOAuth2Client: jest.fn(),
  SCOPES: [],
}));

const app = require('../index');
const { loadTokens, clearTokens } = require('../auth/oauth');

test('GET /auth/url returns a url', async () => {
  const res = await request(app).get('/auth/url');
  expect(res.status).toBe(200);
  expect(res.body.url).toContain('google.com');
});

test('GET /auth/status returns unauthenticated when no tokens', async () => {
  loadTokens.mockReturnValue(null);
  const res = await request(app).get('/auth/status');
  expect(res.body).toEqual({ authenticated: false, email: null });
});

test('GET /auth/status returns authenticated with email when tokens exist', async () => {
  loadTokens.mockReturnValue({ refresh_token: 'tok', email: 'test@example.com' });
  const res = await request(app).get('/auth/status');
  expect(res.body).toEqual({ authenticated: true, email: 'test@example.com' });
});

test('POST /auth/logout calls clearTokens', async () => {
  const res = await request(app).post('/auth/logout');
  expect(res.body).toEqual({ ok: true });
  expect(clearTokens).toHaveBeenCalled();
});
