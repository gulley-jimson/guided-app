import { useEffect, useState } from 'react';
import { SignIn } from '@clerk/clerk-react';
import Modal from './Modal.jsx';

const PRICING_URL = 'https://guided.build/pricing.html';
const ACCOUNT_URL = 'https://guided.build/account.html';

export default function SettingsTab({
  apiKey,
  envApiKey,
  onSaveKey,
  theme,
  onThemeChange,
  clerk,
  subscriptionActive,
  subscriptionPlan,
  onSignOutGuided,
  backendUrl: _backendUrl,
}) {
  const [draft, setDraft] = useState(apiKey);
  const [savedFlash, setSavedFlash] = useState(false);
  const [launchOnLogin, setLaunchOnLogin] = useState(false);
  const [startupBusy, setStartupBusy] = useState(false);
  const [projectsBase, setProjectsBase] = useState('');

  const [signinOpen, setSigninOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  useEffect(() => {
    setDraft(apiKey);
  }, [apiKey]);

  useEffect(() => {
    let cancelled = false;
    if (window.guided?.getLaunchAtStartup) {
      window.guided.getLaunchAtStartup().then((value) => {
        if (!cancelled) setLaunchOnLogin(Boolean(value));
      });
    }
    if (window.guided?.getProjectsBase) {
      window.guided.getProjectsBase().then((value) => {
        if (!cancelled) setProjectsBase(value ?? '');
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-close the sign-in modal once Clerk reports the user as signed in.
  useEffect(() => {
    if (signinOpen && clerk?.isSignedIn) setSigninOpen(false);
  }, [signinOpen, clerk?.isSignedIn]);

  async function changeProjectsBase() {
    if (!window.guided?.chooseProjectsBase) return;
    const next = await window.guided.chooseProjectsBase();
    if (next) setProjectsBase(next);
  }

  async function toggleLaunchOnLogin() {
    if (startupBusy || !window.guided?.setLaunchAtStartup) return;
    setStartupBusy(true);
    try {
      const next = !launchOnLogin;
      const result = await window.guided.setLaunchAtStartup(next);
      setLaunchOnLogin(Boolean(result));
    } finally {
      setStartupBusy(false);
    }
  }

  function save() {
    onSaveKey(draft.trim());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function openExternal(url) {
    if (window.guided?.openExternal) {
      window.guided.openExternal(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  }

  async function handleSignOut() {
    if (signOutBusy) return;
    setSignOutBusy(true);
    try {
      await onSignOutGuided?.();
    } finally {
      setSignOutBusy(false);
    }
  }

  const usingEnvKey = !apiKey && Boolean(envApiKey);
  const clerkAvailable = Boolean(clerk?.available);
  const signedIn = Boolean(clerk?.isSignedIn);

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-5">
      <Section title="Guided Account">
        {!clerkAvailable && (
          <p className="text-[11px] leading-snug text-panel-muted">
            Sign-in is unavailable. Set CLERK_PUBLISHABLE_KEY in .env to enable Guided
            accounts and subscriptions.
          </p>
        )}

        {clerkAvailable && !signedIn && (
          <div className="space-y-2">
            <p className="text-[11px] leading-snug text-panel-muted">
              Sign in to manage your subscription and let Guided handle API access for you.
            </p>
            <button
              onClick={() => setSigninOpen(true)}
              className="rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent"
            >
              Sign in to Guided
            </button>
          </div>
        )}

        {clerkAvailable && signedIn && (
          <div className="space-y-2">
            <div className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-2">
              <div className="text-xs text-panel-text break-all">
                {clerk?.email ?? 'Signed in'}
              </div>
              <div className="mt-0.5 text-[11px] text-panel-muted">
                {subscriptionActive
                  ? subscriptionPlan
                    ? `${capitalize(subscriptionPlan)} plan · active`
                    : 'Subscription active'
                  : 'No active subscription'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {subscriptionActive ? (
                <button
                  onClick={() => openExternal(ACCOUNT_URL)}
                  className="rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent"
                >
                  Manage account
                </button>
              ) : (
                <button
                  onClick={() => openExternal(PRICING_URL)}
                  className="rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent"
                >
                  Get Guided Pro
                </button>
              )}
              <button
                onClick={handleSignOut}
                disabled={signOutBusy}
                className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-1 text-xs text-panel-muted hover:text-panel-text disabled:opacity-50"
              >
                Sign out
              </button>
            </div>

            <p className="text-[11px] leading-snug text-panel-muted">
              {subscriptionActive
                ? 'Opens guided.build/account in your browser to manage billing.'
                : 'Opens guided.build/pricing in your browser to subscribe.'}
            </p>
          </div>
        )}
      </Section>

      {!subscriptionActive && (
        <Section title="API Key">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={usingEnvKey ? 'Using key from .env' : 'sk-ant-…'}
            className="no-drag w-full rounded-md border border-panel-border bg-panel-bg px-2.5 py-1.5 text-xs font-mono text-panel-text outline-none placeholder:text-panel-muted/70 focus:border-panel-accent/60"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={save}
              disabled={draft === apiKey}
              className="rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent disabled:opacity-40"
            >
              Save
            </button>
            {apiKey && (
              <button
                onClick={() => onSaveKey('')}
                className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-1 text-xs text-panel-muted hover:text-panel-text"
              >
                Clear
              </button>
            )}
            {savedFlash && (
              <span className="text-[11px] text-emerald-400">Saved.</span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-panel-muted leading-snug">
            Your key is stored locally and never shared.
            {usingEnvKey && ' Currently falling back to the key in .env.'}
          </p>
        </Section>
      )}

      <Section title="Theme">
        <ThemeToggle value={theme} onChange={onThemeChange} />
      </Section>

      <Section title="Startup">
        <label className="no-drag flex cursor-pointer items-center gap-2">
          <Switch
            checked={launchOnLogin}
            disabled={startupBusy}
            onClick={toggleLaunchOnLogin}
          />
          <span className="text-xs text-panel-text">Launch Guided when I log in.</span>
        </label>
      </Section>

      <Section title="Project Location">
        <p className="break-all rounded-md border border-panel-border bg-panel-bg px-2.5 py-1.5 font-mono text-[11px] leading-snug text-panel-text">
          {projectsBase || 'Loading…'}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={changeProjectsBase}
            className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-1 text-xs text-panel-text transition-colors hover:border-panel-accent/60"
          >
            Change…
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-panel-muted">
          Where new project folders are created. Existing projects stay where they are.
        </p>
      </Section>

      <Section title="Keyboard">
        <p className="text-[11px] leading-snug text-panel-muted">
          Press{' '}
          <kbd className="rounded border border-panel-border bg-panel-bg px-1 py-0.5 font-mono text-[10px] text-panel-text">
            Ctrl+Shift+G
          </kbd>{' '}
          anywhere to show or hide Guided.
        </p>
      </Section>

      {signinOpen && (
        <Modal title="Sign in to Guided" onClose={() => setSigninOpen(false)} width="340px">
          {clerkAvailable ? (
            <div className="no-drag flex justify-center">
              <SignIn routing="virtual" />
            </div>
          ) : (
            <p className="text-[11px] text-red-300">
              Clerk is not configured. Set CLERK_PUBLISHABLE_KEY in .env.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Switch({ checked, disabled, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={[
        'no-drag relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-panel-accent' : 'bg-panel-border',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      <span
        className={[
          'block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-[10px] uppercase tracking-wider text-panel-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ThemeToggle({ value, onChange }) {
  const opts = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
  ];
  return (
    <div className="no-drag inline-flex rounded-md border border-panel-border bg-panel-bg p-0.5">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={[
              'px-3 py-1 text-xs rounded transition-colors',
              active
                ? 'bg-panel-surface text-panel-text shadow-sm'
                : 'text-panel-muted hover:text-panel-text',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
