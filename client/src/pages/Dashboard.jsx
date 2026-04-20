import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import AgentList from './AgentList.jsx';
import AgentDetail from './AgentDetail.jsx';
import Settings from './Settings.jsx';
import TodoList from './TodoList.jsx';

export default function Dashboard() {
  const [view, setView] = useState('welcome');
  const [selectedAgentId, setSelectedAgentId] = useState(null);

  const selectAgent = (agentId) => {
    setSelectedAgentId(agentId);
    setView('agent-detail');
  };

  const goAgents = () => { setView('agents'); setSelectedAgentId(null); };
  const goSettings = () => { setView('settings'); setSelectedAgentId(null); };
  const goTodos = () => { setView('todos'); setSelectedAgentId(null); };
  const goMenu = () => { setView('welcome'); setSelectedAgentId(null); };

  let content;
  if (view === 'agents') {
    content = <AgentList onSelectAgent={selectAgent} />;
  } else if (view === 'agent-detail' && selectedAgentId) {
    content = <AgentDetail agentId={selectedAgentId} />;
  } else if (view === 'todos') {
    content = <TodoList />;
  } else if (view === 'settings') {
    content = <Settings />;
  } else {
    content = <div className="flex items-center justify-center h-full text-muted-foreground text-lg">Welcome to Kratos</div>;
  }

  return (
    <Layout
      view={view}
      selectedAgentId={selectedAgentId}
      onSelectAgent={selectAgent}
      onGoAgents={goAgents}
      onGoSettings={goSettings}
      onGoTodos={goTodos}
      onGoMenu={goMenu}
    >
      {content}
    </Layout>
  );
}
