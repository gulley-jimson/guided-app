import { useEffect, useRef, useState } from 'react';
import { SignIn } from '@clerk/clerk-react';

const SUBSCRIPTION_POLL_INTERVAL_MS = 5000;
const SUBSCRIPTION_POLL_MAX_ATTEMPTS = 24; // 24 × 5s = 2 minutes

export default function Onboarding({ onSubmitKey, onSubscribeComplete, clerk, backendUrl }) {
  const [stage, setStage] = useState('choose');

  // BYOK state
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Subscribe state
  const [chosenPlan, setChosenPlan] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [waitTimedOut, setWaitTimedOut] = useState(false);
  const pollTimerRef = useRef(null);

  // When Clerk reports a signed-in user, advance the subscribe flow to the plan picker.
  useEffect(() => {
    if (stage === 'signin' && clerk?.isSignedIn) {
      setStage('plan');
    }
  }, [stage, clerk?.isSignedIn]);

  // While in 'waiting', poll the backend to detect subscription activation.
  useEffect(() => {
    if (stage !== 'waiting') return;
    if (!clerk?.userId) return;

    let attempts = 0;
    let cancelled = false;

    async function check() {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await fetch(`${backendUrl}/subscription/${encodeURIComponent(clerk.userId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.active) {
            cancelled = true;
            onSubscribeComplete?.({ plan: data.plan ?? chosenPlan ?? 'monthly' });
            return;
          }
        }
      } catch {
        // Ignore — try again.
      }
      if (attempts >= SUBSCRIPTION_POLL_MAX_ATTEMPTS) {
        if (!cancelled) setWaitTimedOut(true);
        return;
      }
      pollTimerRef.current = setTimeout(check, SUBSCRIPTION_POLL_INTERVAL_MS);
    }

    check();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [stage, clerk?.userId, backendUrl, onSubscribeComplete, chosenPlan]);

  async function submitKey() {
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

  async function startCheckout(plan) {
    if (checkoutBusy) return;
    setChosenPlan(plan);
    setCheckoutError('');
    setCheckoutBusy(true);
    try {
      const token = await clerk.getToken();
      const res = await fetch(`${backendUrl}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, plan }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'Could not start checkout.');
      }
      if (window.guided?.openExternal) {
        await window.guided.openExternal(data.url);
      } else if (typeof window !== 'undefined') {
        window.open(data.url, '_blank', 'noopener');
      }
      setStage('waiting');
    } catch (err) {
      setCheckoutError(err?.message ?? 'Could not start checkout.');
    } finally {
      setCheckoutBusy(false);
    }
  }

  function retryWait() {
    setWaitTimedOut(false);
    setStage('plan');
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-8 text-center">
      <Logo />
      <h1 className="mt-3 text-base font-semibold text-panel-text">
        {stage === 'plan' || stage === 'waiting'
          ? chosenPlan === 'yearly' || stage === 'plan'
            ? 'Pick a plan'
            : 'Almost there'
          : 'Welcome to Guided'}
      </h1>
      <p className="mt-1 max-w-[280px] text-xs leading-relaxed text-panel-muted">
        {stage === 'choose' && 'Your AI companion for learning software through real projects.'}
        {stage === 'apiKey' && 'Drop in your Anthropic API key to get going.'}
        {stage === 'signin' && 'Sign in or create an account to subscribe.'}
        {stage === 'plan' && 'Cancel anytime. Yearly saves you a few months.'}
        {stage === 'waiting' && 'Complete checkout in your browser — we’ll auto-detect when payment is confirmed.'}
      </p>

      {stage === 'choose' && (
        <div className="mt-6 w-full space-y-2">
          <Choice
            title="Connect your Anthropic API key"
            subtitle="Free · bring your own key"
            onClick={() => setStage('apiKey')}
          />
          <Choice
            title="Subscribe to Guided"
            subtitle={
              clerk?.available
                ? 'From $12/mo · includes API access'
                : 'Configure CLERK_PUBLISHABLE_KEY to enable'
            }
            disabled={!clerk?.available}
            onClick={() => setStage('signin')}
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
                submitKey();
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
            <SecondaryButton onClick={() => setStage('choose')} disabled={saving}>
              Back
            </SecondaryButton>
            <PrimaryButton
              onClick={submitKey}
              disabled={!key.trim() || saving}
              className="flex-1"
            >
              {saving ? 'Saving…' : 'Save & continue'}
            </PrimaryButton>
          </div>
        </div>
      )}

      {stage === 'signin' && (
        <div className="mt-5 w-full">
          {clerk?.available ? (
            <div className="no-drag flex justify-center">
              <SignIn routing="virtual" />
            </div>
          ) : (
            <p className="text-[11px] text-red-300">
              Clerk is not configured. Set CLERK_PUBLISHABLE_KEY in .env.
            </p>
          )}
          <div className="mt-3">
            <SecondaryButton onClick={() => setStage('choose')}>Back</SecondaryButton>
          </div>
        </div>
      )}

      {stage === 'plan' && (
        <div className="mt-5 w-full space-y-2">
          <PlanCard
            plan="monthly"
            price="$12"
            period="/month"
            description="Cancel anytime."
            onSelect={() => startCheckout('monthly')}
            disabled={checkoutBusy}
          />
          <PlanCard
            plan="yearly"
            price="$99"
            period="/year"
            description="Save ~31% — about $8.25/month."
            badge="Best Value"
            onSelect={() => startCheckout('yearly')}
            disabled={checkoutBusy}
          />
          {checkoutError && (
            <p className="text-[11px] text-red-300">{checkoutError}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <SecondaryButton
              onClick={async () => {
                try { await clerk?.signOut?.(); } catch {}
                setStage('choose');
              }}
            >
              Back
            </SecondaryButton>
          </div>
        </div>
      )}

      {stage === 'waiting' && (
        <div className="mt-5 w-full space-y-3 text-left">
          {waitTimedOut ? (
            <>
              <p className="text-[11px] leading-snug text-panel-muted">
                We didn’t see a confirmed payment yet. If you completed checkout in
                your browser, give it another moment — we’ll keep checking.
              </p>
              <div className="flex items-center gap-2">
                <PrimaryButton onClick={retryWait} className="flex-1">
                  Check again
                </PrimaryButton>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 text-panel-muted">
                <Spinner />
                <span className="text-xs">Waiting for payment…</span>
              </div>
              <p className="text-[11px] text-center leading-snug text-panel-muted">
                Complete checkout in the browser tab we just opened.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({ title, subtitle, onClick, disabled }) {
  const base = 'no-drag w-full rounded-lg border px-3 py-3 text-left transition-colors';
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

function PlanCard({ plan, price, period, description, badge, onSelect, disabled }) {
  const ringCls = badge
    ? 'border-panel-accent/60 bg-panel-accent/10 hover:bg-panel-accent/15'
    : 'border-panel-border bg-panel-surface hover:border-panel-accent/60';
  return (
    <button
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={`no-drag w-full rounded-lg border px-3 py-3 text-left transition-colors disabled:opacity-50 ${ringCls}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-panel-text capitalize">{plan}</div>
        {badge && (
          <span className="rounded-full bg-panel-accent/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-panel-text">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-semibold text-panel-text">{price}</span>
        <span className="text-[11px] text-panel-muted">{period}</span>
      </div>
      {description && (
        <div className="mt-0.5 text-[11px] text-panel-muted">{description}</div>
      )}
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-panel-border bg-panel-bg px-2.5 py-1 text-xs text-panel-muted hover:text-panel-text disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span className="block h-3 w-3 animate-spin rounded-full border-2 border-panel-border border-t-panel-accent" />
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
