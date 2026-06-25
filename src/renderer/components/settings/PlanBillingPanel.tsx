import React, { useCallback, useEffect, useState } from 'react';

interface Entitlements {
  plan: string;
  status: string;
  entitlements: string[];
  expiresAt?: string;
  userId: string;
  error?: string;
}

interface PlanTier {
  id: string;
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  accent?: boolean;
}

const PLANS: PlanTier[] = [
  {
    id: 'community',
    name: 'Community',
    price: 'Free',
    description: 'Local development with bring-your-own API keys.',
    features: [
      'Monaco editor & terminal',
      'Git panel with full diff',
      'Ollama & local models',
      'MCP tools from caval.jsonc',
    ],
  },
  {
    id: 'pro',
    name: 'Caval Pro',
    price: '$19',
    period: '/mo',
    description: 'Cloud AI routing, agents, and Pro entitlements via Stripe.',
    features: [
      'Everything in Community',
      'Cloud model routing',
      'Composer & agent pipelines',
      'Priority feature access',
    ],
    accent: true,
  },
];

const USAGE_ROWS = [
  { label: 'AI requests', hint: 'Composer, Ask, and agent runs' },
  { label: 'Build minutes', hint: 'Mobile & CI build time' },
  { label: 'Marketplace sync', hint: 'Extension publish & install' },
];

function formatPlanLabel(plan: string): string {
  if (plan === 'pro') return 'Caval Pro';
  if (plan === 'team') return 'Caval Team';
  return 'Community';
}

function formatStatus(status: string): string {
  if (!status || status === 'unknown') return 'Not subscribed';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function PlanBillingPanel() {
  const [data, setData] = useState<Entitlements>({
    plan: 'community',
    status: 'unknown',
    entitlements: [],
    userId: '',
  });
  const [loading, setLoading] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const caval = window.caval;
      const [idRes, entRes] = await Promise.all([
        caval?.billingUserId?.() ?? Promise.resolve({ ok: false as const }),
        caval?.billingEntitlements?.() ?? Promise.resolve({ ok: false as const }),
      ]);
      setData({
        plan: 'plan' in entRes ? (entRes.plan ?? 'community') : 'community',
        status: 'status' in entRes ? (entRes.status ?? 'unknown') : 'unknown',
        entitlements: 'entitlements' in entRes ? (entRes.entitlements ?? []) : [],
        expiresAt: 'expiresAt' in entRes ? entRes.expiresAt : undefined,
        userId: 'userId' in idRes ? (idRes.userId ?? '') : '',
        error: entRes.ok === false && 'error' in entRes ? entRes.error : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const isPro = data.plan === 'pro' || data.plan === 'team';
  const activePlan = data.plan;

  const handleUpgrade = async () => {
    const email = checkoutEmail.trim();
    if (!email) {
      setCheckoutError('Introdu un email pentru facturare Stripe.');
      return;
    }
    const caval = window.caval;
    if (!caval?.billingCheckout) {
      setCheckoutError('Checkout indisponibil — verifică BILLING_API_KEY.');
      return;
    }
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const result = await caval.billingCheckout({ email });
      if (!result.ok) {
        setCheckoutError(result.error ?? 'Checkout failed');
        return;
      }
      window.setTimeout(() => void refresh(), 5000);
    } finally {
      setCheckoutBusy(false);
    }
  };

  const copyUserId = async () => {
    if (!data.userId) return;
    try {
      await navigator.clipboard.writeText(data.userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Current plan summary */}
      <section
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 10,
          border: '1px solid var(--caval-border)',
          background: 'var(--caval-surface)',
        }}
      >
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--caval-text-muted)', marginBottom: 4 }}>
            Current plan
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--caval-accent)' }}>
              {formatPlanLabel(activePlan)}
            </span>
            {loading && (
              <span style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>syncing…</span>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--caval-text-muted)' }}>
            Status: {formatStatus(data.status)}
            {data.expiresAt && (
              <> · Renews {formatDate(data.expiresAt)}</>
            )}
          </div>
          {data.entitlements.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {data.entitlements.map((ent) => (
                <span
                  key={ent}
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'var(--caval-accent-glow)',
                    color: 'var(--caval-accent)',
                  }}
                >
                  {ent}
                </span>
              ))}
            </div>
          )}
          {data.error && (
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#F47067' }}>{data.error}</p>
          )}
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} style={ghostBtnStyle}>
          Refresh
        </button>
      </section>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {PLANS.map((tier) => {
          const isCurrent = activePlan === tier.id || (tier.id === 'community' && !isPro);
          const isProTier = tier.id === 'pro';
          return (
            <article
              key={tier.id}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                border: `1px solid ${isCurrent ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
                background: tier.accent ? 'rgba(47, 191, 113, 0.04)' : 'var(--caval-surface)',
                boxShadow: isCurrent ? '0 0 0 1px var(--caval-accent-glow)' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{tier.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', marginTop: 2 }}>{tier.description}</div>
                </div>
                {isCurrent && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: 'var(--caval-accent-glow)',
                    color: 'var(--caval-accent)',
                  }}>
                    Active
                  </span>
                )}
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{tier.price}</span>
                {tier.period && (
                  <span style={{ fontSize: 12, color: 'var(--caval-text-muted)' }}>{tier.period}</span>
                )}
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 11, color: 'var(--caval-text-muted)', lineHeight: 1.6 }}>
                {tier.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {isProTier && !isPro && (
                <div style={{ marginTop: 14 }}>
                  <input
                    type="email"
                    value={checkoutEmail}
                    onChange={(e) => {
                      setCheckoutEmail(e.target.value);
                      setCheckoutError(null);
                    }}
                    placeholder="Email pentru facturare"
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  {checkoutError && (
                    <p style={{ margin: '0 0 8px', fontSize: 10, color: '#F47067' }}>{checkoutError}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleUpgrade()}
                    disabled={checkoutBusy}
                    style={{ ...primaryBtnStyle, width: '100%' }}
                  >
                    {checkoutBusy ? 'Opening Stripe…' : 'Upgrade to Pro'}
                  </button>
                </div>
              )}
              {isProTier && isPro && (
                <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--caval-accent)', fontWeight: 600 }}>
                  ✓ Subscribed via Stripe
                </p>
              )}
            </article>
          );
        })}
      </div>

      {/* Usage */}
      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Usage</h3>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--caval-text-muted)' }}>
          Cereri AI, build minutes și marketplace sync — sincronizare completă în curând.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {USAGE_ROWS.map((row) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid var(--caval-border)',
                fontSize: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{row.label}</div>
                <div style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>{row.hint}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--caval-text-muted)' }}>—</span>
            </div>
          ))}
        </div>
      </section>

      {/* Account */}
      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Billing account</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <code style={{
            flex: 1,
            minWidth: 0,
            fontSize: 10,
            padding: '6px 8px',
            borderRadius: 6,
            background: 'var(--caval-bg)',
            border: '1px solid var(--caval-border)',
            wordBreak: 'break-all',
          }}>
            {data.userId || '—'}
          </code>
          <button type="button" onClick={() => void copyUserId()} disabled={!data.userId} style={ghostBtnStyle}>
            {copied ? 'Copied' : 'Copy ID'}
          </button>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--caval-text-muted)' }}>
          Acest ID leagă abonamentul Stripe de instanța locală Caval Studio.
        </p>
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--caval-border)',
  background: 'var(--caval-surface)',
};

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--caval-border)',
  background: 'var(--caval-bg)',
  color: 'var(--caval-text)',
  fontSize: 12,
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--caval-accent)',
  color: '#0E0E0F',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 12,
};

const ghostBtnStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--caval-border)',
  background: 'transparent',
  color: 'var(--caval-text-muted)',
  cursor: 'pointer',
  fontSize: 11,
  flexShrink: 0,
};
