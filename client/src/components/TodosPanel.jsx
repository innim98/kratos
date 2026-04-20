import TodoList from '../pages/TodoList.jsx';

export default function TodosPanel({ agentId }) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <TodoList agentFilter={agentId} />
    </div>
  );
}
