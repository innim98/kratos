import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Trash2, UserPlus } from 'lucide-react';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [newUsername, setNewUsername] = useState(user?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  const [users, setUsers] = useState([]);
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [userMsg, setUserMsg] = useState('');
  const [userErr, setUserErr] = useState('');

  const [ptyStats, setPtyStats] = useState(null);
  const [ptyMsg, setPtyMsg] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin]);

  const loadPtyStats = () => {
    apiFetch('/api/pty-stats').then(r => r.json()).then(setPtyStats).catch(() => {});
  };

  useEffect(loadPtyStats, []);

  const handlePtyRelease = async () => {
    setPtyMsg('');
    const res = await apiFetch('/api/pty-release', { method: 'POST' });
    const data = await res.json();
    setPtyMsg(`Released ${data.released} FDs (${data.before.serverPtmxFds} → ${data.after.serverPtmxFds})`);
    loadPtyStats();
  };

  const loadUsers = () => {
    apiFetch('/api/users').then(r => r.json())
      .then(data => { if (Array.isArray(data)) setUsers(data); })
      .catch(() => {});
  };

  const handleUpdateUsername = async (e) => {
    e.preventDefault(); setProfileMsg(''); setProfileErr('');
    const res = await apiFetch('/api/me', { method: 'PUT', body: { username: newUsername } });
    const data = await res.json();
    if (res.ok) {
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      updateUser(data.token, { username: payload.username, role: payload.role });
      setProfileMsg('Username updated');
      if (isAdmin) loadUsers();
    } else { setProfileErr(data.error || 'Failed'); }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault(); setProfileMsg(''); setProfileErr('');
    if (newPassword !== confirmPassword) { setProfileErr('Passwords do not match'); return; }
    const res = await apiFetch('/api/me', { method: 'PUT', body: { currentPassword, newPassword } });
    if (res.ok) {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setProfileMsg('Password changed');
    } else {
      const data = await res.json();
      setProfileErr(data.error || 'Failed');
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault(); setUserMsg(''); setUserErr('');
    const res = await apiFetch('/api/users', { method: 'POST', body: { username: addUsername, password: addPassword } });
    if (res.ok) { setAddUsername(''); setAddPassword(''); setUserMsg('User added'); loadUsers(); }
    else { const data = await res.json(); setUserErr(data.error || 'Failed'); }
  };

  const handleDeleteUser = async (id) => {
    const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) loadUsers();
    else { const data = await res.json(); setUserErr(data.error || 'Failed'); }
  };

  return (
    <div className="max-w-xl space-y-6">
      <h2 className="text-xl font-semibold">Settings</h2>

      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-medium">My Profile</h3>

        <form onSubmit={handleUpdateUsername} className="space-y-2">
          <label className="text-sm text-muted-foreground">Username</label>
          <div className="flex gap-2">
            <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} />
            <Button type="submit" size="sm">Save</Button>
          </div>
        </form>

        <form onSubmit={handleUpdatePassword} className="space-y-2">
          <label className="text-sm text-muted-foreground">Change Password</label>
          <Input type="password" placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          <Input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          <Input type="password" placeholder="Confirm" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          <Button type="submit" size="sm">Change Password</Button>
        </form>

        {profileMsg && <p className="text-sm text-emerald-500">{profileMsg}</p>}
        {profileErr && <p className="text-sm text-destructive">{profileErr}</p>}
      </section>

      {isAdmin && (
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="font-medium">User Management</h3>

          <div className="space-y-1">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{u.username}</span>
                  <Badge variant="secondary">{u.role}</Badge>
                </div>
                {u.username === user.username
                  ? <span className="text-xs text-muted-foreground">(you)</span>
                  : <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteUser(u.id)}><Trash2 className="h-4 w-4" /></Button>
                }
              </div>
            ))}
          </div>

          <form onSubmit={handleAddUser} className="flex gap-2">
            <Input placeholder="Username" value={addUsername} onChange={e => setAddUsername(e.target.value)} className="flex-1" />
            <Input type="password" placeholder="Password" value={addPassword} onChange={e => setAddPassword(e.target.value)} className="flex-1" />
            <Button type="submit" size="sm"><UserPlus className="h-4 w-4 mr-1" /> Add</Button>
          </form>

          {userMsg && <p className="text-sm text-emerald-500">{userMsg}</p>}
          {userErr && <p className="text-sm text-destructive">{userErr}</p>}
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">PTY Resources</h3>
          <Button variant="outline" size="sm" onClick={loadPtyStats}>Refresh</Button>
        </div>
        {ptyStats && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-border p-3">
              <div className="text-muted-foreground text-xs">System PTYs</div>
              <div className="text-lg font-semibold">{ptyStats.totalPtys} <span className="text-xs font-normal text-muted-foreground">/ {ptyStats.ptmxMax}</span></div>
            </div>
            <div className="rounded border border-border p-3">
              <div className="text-muted-foreground text-xs">Server PTY FDs</div>
              <div className={`text-lg font-semibold ${ptyStats.serverPtmxFds > 50 ? 'text-orange-500' : ''}`}>{ptyStats.serverPtmxFds}</div>
            </div>
            <div className="rounded border border-border p-3">
              <div className="text-muted-foreground text-xs">Active Connections</div>
              <div className="text-lg font-semibold">{ptyStats.activePtys}</div>
            </div>
            <div className="rounded border border-border p-3">
              <div className="text-muted-foreground text-xs">Leaked FDs</div>
              <div className={`text-lg font-semibold ${(ptyStats.serverPtmxFds - ptyStats.activePtys) > 10 ? 'text-red-500' : 'text-emerald-500'}`}>
                {Math.max(0, ptyStats.serverPtmxFds - ptyStats.activePtys)}
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button variant="destructive" size="sm" onClick={handlePtyRelease}>Release Orphan PTYs</Button>
          {ptyMsg && <span className="text-sm text-muted-foreground">{ptyMsg}</span>}
        </div>
      </section>
    </div>
  );
}
