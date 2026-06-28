import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingScreen from '../components/LandingScreen';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

function renderLanding() {
  return render(<MemoryRouter><LandingScreen /></MemoryRouter>);
}

test('shows Connect button when not authenticated', async () => {
  authApi.getAuthStatus.mockResolvedValue({ authenticated: false, email: null });
  renderLanding();
  await waitFor(() => expect(screen.getByText(/Connect your Google account/i)).toBeInTheDocument());
});

test('shows Continue as when authenticated', async () => {
  authApi.getAuthStatus.mockResolvedValue({ authenticated: true, email: 'max@test.com' });
  renderLanding();
  await waitFor(() => expect(screen.getByText(/Continue as max@test.com/i)).toBeInTheDocument());
});

test('shows Use a different account when authenticated', async () => {
  authApi.getAuthStatus.mockResolvedValue({ authenticated: true, email: 'max@test.com' });
  renderLanding();
  await waitFor(() => expect(screen.getByText(/Use a different account/i)).toBeInTheDocument());
});
