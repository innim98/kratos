import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

export default function Layout({ view, selectedAgentId, onSelectAgent, onGoAgents, onGoSettings, children }) {
  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={view}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          onGoAgents={onGoAgents}
          onGoSettings={onGoSettings}
        />
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
