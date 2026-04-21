import { useState } from 'react';
import IssueList from './IssueList.jsx';
import IssueDetail from './IssueDetail.jsx';

export default function Issues() {
  const [selectedIssue, setSelectedIssue] = useState(null);

  if (selectedIssue) {
    return <IssueDetail issueKey={selectedIssue} onBack={() => setSelectedIssue(null)} />;
  }

  return <IssueList onSelectIssue={setSelectedIssue} />;
}
