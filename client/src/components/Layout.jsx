import { useState, useEffect } from 'react';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import MobileNav from './MobileNav.jsx';
import { isEmbed } from '../lib/embed.js';

export default function Layout({ view, selectedAgentId, doneAgents, silentDoneAgents, onSelectAgent, onGoAgents, onGoSettings, onGoTodos, onGoPorts, onGoIssues, onGoPhases, onGoMenu, notifyFocusOnly, onToggleNotifyFocusOnly, children }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    localStorage.getItem('kratos_sidebar_collapsed') === 'true'
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('kratos_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  if (isEmbed) {
    const isDetail = view === 'agent-detail';
    if (isDetail) {
      // Agent detail: no sidebar, full screen content
      return (
        <div className="flex flex-col h-screen">
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      );
    }
    // Other views: show navigation
    if (isMobile) {
      return (
        <div className="flex flex-col h-screen">
          <MobileNav
            view={view}
            selectedAgentId={selectedAgentId}
            onSelectAgent={onSelectAgent}
            onGoAgents={onGoAgents}
            onGoSettings={onGoSettings}
            onGoTodos={onGoTodos}
            onGoPorts={onGoPorts}
            onGoIssues={onGoIssues}
            onGoPhases={onGoPhases}
            onGoMenu={onGoMenu}
          >
            {children}
          </MobileNav>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-screen">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            view={view}
            selectedAgentId={selectedAgentId}
            onSelectAgent={onSelectAgent}
            doneAgents={doneAgents}
            silentDoneAgents={silentDoneAgents}
            onGoAgents={onGoAgents}
            onGoSettings={onGoSettings}
            onGoTodos={onGoTodos}
            onGoPorts={onGoPorts}
            onGoIssues={onGoIssues}
            onGoPhases={onGoPhases}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(c => !c)}
          />
          <main className="flex-1 p-6 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen">
        <Header notifyFocusOnly={notifyFocusOnly} onToggleNotifyFocusOnly={onToggleNotifyFocusOnly} onGoHome={onGoMenu} />
        <MobileNav
          view={view}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          onGoAgents={onGoAgents}
          onGoSettings={onGoSettings}
          onGoTodos={onGoTodos}
          onGoPorts={onGoPorts}
          onGoIssues={onGoIssues}
          onGoPhases={onGoPhases}
          onGoMenu={onGoMenu}
        >
          {children}
        </MobileNav>
      </div>
    );
  }

  const isAgentDetail = view === 'agent-detail';
  const showPadding = !isAgentDetail || !sidebarCollapsed;

  return (
    <div className="flex flex-col h-screen">
      <Header notifyFocusOnly={notifyFocusOnly} onToggleNotifyFocusOnly={onToggleNotifyFocusOnly} onGoHome={onGoMenu} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={view}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          doneAgents={doneAgents}
          silentDoneAgents={silentDoneAgents}
          onGoAgents={onGoAgents}
          onGoSettings={onGoSettings}
          onGoTodos={onGoTodos}
          onGoPorts={onGoPorts}
          onGoIssues={onGoIssues}
          onGoPhases={onGoPhases}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        />
        <main className={showPadding ? 'flex-1 p-6 overflow-y-auto' : 'flex-1 overflow-y-auto'}>
          {children}
        </main>
      </div>
    </div>
  );
}
