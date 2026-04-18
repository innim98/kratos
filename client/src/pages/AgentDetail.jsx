export default function AgentDetail({ agentId }) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Agent #{agentId}</h2>
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Terminal + Webview (Phase 7+)
      </div>
    </div>
  );
}
