import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import IssueList from '../pages/IssueList.jsx';
import IssueDetail from '../pages/IssueDetail.jsx';

export default function IssuesPanel({ agentId }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);

  useEffect(() => {
    apiFetch('/api/projects').then(r => r.json()).then(d => { if (Array.isArray(d)) setProjects(d); });
  }, []);

  useEffect(() => {
    apiFetch('/api/agents').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        const agent = data.find(a => a.id === agentId);
        if (agent?.issue_project) setSelectedProject(agent.issue_project);
      }
    });
  }, [agentId]);

  const handleProjectChange = async (code) => {
    const value = code || null;
    setSelectedProject(value);
    await apiFetch(`/api/agents/${agentId}`, {
      method: 'PUT',
      body: { issue_project: value },
    });
  };

  if (selectedIssue) {
    return (
      <div className="h-full overflow-y-auto p-3">
        <IssueDetail issueKey={selectedIssue} onBack={() => setSelectedIssue(null)} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <select
          value={selectedProject || ''}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="bg-background border border-input rounded px-2 py-1 text-xs"
        >
          <option value="">My Issues</option>
          {projects.map(p => <option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <IssueList
          onSelectIssue={setSelectedIssue}
          agentFilter={selectedProject ? undefined : agentId}
          projectFilter={selectedProject || undefined}
        />
      </div>
    </div>
  );
}
