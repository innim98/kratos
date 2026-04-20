import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout.jsx';
import AgentList from './AgentList.jsx';
import AgentDetail from './AgentDetail.jsx';
import Settings from './Settings.jsx';
import TodoList from './TodoList.jsx';
import PortsDashboard from './PortsDashboard.jsx';
import { getToken } from '../lib/api.js';
import { playNotificationSound, showBrowserNotification } from '../lib/notify.js';

export default function Dashboard() {
  const [view, setView] = useState('welcome');
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [doneAgents, setDoneAgents] = useState(new Set());

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
        playNotificationSound();
        showBrowserNotification('Agent Done', `${msg.agentName} has completed work`);
      }
    };

    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, []);

  const selectAgent = (agentId) => {
    setSelectedAgentId(agentId);
    setView('agent-detail');
    // Clear done state when user views the agent
    setDoneAgents(prev => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
  };

  const goAgents = () => { setView('agents'); setSelectedAgentId(null); };
  const goSettings = () => { setView('settings'); setSelectedAgentId(null); };
  const goTodos = () => { setView('todos'); setSelectedAgentId(null); };
  const goPorts = () => { setView('ports'); setSelectedAgentId(null); };
  const goMenu = () => { setView('welcome'); setSelectedAgentId(null); };

  let content;
  if (view === 'agents') content = <AgentList onSelectAgent={selectAgent} />;
  else if (view === 'agent-detail' && selectedAgentId) content = <AgentDetail agentId={selectedAgentId} />;
  else if (view === 'todos') content = <TodoList />;
  else if (view === 'ports') content = <PortsDashboard />;
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
      onGoMenu={goMenu}
    >
      {content}
    </Layout>
  );
}
