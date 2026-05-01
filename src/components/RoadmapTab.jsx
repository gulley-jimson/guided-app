export default function RoadmapTab({ project, onMarkComplete, onRegenerate, canGenerate }) {
  if (!project) {
    return (
      <Centered>
        <p className="text-sm text-panel-muted">Open a project to see its roadmap.</p>
      </Centered>
    );
  }

  if (project.roadmapStatus === 'pending') {
    return (
      <Centered>
        <div className="flex items-center gap-2 text-panel-muted">
          <Spinner />
          <span className="text-xs">Building your roadmap…</span>
        </div>
      </Centered>
    );
  }

  if (!project.roadmap) {
    const failed = project.roadmapStatus === 'failed';
    return (
      <Centered>
        <p className="text-sm text-panel-muted">
          {failed ? "Couldn't generate the roadmap." : 'No roadmap for this project yet.'}
        </p>
        {canGenerate && (
          <button
            onClick={onRegenerate}
            className="rounded-md bg-panel-accent/90 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-panel-accent"
          >
            {failed ? 'Try again' : 'Generate now'}
          </button>
        )}
      </Centered>
    );
  }

  const phases = project.roadmap.phases;
  const total = phases.length;
  const done = phases.filter((p) => p.status === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-3 border-b border-panel-border bg-panel-surface/30">
        <div className="mb-2 min-w-0">
          <div className="text-xs font-medium text-panel-text truncate">{project.name}</div>
          {project.description && (
            <div className="text-[10px] text-panel-muted truncate mt-0.5">{project.description}</div>
          )}
        </div>
        <div className="flex items-center justify-between mb-1.5 text-[11px]">
          <span className="text-panel-muted">{done} of {total} complete</span>
          <span className="text-panel-text font-medium">{pct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-panel-bg overflow-hidden">
          <div
            className="h-full bg-panel-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
        {phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            onComplete={() => onMarkComplete(phase.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PhaseCard({ phase, onComplete }) {
  const isDone = phase.status === 'done';
  const isActive = phase.status === 'active';

  const cardClass = [
    'rounded-lg border px-3 py-2.5 transition-colors',
    isActive
      ? 'border-panel-accent/60 bg-panel-surface'
      : isDone
        ? 'border-panel-border bg-panel-surface/40 opacity-70'
        : 'border-panel-border bg-panel-surface/40',
  ].join(' ');

  return (
    <div className={cardClass}>
      <div className="flex items-start gap-2">
        <StatusDot status={phase.status} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${isDone ? 'text-panel-muted' : 'text-panel-text'}`}>
            {phase.title}
          </div>
          {phase.description && (
            <div className="text-[11px] text-panel-muted leading-snug mt-0.5">
              {phase.description}
            </div>
          )}
          {phase.steps?.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-panel-muted leading-snug">
              {phase.steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-panel-muted/50">•</span>
                  <span className="flex-1">{s}</span>
                </li>
              ))}
            </ul>
          )}
          {isActive && (
            <button
              onClick={onComplete}
              className="mt-2.5 rounded-md bg-panel-accent/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-panel-accent"
            >
              Mark complete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  if (status === 'done') {
    return (
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-500/80">
        <CheckIcon />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-panel-accent/90">
        <span className="block h-1.5 w-1.5 rounded-full bg-white" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 block h-4 w-4 shrink-0 rounded-full border border-panel-border" />
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-2.5 w-2.5 text-white"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Spinner() {
  return (
    <span className="block h-3 w-3 animate-spin rounded-full border-2 border-panel-border border-t-panel-accent" />
  );
}

function Centered({ children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      {children}
    </div>
  );
}
