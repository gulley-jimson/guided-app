import { useEffect, useRef, useState } from 'react';

const SIGNIN_URL = 'https://guided.build/signin.html?source=app';
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
  deepLinkVerifying,
  deepLinkError,
}) {
  const [draft, setDraft] = useState(apiKey);
  const [savedFlash, setSavedFlash] = useState(false);
  const [launchOnLogin, setLaunchOnLogin] = useState(false);
  const [startupBusy, setStartupBusy] = useState(false);
  const [projectsBase, setProjectsBase] = useState('');

  const [waitingForBrowserAuth, setWaitingForBrowserAuth] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  // 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'
  const [updateStatus, setUpdateStatus] = useState('idle');
  const [appVersion, setAppVersion] = useState('');
  const upToDateTimerRef = useRef(null);

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

  // Once the deep-link callback completes (or surfaces an error), drop the waiting state.
  useEffect(() => {
    if (clerk?.isSignedIn && waitingForBrowserAuth) setWaitingForBrowserAuth(false);
  }, [clerk?.isSignedIn, waitingForBrowserAuth]);

  useEffect(() => {
    if (deepLinkError && waitingForBrowserAuth) setWaitingForBrowserAuth(false);
  }, [deepLinkError, waitingForBrowserAuth]);

  // Auto-updater hooks — flip status as the main process reports progress.
  useEffect(() => {
    const offAvail = window.guided?.onUpdateAvailable?.(() => {
      if (upToDateTimerRef.current) {
        clearTimeout(upToDateTimerRef.current);
        upToDateTimerRef.current = null;
      }
      setUpdateStatus('downloading');
    });
    const offDone = window.guided?.onUpdateDownloaded?.(() => {
      setUpdateStatus('downloaded');
    });
    return () => {
      try { offAvail?.(); } catch {}
      try { offDone?.(); } catch {}
    };
  }, []);

  useEffect(() => () => {
    if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (window.guided?.getVersion) {
      window.guided.getVersion().then((v) => {
        if (!cancelled && typeof v === 'string') setAppVersion(v);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, []);

  async function checkForUpdates() {
    if (!window.guided?.checkForUpdates) {
      setUpdateStatus('error');
      return;
    }
    setUpdateStatus('checking');
    try {
      await window.guided.checkForUpdates();
    } catch {
      setUpdateStatus('error');
      return;
    }
    // electron-updater fires update-available within a couple seconds when there
    // is one. If we don't hear anything, treat that as up-to-date.
    if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
    upToDateTimerRef.current = setTimeout(() => {
      setUpdateStatus((current) => (current === 'checking' ? 'up-to-date' : current));
    }, 4000);
  }

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

  function startBrowserSignIn() {
    setWaitingForBrowserAuth(true);
    openExternal(SIGNIN_URL);
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
  const signedIn = Boolean(clerk?.isSignedIn);

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-5">
      <Section title="Guided Account">
        {!signedIn && (
          <div className="space-y-2">
            <p className="text-[11px] leading-snug text-panel-muted">
              Sign in opens guided.build in your browser. Once you sign in, the app
              will pick it up automatically.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={startBrowserSignIn}
                disabled={waitingForBrowserAuth || deepLinkVerifying}
                className="rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent disabled:opacity-50"
              >
                Sign in to Guided
              </button>
              {(waitingForBrowserAuth || deepLinkVerifying) && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-panel-muted">
                  <Spinner />
                  {deepLinkVerifying ? 'Verifying…' : 'Waiting for browser…'}
                </span>
              )}
            </div>
            {waitingForBrowserAuth && !deepLinkVerifying && (
              <button
                onClick={() => setWaitingForBrowserAuth(false)}
                className="text-[11px] text-panel-muted underline-offset-2 hover:text-panel-text hover:underline"
              >
                Cancel
              </button>
            )}
            {deepLinkError && (
              <p className="text-[11px] text-red-300">{deepLinkError}</p>
            )}
          </div>
        )}

        {signedIn && (
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

      {subscriptionActive ? (
        <section>
          <p className="text-[11px] leading-snug text-panel-muted">
            API key managed by your Guided subscription.
          </p>
        </section>
      ) : (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-[10px] uppercase tracking-wider text-panel-muted">
              Claude API Key
            </h2>
            <button
              type="button"
              onClick={() => openExternal('https://console.anthropic.com/')}
              className="text-[10px] uppercase tracking-wider text-panel-accent hover:text-panel-text"
            >
              Get yours →
            </button>
          </div>
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
        </section>
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

      <Section title="Updates">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-panel-text">
            {appVersion ? `Guided v${appVersion}` : 'Guided'}
          </span>
          <button
            onClick={checkForUpdates}
            disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
            className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-1 text-xs text-panel-text transition-colors hover:border-panel-accent/60 disabled:opacity-50"
          >
            Check for updates
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-panel-muted">
          {updateStatusMessage(updateStatus)}
        </p>
      </Section>
    </div>
  );
}

function updateStatusMessage(status) {
  switch (status) {
    case 'checking':
      return 'Checking…';
    case 'downloading':
      return 'Update available — downloading…';
    case 'downloaded':
      return 'Update downloaded — restart Guided to install.';
    case 'up-to-date':
      return "You're up to date!";
    case 'error':
      return 'Could not check for updates.';
    default:
      return 'Guided will install updates automatically when you restart.';
  }
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Spinner() {
  return (
    <span className="block h-3 w-3 animate-spin rounded-full border-2 border-panel-border border-t-panel-accent" />
  );
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
