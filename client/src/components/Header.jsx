import { useAuth } from '../lib/auth.jsx';
import { Button } from './ui/button.jsx';
import { cn } from '../lib/utils.js';
import { LogOut, BellRing, BellOff, Bell } from 'lucide-react';

const NOTIFY_MODES = {
  all: { icon: BellRing, label: 'All', color: 'bg-primary/10 text-primary' },
  focus: { icon: Bell, label: 'Focus', color: 'bg-yellow-500/10 text-yellow-500' },
  off: { icon: BellOff, label: 'Off', color: 'text-muted-foreground' },
};

export default function Header({ notifyMode, onCycleNotifyMode, onGoHome }) {
  const { user, logout } = useAuth();
  const mode = NOTIFY_MODES[notifyMode] || NOTIFY_MODES.all;
  const Icon = mode.icon;

  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-border bg-card">
      <button onClick={onGoHome} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">Kratos</button>
      {user && (
        <div className="flex items-center gap-3">
          <button
            onClick={onCycleNotifyMode}
            className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors', mode.color)}
            title={`Notification: ${mode.label}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
          <span className="text-sm text-muted-foreground">{user.username}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-1" /> Logout
          </Button>
        </div>
      )}
    </header>
  );
}
