import { useEffect, useRef, useState } from 'react';

function relativeTime(ms) {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ProjectsTab({ projects, activeId, onSelect, onCreate }) {
  const [adding, setAdding] = useState(false);
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex h-full flex-col">
      <div className="no-drag p-2 border-b border-panel-border bg-panel-surface/40">
        {adding ? (
          <NewProjectForm
            onSubmit={(name, description) => {
              onCreate(name, description);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-md border border-panel-border bg-panel-bg px-3 py-1.5 text-xs font-medium text-panel-text transition-colors hover:border-panel-accent/60 hover:bg-panel-surface"
          >
            + New Project
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {sorted.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-panel-muted leading-relaxed">
            No projects yet.
            <br />
            Create one above to get started.
          </div>
        ) : (
          sorted.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              active={p.id === activeId}
              onClick={() => onSelect(p.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project, active, onClick }) {
  const { name, description, updatedAt, messages } = project;
  const count = messages.length;
  const meta = `${count} message${count === 1 ? '' : 's'} · ${relativeTime(updatedAt)}`;

  const cls = active
    ? 'border-panel-accent/50 bg-panel-surface'
    : 'border-transparent hover:border-panel-border hover:bg-panel-surface/60';

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${cls}`}
    >
      <div className="text-sm font-medium text-panel-text truncate">{name}</div>
      {description && (
        <div className="mt-0.5 text-xs text-panel-muted line-clamp-2 leading-snug">
          {description}
        </div>
      )}
      <div className="mt-1.5 text-[11px] text-panel-muted">{meta}</div>
    </button>
  );
}

function NewProjectForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const nameRef = useRef(null);
  const descRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const canSubmit = name.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    onSubmit(name, description);
  }

  return (
    <div className="space-y-2">
      <Field label="Project name">
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              descRef.current?.focus();
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
          placeholder="Coffee shop logo"
          className="no-drag w-full rounded-md border border-panel-border bg-panel-bg px-2.5 py-1.5 text-xs text-panel-text outline-none placeholder:text-panel-muted/70 focus:border-panel-accent/60"
        />
      </Field>
      <Field label="Instructions">
        <textarea
          ref={descRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
          rows={3}
          placeholder="Tell Guided about your project and how you want it to help you"
          className="no-drag w-full resize-none rounded-md border border-panel-border bg-panel-bg px-2.5 py-1.5 text-xs leading-snug text-panel-text outline-none placeholder:text-panel-muted/70 focus:border-panel-accent/60"
        />
      </Field>
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent disabled:opacity-40"
        >
          Create
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-1 text-xs text-panel-muted hover:text-panel-text"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-panel-muted mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
