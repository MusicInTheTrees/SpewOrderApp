import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthStatus, getAuthUrl, logout } from '../api/auth';

export default function LandingScreen() {
  const [status, setStatus] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getAuthStatus().then(setStatus).catch(() => setStatus({ authenticated: false, email: null }));
  }, []);

  async function handleContinue() {
    navigate('/orders');
  }

  async function handleSwitchAccount() {
    await logout();
    const url = await getAuthUrl();
    window.location.href = url;
  }

  async function handleConnect() {
    const url = await getAuthUrl();
    window.location.href = url;
  }

  if (!status) return <div className="landing">Loading...</div>;

  return (
    <div className="landing">
      <img src="/RMCOrder_favicon.png" alt="RMC Ordering" className="landing-logo" />
      <h1>RMC Ordering</h1>
      {status.authenticated ? (
        <>
          <button className="btn-primary" onClick={handleContinue}>
            Continue as {status.email}
          </button>
          <button className="btn-secondary" onClick={handleSwitchAccount}>
            Use a different account
          </button>
        </>
      ) : (
        <button className="btn-primary" onClick={handleConnect}>
          Connect your Google account
        </button>
      )}
    </div>
  );
}
