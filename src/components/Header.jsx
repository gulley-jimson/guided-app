import { useEffect, useState } from 'react';

export default function Header() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (window.guided?.getAlwaysOnTop) {
      window.guided.getAlwaysOnTop().then((value) => {
        if (mounted) setAlwaysOnTop(Boolean(value));
      });
    }
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const offAvail = window.guided?.onUpdateAvailable?.(() => setUpdateAvailable(true));
    const offDone = window.guided?.onUpdateDownloaded?.(() => setUpdateAvailable(true));
    return () => {
      try { offAvail?.(); } catch {}
      try { offDone?.(); } catch {}
    };
  }, []);

  async function toggleAlwaysOnTop() {
    if (!window.guided?.setAlwaysOnTop) return;
    const next = !alwaysOnTop;
    const result = await window.guided.setAlwaysOnTop(next);
    setAlwaysOnTop(Boolean(result));
  }

  function minimize() {
    window.guided?.minimize?.();
  }

  function hide() {
    window.guided?.hide?.();
  }

  return (
    <div className="drag-region flex items-center gap-2 px-3 py-2.5 border-b border-panel-border bg-panel-surface/60">
      <Logo />
      <span className="text-sm font-semibold tracking-tight">Guided</span>
      {updateAvailable && (
        <span
          title="Update available — restart Guided to install."
          className="no-drag ml-1 inline-flex items-center gap-1 rounded-full border border-panel-accent/40 bg-panel-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-panel-accent"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-panel-accent" aria-hidden="true" />
          Update available
        </span>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        <ControlButton
          title={alwaysOnTop ? 'Always on top: on' : 'Always on top: off'}
          aria-pressed={alwaysOnTop}
          onClick={toggleAlwaysOnTop}
        >
          <LayersIcon disabled={!alwaysOnTop} />
        </ControlButton>
        <ControlButton title="Minimize" onClick={minimize}>
          <MinimizeIcon />
        </ControlButton>
        <ControlButton title="Hide to tray" onClick={hide}>
          <CloseIcon />
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({ children, title, onClick, ...rest }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="no-drag grid h-6 w-6 place-items-center rounded text-panel-muted transition-colors hover:bg-panel-bg hover:text-panel-text"
      {...rest}
    >
      {children}
    </button>
  );
}

function Logo() {
  return (
    <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-panel-accent to-indigo-500 shadow-sm">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
      </svg>
    </div>
  );
}

function LayersIcon({ disabled }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 transition-opacity ${disabled ? 'opacity-50' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
      {disabled && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="6" y1="18" x2="18" y2="18" />
    </svg>
  );
}

function CloseIcon() {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
