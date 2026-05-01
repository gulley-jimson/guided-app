import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';

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

export default function ProjectsTab({
  projects,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}) {
  const [adding, setAdding] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [viewingFiles, setViewingFiles] = useState(null);

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  function handleAction(action, project) {
    setOpenMenuId(null);
    switch (action) {
      case 'show':
        if (window.guided?.showProjectInFolder) {
          window.guided.showProjectInFolder(project.id);
        }
        break;
      case 'files':
        setViewingFiles(project);
        break;
      case 'rename':
        setRenamingId(project.id);
        break;
      case 'delete':
        setPendingDelete(project);
        break;
      default:
        break;
    }
  }

  function commitRename(id, name) {
    onRename?.(id, name);
    setRenamingId(null);
  }

  function confirmDelete() {
    if (pendingDelete) {
      onDelete?.(pendingDelete.id);
    }
    setPendingDelete(null);
  }

  return (
    <div className="relative flex h-full flex-col">
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
              isRenaming={renamingId === p.id}
              isMenuOpen={openMenuId === p.id}
              onClick={() => onSelect(p.id)}
              onMenuToggle={() =>
                setOpenMenuId((cur) => (cur === p.id ? null : p.id))
              }
              onMenuClose={() => setOpenMenuId(null)}
              onAction={(action) => handleAction(action, p)}
              onRenameSubmit={(name) => commitRename(p.id, name)}
              onRenameCancel={() => setRenamingId(null)}
            />
          ))
        )}
      </div>

      {pendingDelete && (
        <ConfirmDeleteModal
          project={pendingDelete}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {viewingFiles && (
        <FilesModal
          project={viewingFiles}
          onClose={() => setViewingFiles(null)}
        />
      )}
    </div>
  );
}

function ProjectRow({
  project,
  active,
  isRenaming,
  isMenuOpen,
  onClick,
  onMenuToggle,
  onMenuClose,
  onAction,
  onRenameSubmit,
  onRenameCancel,
}) {
  const { name, description, updatedAt, messages } = project;
  const count = messages?.length ?? 0;
  const meta = `${count} message${count === 1 ? '' : 's'} · ${relativeTime(updatedAt)}`;

  const cls = active
    ? 'border-panel-accent/50 bg-panel-surface'
    : 'border-transparent hover:border-panel-border hover:bg-panel-surface/60';

  if (isRenaming) {
    return (
      <div className={`rounded-md border px-3 py-2.5 ${active ? 'border-panel-accent/50 bg-panel-surface' : 'border-panel-border bg-panel-surface'}`}>
        <RenameInput
          initialValue={name}
          onSubmit={onRenameSubmit}
          onCancel={onRenameCancel}
        />
        <div className="mt-1.5 text-[11px] text-panel-muted">{meta}</div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group relative w-full cursor-pointer rounded-md border px-3 py-2.5 text-left transition-colors ${cls}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-panel-text truncate pr-6">{name}</div>
          {description && (
            <div className="mt-0.5 text-xs text-panel-muted line-clamp-2 leading-snug">
              {description}
            </div>
          )}
          <div className="mt-1.5 text-[11px] text-panel-muted">{meta}</div>
        </div>
        <KebabButton isOpen={isMenuOpen} onToggle={onMenuToggle} />
      </div>
      {isMenuOpen && (
        <KebabMenu onClose={onMenuClose} onAction={onAction} />
      )}
    </div>
  );
}

function KebabButton({ isOpen, onToggle }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title="Project options"
      aria-label="Project options"
      aria-expanded={isOpen}
      className="no-drag absolute right-2 top-2 grid h-6 w-6 place-items-center rounded text-panel-muted opacity-60 transition-all hover:bg-panel-bg hover:text-panel-text hover:opacity-100 group-hover:opacity-100"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="6" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="18" cy="12" r="1.5" />
      </svg>
    </button>
  );
}

function KebabMenu({ onClose, onAction }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function trigger(action, e) {
    e.stopPropagation();
    onAction(action);
  }

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      className="no-drag absolute right-2 top-9 z-20 w-44 overflow-hidden rounded-md border border-panel-border bg-panel-bg shadow-lg"
      role="menu"
    >
      <MenuItem onClick={(e) => trigger('show', e)} icon={<FolderIcon />}>
        Show in folder
      </MenuItem>
      <MenuItem onClick={(e) => trigger('files', e)} icon={<FilesIcon />}>
        View files
      </MenuItem>
      <MenuItem onClick={(e) => trigger('rename', e)} icon={<RenameIcon />}>
        Rename
      </MenuItem>
      <div className="my-0.5 border-t border-panel-border" />
      <MenuItem
        onClick={(e) => trigger('delete', e)}
        icon={<TrashIcon />}
        danger
      >
        Delete project
      </MenuItem>
    </div>
  );
}

function MenuItem({ children, onClick, icon, danger }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
        danger
          ? 'text-red-300 hover:bg-red-500/10'
          : 'text-panel-text hover:bg-panel-surface'
      }`}
    >
      <span className={danger ? 'text-red-300/80' : 'text-panel-muted'}>{icon}</span>
      <span>{children}</span>
    </button>
  );
}

function RenameInput({ initialValue, onSubmit, onCancel }) {
  const [value, setValue] = useState(initialValue ?? '');
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    if (trimmed === initialValue) {
      onCancel();
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      className="no-drag w-full rounded-md border border-panel-accent/60 bg-panel-bg px-2 py-1 text-sm font-medium text-panel-text outline-none"
    />
  );
}

function ConfirmDeleteModal({ project, onConfirm, onCancel }) {
  return (
    <Modal title="Delete project?" onClose={onCancel}>
      <p className="text-xs leading-relaxed text-panel-muted">
        Delete <span className="font-medium text-panel-text">{project.name}</span>?
        This will also remove its folder and any attached files. This can't be undone.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-1 text-xs text-panel-muted transition-colors hover:text-panel-text"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded-md bg-red-500/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-500"
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}

function FilesModal({ project, onClose }) {
  const [files, setFiles] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.guided?.listProjectFiles) {
        if (!cancelled) setFiles([]);
        return;
      }
      try {
        const list = await window.guided.listProjectFiles(project.id);
        if (cancelled) return;
        const withData = await Promise.all(
          (list ?? []).map(async (f) => {
            try {
              const dataUrl = await window.guided.readProjectImage(project.id, f.name);
              return { ...f, dataUrl };
            } catch {
              return { ...f, dataUrl: null };
            }
          })
        );
        if (!cancelled) setFiles(withData);
      } catch {
        if (!cancelled) setFiles([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  function openFile(file) {
    if (file?.path && window.guided?.openPath) {
      window.guided.openPath(file.path);
    }
  }

  return (
    <Modal title={`Files — ${project.name}`} onClose={onClose}>
      {files === null ? (
        <p className="text-center text-xs text-panel-muted py-4">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-center text-xs text-panel-muted leading-relaxed py-4">
          No files yet.
          <br />
          Images you attach to this project will appear here.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f) => (
            <button
              key={f.name}
              onClick={() => openFile(f)}
              title={f.name}
              className="no-drag overflow-hidden rounded-md border border-panel-border bg-panel-surface transition-colors hover:border-panel-accent/60"
            >
              {f.dataUrl ? (
                <img
                  src={f.dataUrl}
                  alt={f.name}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="aspect-square w-full place-items-center text-[10px] text-panel-muted grid">
                  ?
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function NewProjectForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePath, setBasePath] = useState('');
  const nameRef = useRef(null);
  const descRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    if (window.guided?.getProjectsBase) {
      window.guided.getProjectsBase().then((p) => setBasePath(p ?? ''));
    }
  }, []);

  const canSubmit = name.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    onSubmit(name, description);
  }

  async function changeBase() {
    if (!window.guided?.chooseProjectsBase) return;
    const next = await window.guided.chooseProjectsBase();
    if (next) setBasePath(next);
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
      {basePath && (
        <div className="pt-1 text-[10px] leading-snug text-panel-muted">
          Saving to:{' '}
          <span className="font-mono break-all" title={basePath}>
            {basePath}
          </span>{' '}
          <button
            onClick={changeBase}
            className="ml-1 underline underline-offset-2 hover:text-panel-text"
          >
            Change…
          </button>
        </div>
      )}
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

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
