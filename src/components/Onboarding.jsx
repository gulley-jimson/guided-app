import { useState } from 'react';

const PRICING_URL = 'https://guided.build/pricing';
const ANTHROPIC_CONSOLE_URL = 'https://console.anthropic.com';

export default function Onboarding({ onSubmitKey }) {
  const [stage, setStage] = useState('choose');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function openExternal(url) {
    if (window.guided?.openExternal) {
      window.guided.openExternal(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  }

  async function submitKey() {
    const trimmed = key.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSubmitKey(trimmed);
    } catch (err) {
      setError(err?.message ?? 'Could not save the key.');
      setSaving(false);
    }
  }

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center px-5 py-8 text-center"
      style={{ backgroundColor: '#0f0f13' }}
    >
      <Logo />
      <h1 className="mt-4 text-lg font-semibold text-panel-text">Welcome to Guided</h1>
      <p className="mt-1 max-w-[300px] text-xs leading-relaxed text-panel-muted">
        Your AI learning companion. Let&apos;s get you set up.
      </p>

      {stage === 'choose' && (
        <div className="mt-6 flex w-full max-w-[640px] flex-col gap-3 md:flex-row">
          <Card
            title="Bring your own API key"
            subtitle="Use your Claude API key. Free to start."
            onClick={() => setStage('apiKey')}
          />
          <Card
            title="Get Guided Pro"
            subtitle="No API key needed. $12/mo."
            onClick={() => openExternal(PRICING_URL)}
            featured
          />
        </div>
      )}

      {stage === 'apiKey' && (
        <div className="mt-6 flex w-full max-w-[360px] flex-col gap-2 text-left">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitKey();
              } else if (e.key === 'Escape') {
                setStage('choose');
              }
            }}
            placeholder="sk-ant-…"
            autoFocus
            disabled={saving}
            className="no-drag w-full rounded-md border border-panel-border bg-panel-bg px-2.5 py-2 text-xs font-mono text-panel-text outline-none placeholder:text-panel-muted/70 focus:border-panel-accent/60 disabled:opacity-60"
          />
          {error && <p className="text-[11px] text-red-300">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setStage('choose')}
              disabled={saving}
              className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-1 text-xs text-panel-muted hover:text-panel-text disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={submitKey}
              disabled={!key.trim() || saving}
              className="flex-1 rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => openExternal(ANTHROPIC_CONSOLE_URL)}
            className="mt-2 self-start text-[11px] text-panel-accent transition-opacity hover:opacity-80"
          >
            Get your key at console.anthropic.com →
          </button>
        </div>
      )}
    </div>
  );
}

function Card({ title, subtitle, onClick, featured }) {
  const baseCls =
    'no-drag flex-1 rounded-xl border px-4 py-4 text-left transition-colors';
  const variantCls = featured
    ? 'border-panel-accent/60 bg-panel-accent/10 hover:bg-panel-accent/15'
    : 'border-panel-border bg-panel-surface hover:border-panel-accent/60';
  return (
    <button onClick={onClick} className={`${baseCls} ${variantCls}`}>
      <div className="text-sm font-semibold text-panel-text">{title}</div>
      <div className="mt-1 text-[11px] leading-snug text-panel-muted">{subtitle}</div>
    </button>
  );
}

function Logo() {
  return (
    <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-panel-accent to-indigo-500 shadow-lg">
      <svg
        viewBox="0 0 24 24"
        className="h-7 w-7 text-white"
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
