import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout.jsx';
import AgentList from './AgentList.jsx';
import AgentDetail from './AgentDetail.jsx';
import Settings from './Settings.jsx';
import TodoList from './TodoList.jsx';
import PortsDashboard from './PortsDashboard.jsx';
import Issues from './Issues.jsx';
import Phases from './Phases.jsx';
import Home from './Home.jsx';
import { getToken, getClientId, apiFetch } from '../lib/api.js';
import { isEmbed } from '../lib/embed.js';
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
  const [notifyMode, setNotifyMode] = useState(() =>
    localStorage.getItem('kratos_notify_mode') || 'all'
  );

  // Refs for WS handler to access latest state
  const selectedAgentIdRef = useRef(selectedAgentId);
  const notifyModeRef = useRef(notifyMode);
  const viewRef = useRef(view);
  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);
  useEffect(() => { notifyModeRef.current = notifyMode; }, [notifyMode]);
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
    localStorage.setItem('kratos_notify_mode', notifyMode);
  }, [notifyMode]);


  // Request notification permission on mount
  useEffect(() => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch {}
  }, []);

  // Acquire lock on initial load if restoring agent-detail view
  useEffect(() => {
    if (view === 'agent-detail' && selectedAgentId) {
      acquireLock(selectedAgentId).then(result => {
        if (result.acquired) {
          if (lockRenewRef.current) clearInterval(lockRenewRef.current);
          lockRenewRef.current = setInterval(() => {
            apiFetch(`/api/agents/${selectedAgentId}/lock/renew`, { method: 'POST', body: { clientId: getClientId() } }).catch(() => {});
          }, 30000);
        }
      });
    }
  }, []); // only on mount

  // Listen for agent-done events via WS
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getToken();
    if (!token) return;

    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`);

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'lock-stolen') {
        const myClientId = getClientId();
        // Only react if we're the one who lost the lock
        if (msg.by && !msg.by.includes(myClientId)) {
          setLockStolen({ by: msg.by });
        }
        return;
      }

      if (msg.type === 'agent-done') {
        setDoneAgents(prev => new Set(prev).add(msg.agentId));
        const mode = notifyModeRef.current;
        const selectedId = selectedAgentIdRef.current;
        const currentView = viewRef.current;
        let shouldNotify = false;
        if (mode === 'all') shouldNotify = true;
        else if (mode === 'focus') shouldNotify = currentView === 'agent-detail' && msg.agentId === selectedId;
        // mode === 'off' → shouldNotify stays false
        if (shouldNotify) {
          playNotificationSound();
          showBrowserNotification('Agent Done', `${msg.agentName} has completed work`);
        } else if (mode !== 'off') {
          setSilentDoneAgents(prev => new Set(prev).add(msg.agentId));
        }
      }
    };

    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, []);

  const [lockStolen, setLockStolen] = useState(null); // { by } or null
  const lockRenewRef = useRef(null);

  const releaseLock = useCallback((agentId) => {
    if (agentId) {
      apiFetch(`/api/agents/${agentId}/lock`, { method: 'DELETE', body: { clientId: getClientId() } }).catch(() => {});
    }
    if (lockRenewRef.current) { clearInterval(lockRenewRef.current); lockRenewRef.current = null; }
  }, []);

  const acquireLock = useCallback(async (agentId) => {
    const clientId = getClientId();
    const res = await apiFetch(`/api/agents/${agentId}/lock`, { method: 'POST', body: { clientId } });
    if (res.ok) {
      // Start renew interval
      if (lockRenewRef.current) clearInterval(lockRenewRef.current);
      lockRenewRef.current = setInterval(() => {
        apiFetch(`/api/agents/${agentId}/lock/renew`, { method: 'POST', body: { clientId } }).catch(() => {});
      }, 30000);
      return { acquired: true };
    }
    const data = await res.json();
    return { acquired: false, holder: data.holder };
  }, []);

  const forceLock = useCallback(async (agentId) => {
    const clientId = getClientId();
    const res = await apiFetch(`/api/agents/${agentId}/lock/force`, { method: 'POST', body: { clientId } });
    if (res.ok) {
      if (lockRenewRef.current) clearInterval(lockRenewRef.current);
      lockRenewRef.current = setInterval(() => {
        apiFetch(`/api/agents/${agentId}/lock/renew`, { method: 'POST', body: { clientId } }).catch(() => {});
      }, 30000);
      return true;
    }
    return false;
  }, []);

  const selectAgent = async (agentId) => {
    // Try to acquire lock
    const result = await acquireLock(agentId);
    if (!result.acquired) {
      const holder = result.holder;
      const msg = `${holder.username}:${holder.clientId.slice(0, 8)} 가 사용 중입니다. 강제로 열까요?`;
      if (window.confirm(msg)) {
        await forceLock(agentId);
      } else {
        return;
      }
    }

    // Release previous agent lock
    if (selectedAgentId && selectedAgentId !== agentId) {
      releaseLock(selectedAgentId);
    }

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

  const leaveAgent = useCallback(() => {
    if (selectedAgentId) releaseLock(selectedAgentId);
    setSelectedAgentId(null);
  }, [selectedAgentId, releaseLock]);

  const goAgents = () => { leaveAgent(); setView('agents'); };
  const goSettings = () => { leaveAgent(); setView('settings'); };
  const goTodos = () => { leaveAgent(); setView('todos'); };
  const goPorts = () => { leaveAgent(); setView('ports'); };
  const goIssues = () => { leaveAgent(); setView('issues'); };
  const goPhases = () => { leaveAgent(); setView('phases'); };
  const goMenu = () => { leaveAgent(); setView('welcome'); };

  // Handle lock-stolen: show alert and go back to agent list
  useEffect(() => {
    if (lockStolen && view === 'agent-detail') {
      window.alert(`${lockStolen.by}로 인해 접속이 끊어졌습니다`);
      if (lockRenewRef.current) { clearInterval(lockRenewRef.current); lockRenewRef.current = null; }
      setSelectedAgentId(null);
      setView('agents');
      setLockStolen(null);
    }
  }, [lockStolen, view]);

  let content;
  if (view === 'agents') content = <AgentList onSelectAgent={selectAgent} />;
  else if (view === 'agent-detail' && selectedAgentId) content = <AgentDetail agentId={selectedAgentId} onGoBack={goAgents} />;
  else if (view === 'todos') content = <TodoList />;
  else if (view === 'ports') content = <PortsDashboard />;
  else if (view === 'issues') content = <Issues />;
  else if (view === 'phases') content = <Phases />;
  else if (view === 'settings') content = <Settings />;
  else content = <Home onSelectAgent={selectAgent} onGoTodos={goTodos} onGoIssues={goIssues} onGoPhases={goPhases} />;

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
      onGoPhases={goPhases}
      onGoMenu={goMenu}
      silentDoneAgents={silentDoneAgents}
      notifyMode={notifyMode}
      onCycleNotifyMode={() => setNotifyMode(m => m === 'all' ? 'focus' : m === 'focus' ? 'off' : 'all')}
    >
      {content}
    </Layout>
  );
}
