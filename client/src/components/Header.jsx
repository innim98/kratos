import { useAuth } from '../lib/auth.jsx';
import { Button } from './ui/button.jsx';
import { cn } from '../lib/utils.js';
import { LogOut, BellRing } from 'lucide-react';

export default function Header({ notifyFocusOnly, onToggleNotifyFocusOnly, onGoHome }) {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-border bg-card">
      <button onClick={onGoHome} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">Kratos</button>
      {user && (
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleNotifyFocusOnly}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
              notifyFocusOnly
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
            title={notifyFocusOnly ? 'Sound: focused agent only' : 'Sound: all agents'}
          >
            <BellRing className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{notifyFocusOnly ? 'Focus' : 'All'}</span>
            <span
              className={cn(
                'w-8 h-4 rounded-full relative inline-flex transition-colors',
                notifyFocusOnly ? 'bg-primary' : 'bg-muted-foreground/30'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                  notifyFocusOnly ? 'translate-x-4' : 'translate-x-0'
                )}
              />
            </span>
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
