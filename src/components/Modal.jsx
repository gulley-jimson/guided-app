import { useEffect } from 'react';

export default function Modal({ title, onClose, children, width = '320px' }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-3"
      onClick={onClose}
    >
      <div
        className="no-drag flex max-h-full flex-col overflow-hidden rounded-lg border border-panel-border bg-panel-bg shadow-xl"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-panel-border px-3 py-2">
          <span className="text-xs font-medium text-panel-text">{title}</span>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="grid h-5 w-5 place-items-center rounded text-panel-muted transition-colors hover:bg-panel-surface hover:text-panel-text"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}
