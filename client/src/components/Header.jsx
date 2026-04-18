import { useAuth } from '../lib/auth.jsx';
import { Button } from './ui/button.jsx';
import { LogOut } from 'lucide-react';

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-border bg-card">
      <span className="text-lg font-bold text-primary">Kratos</span>
      {user && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.username}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-1" /> Logout
          </Button>
        </div>
      )}
    </header>
  );
}
