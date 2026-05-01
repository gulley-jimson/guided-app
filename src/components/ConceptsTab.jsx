import { useState } from 'react';

export default function ConceptsTab({ project, onDelete, onOpenProjects }) {
  const [search, setSearch] = useState('');

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-panel-muted">Open a project to see its concepts.</p>
        <button
          onClick={onOpenProjects}
          className="rounded-md bg-panel-accent/90 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-panel-accent"
        >
          Open Projects
        </button>
      </div>
    );
  }

  const concepts = project.concepts ?? [];
  const sorted = [...concepts].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  const query = search.trim().toLowerCase();
  const filtered = query
    ? sorted.filter((c) => c.term.toLowerCase().includes(query))
    : sorted;

  return (
    <div className="flex h-full flex-col">
      <div className="no-drag border-b border-panel-border bg-panel-surface/30 p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search concepts…"
          className="w-full rounded-md border border-panel-border bg-panel-bg px-2.5 py-1.5 text-xs text-panel-text outline-none placeholder:text-panel-muted/70 focus:border-panel-accent/60"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
        {concepts.length === 0 ? (
          <EmptyState text="Concepts you learn will appear here automatically." />
        ) : filtered.length === 0 ? (
          <EmptyState text="No concepts match your search." />
        ) : (
          filtered.map((c) => (
            <ConceptCard key={c.id} concept={c} onDelete={() => onDelete(c.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function ConceptCard({ concept, onDelete }) {
  return (
    <div className="group relative rounded-lg border border-panel-border bg-panel-surface px-3 py-2.5 transition-colors hover:border-panel-accent/40">
      <button
        onClick={onDelete}
        title="Delete concept"
        aria-label="Delete concept"
        className="no-drag absolute right-2 top-2 grid h-6 w-6 place-items-center rounded text-panel-muted opacity-0 transition-opacity hover:bg-panel-bg hover:text-red-300 group-hover:opacity-100"
      >
        <TrashIcon />
      </button>
      <div className="pr-6 text-sm font-semibold text-panel-text">{concept.term}</div>
      <div className="mt-1 text-xs leading-snug text-panel-muted">
        {concept.definition}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="px-3 py-8 text-center text-xs leading-relaxed text-panel-muted">
      {text}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
