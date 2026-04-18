import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiFetch('/api/status')
      .then(res => res.json())
      .then(data => { setIsRegister(!data.hasUsers); setChecking(false); })
      .catch(() => setChecking(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const endpoint = isRegister ? '/api/register' : '/api/login';
    try {
      const res = await apiFetch(endpoint, { method: 'POST', body: { username, password } });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Request failed'); return; }
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      login(data.token, { username: payload.username, role: payload.role });
    } catch { setError('Connection failed'); }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-80 rounded-lg border border-border bg-card p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-primary text-center mb-1">Kratos</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {isRegister ? 'Create your account' : 'Sign in to continue'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full">
            {isRegister ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        {isRegister && (
          <p className="text-xs text-muted-foreground text-center mt-4">First user becomes admin</p>
        )}
      </div>
    </div>
  );
}
