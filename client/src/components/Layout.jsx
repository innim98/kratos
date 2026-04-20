import { useState, useEffect } from 'react';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import MobileNav from './MobileNav.jsx';

export default function Layout({ view, selectedAgentId, doneAgents, onSelectAgent, onGoAgents, onGoSettings, onGoTodos, onGoPorts, onGoMenu, children }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen">
        <Header />
        <MobileNav
          view={view}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          onGoAgents={onGoAgents}
          onGoSettings={onGoSettings}
          onGoTodos={onGoTodos}
          onGoPorts={onGoPorts}
          onGoMenu={onGoMenu}
        >
          {children}
        </MobileNav>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={view}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          doneAgents={doneAgents}
          onGoAgents={onGoAgents}
          onGoSettings={onGoSettings}
          onGoTodos={onGoTodos}
          onGoPorts={onGoPorts}
        />
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
