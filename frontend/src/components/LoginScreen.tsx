import { useState } from 'react';
import { authAPI } from '../services/api';

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await authAPI.login(password);
      onSuccess();
    } catch (err) {
      setError((err as Error).message || 'Incorrect password');
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <span className="login-logo">FiLM</span>
        <p className="login-hint">Enter the password to continue</p>
        <input
          className="login-input"
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
        />
        {error && <div className="login-error">{error}</div>}
        <button className="login-btn" type="submit" disabled={!password || busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
