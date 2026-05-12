import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout.jsx';
import AgentList from './AgentList.jsx';
import AgentDetail from './AgentDetail.jsx';
import Settings from './Settings.jsx';
import TodoList from './TodoList.jsx';
import PortsDashboard from './PortsDashboard.jsx';
import Issues from './Issues.jsx';
import { getToken } from '../lib/api.js';
import { playNotificationSound, showBrowserNotification } from '../lib/notify.js';

export default function Dashboard() {
  const [view, setView] = useState(() => {
    const saved = localStorage.getItem('kratos_last_view');
    return saved || 'welcome';
  });
  const [selectedAgentId, setSelectedAgentId] = useState(() => {
    return localStorage.getItem('kratos_last_agent') || null;
  });
  const [doneAgents, setDoneAgents] = useState(new Set());
  const [silentDoneAgents, setSilentDoneAgents] = useState(new Set());
  const [notifyFocusOnly, setNotifyFocusOnly] = useState(() =>
    localStorage.getItem('kratos_notify_focus_only') === 'true'
  );

  // Refs for WS handler to access latest state
  const selectedAgentIdRef = useRef(selectedAgentId);
  const notifyFocusOnlyRef = useRef(notifyFocusOnly);
  const viewRef = useRef(view);
  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);
  useEffect(() => { notifyFocusOnlyRef.current = notifyFocusOnly; }, [notifyFocusOnly]);
  useEffect(() => { viewRef.current = view; }, [view]);

  // Persist last view and agent to localStorage
  useEffect(() => {
    localStorage.setItem('kratos_last_view', view);
    if (selectedAgentId) {
      localStorage.setItem('kratos_last_agent', selectedAgentId);
    } else {
      localStorage.removeItem('kratos_last_agent');
    }
  }, [view, selectedAgentId]);

  useEffect(() => {
    localStorage.setItem('kratos_notify_focus_only', String(notifyFocusOnly));
  }, [notifyFocusOnly]);

  // Request notification permission on mount
  useEffect(() => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch {}
  }, []);

  // Listen for agent-done events via WS
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getToken();
    if (!token) return;

    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`);

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'agent-done') {
        setDoneAgents(prev => new Set(prev).add(msg.agentId));
        const focusOnly = notifyFocusOnlyRef.current;
        const selectedId = selectedAgentIdRef.current;
        const currentView = viewRef.current;
        const shouldNotify = !focusOnly ||
          (currentView === 'agent-detail' && msg.agentId === selectedId);
        console.log('[notify]', {
          agentId: msg.agentId, agentName: msg.agentName,
          selectedId, focusOnly, currentView, shouldNotify,
        });
        if (shouldNotify) {
          playNotificationSound(`agent-done:${msg.agentId}:${msg.agentName}`);
          showBrowserNotification('Agent Done', `${msg.agentName} has completed work`);
        } else {
          setSilentDoneAgents(prev => new Set(prev).add(msg.agentId));
        }
      }
    };

    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, []);

  const selectAgent = (agentId) => {
    setSelectedAgentId(agentId);
    setView('agent-detail');
    setDoneAgents(prev => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
    setSilentDoneAgents(prev => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
  };

  const goAgents = () => { setView('agents'); setSelectedAgentId(null); };
  const goSettings = () => { setView('settings'); setSelectedAgentId(null); };
  const goTodos = () => { setView('todos'); setSelectedAgentId(null); };
  const goPorts = () => { setView('ports'); setSelectedAgentId(null); };
  const goIssues = () => { setView('issues'); setSelectedAgentId(null); };
  const goMenu = () => { setView('welcome'); setSelectedAgentId(null); };

  let content;
  if (view === 'agents') content = <AgentList onSelectAgent={selectAgent} />;
  else if (view === 'agent-detail' && selectedAgentId) content = <AgentDetail agentId={selectedAgentId} />;
  else if (view === 'todos') content = <TodoList />;
  else if (view === 'ports') content = <PortsDashboard />;
  else if (view === 'issues') content = <Issues />;
  else if (view === 'settings') content = <Settings />;
  else content = <div className="flex items-center justify-center h-full text-muted-foreground text-lg">Welcome to Kratos</div>;

  return (
    <Layout
      view={view}
      selectedAgentId={selectedAgentId}
      doneAgents={doneAgents}
      onSelectAgent={selectAgent}
      onGoAgents={goAgents}
      onGoSettings={goSettings}
      onGoTodos={goTodos}
      onGoPorts={goPorts}
      onGoIssues={goIssues}
      onGoMenu={goMenu}
      silentDoneAgents={silentDoneAgents}
      notifyFocusOnly={notifyFocusOnly}
      onToggleNotifyFocusOnly={() => setNotifyFocusOnly(v => !v)}
    >
      {content}
    </Layout>
  );
}
