import { useState } from 'react';

export default function Onboarding({ onSubmitKey }) {
  const [stage, setStage] = useState('choose');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const trimmed = key.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSubmitKey(trimmed);
    } catch (err) {
      setError(err?.message ?? 'Failed to save key.');
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-8 text-center">
      <Logo />
      <h1 className="mt-3 text-base font-semibold text-panel-text">Welcome to Guided</h1>
      <p className="mt-1 max-w-[280px] text-xs leading-relaxed text-panel-muted">
        Your AI companion for learning software through real projects.
      </p>

      {stage === 'choose' && (
        <div className="mt-6 w-full space-y-2">
          <Choice
            title="Connect your Anthropic API key"
            subtitle="Free · bring your own key"
            onClick={() => setStage('apiKey')}
          />
          <Choice
            title="Sign in to Guided"
            subtitle="Coming soon"
            disabled
          />
        </div>
      )}

      {stage === 'apiKey' && (
        <div className="mt-6 w-full space-y-2 text-left">
          <p className="text-[11px] leading-snug text-panel-muted">
            Get a key at console.anthropic.com — it stays on your device.
          </p>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                setStage('choose');
              }
            }}
            placeholder="sk-ant-…"
            autoFocus
            disabled={saving}
            className="no-drag w-full rounded-md border border-panel-border bg-panel-bg px-2.5 py-1.5 text-xs font-mono text-panel-text outline-none placeholder:text-panel-muted/70 focus:border-panel-accent/60 disabled:opacity-60"
          />
          {error && <p className="text-[11px] text-red-300">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setStage('choose')}
              disabled={saving}
              className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-1 text-xs text-panel-muted hover:text-panel-text"
            >
              Back
            </button>
            <button
              onClick={submit}
              disabled={!key.trim() || saving}
              className="flex-1 rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Choice({ title, subtitle, onClick, disabled }) {
  const base =
    'no-drag w-full rounded-lg border px-3 py-3 text-left transition-colors';
  const cls = disabled
    ? `${base} border-panel-border bg-panel-surface/40 opacity-60 cursor-not-allowed`
    : `${base} border-panel-border bg-panel-surface hover:border-panel-accent/60 hover:bg-panel-surface`;
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} className={cls}>
      <div className="text-sm font-medium text-panel-text">{title}</div>
      <div className="mt-0.5 text-[11px] text-panel-muted">{subtitle}</div>
    </button>
  );
}

function Logo() {
  return (
    <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-panel-accent to-indigo-500 shadow-sm">
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6 text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
      </svg>
    </div>
  );
}
