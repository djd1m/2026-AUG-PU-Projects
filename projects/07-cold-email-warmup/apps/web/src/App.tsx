import React, { useEffect, useState } from 'react';
import { call, get, loadAuth, saveAuth, type Auth } from './api.ts';

type Screen = 'dash' | 'onboard' | 'campaign' | 'paywall' | 'partner';

const TABS: { id: Screen; title: string }[] = [
  { id: 'dash', title: 'Здоровье' },
  { id: 'onboard', title: 'Подключение' },
  { id: 'campaign', title: 'Кампания' },
  { id: 'paywall', title: 'Тарифы' },
  { id: 'partner', title: 'Партнёр' },
];

const S = {
  body: { margin: 0, font: '15px/1.55 system-ui, "Segoe UI", Roboto, sans-serif', background: '#0f172a', color: '#e2e8f0' } as React.CSSProperties,
  header: { display: 'flex', gap: 14, alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #334155' } as React.CSSProperties,
  logo: { width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#f97316,#ef4444)', display: 'grid', placeItems: 'center', fontSize: 16 } as React.CSSProperties,
  nav: { marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' as const } as React.CSSProperties,
  tab: { padding: '7px 12px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  tabOn: { borderColor: '#f97316', color: '#f97316', fontWeight: 600 } as React.CSSProperties,
  main: { maxWidth: 960, margin: '24px auto', padding: '0 20px' } as React.CSSProperties,
  card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '18px 20px', marginBottom: 14 } as React.CSSProperties,
  h2: { margin: '0 0 6px', fontSize: 17, color: '#f97316' } as React.CSSProperties,
  dim: { color: '#94a3b8', fontSize: 13 } as React.CSSProperties,
  grid: { display: 'flex', gap: 10, flexWrap: 'wrap' as const } as React.CSSProperties,
  stat: { flex: 1, minWidth: 140, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 12 } as React.CSSProperties,
  btn: { background: '#f97316', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', color: '#0b1220' } as React.CSSProperties,
  ghost: { background: 'transparent', color: '#e2e8f0', border: '1px solid #334155' } as React.CSSProperties,
  input: { width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', boxSizing: 'border-box' } as React.CSSProperties,
  banner: { background: '#26130a', borderLeft: '3px solid #f97316', borderRadius: '0 8px 8px 0', padding: '8px 12px', fontSize: 13, margin: '10px 0' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#0f172a' } as React.CSSProperties,
  cell: { border: '1px solid #334155', padding: '6px 8px', textAlign: 'left' } as React.CSSProperties,
};

interface Stats {
  score?: number;
  deliveredPct?: number;
  spamRate?: number;
  label?: string;
  warmupActive?: boolean;
}

export function App() {
  const [auth, setAuth] = useState<Auth>(() => loadAuth() as Auth);
  const [screen, setScreen] = useState<Screen>('dash');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [pool, setPool] = useState<{ pool_size?: number; label?: string } | null>(null);

  useEffect(() => {
    get('/api/pool/public', null).then((r) => setPool(r as { pool_size?: number; label?: string }));
  }, []);

  const doAuth = async (mode: 'register' | 'login') => {
    const res = (await call(`/api/auth/${mode}`, { email, password }, null)) as {
      ok?: boolean; error?: string; access?: string; refresh?: string; user?: { id: string }; next?: string;
    };
    if (res.ok && res.access && res.refresh) {
      const a = { access: res.access, refresh: res.refresh, email, userId: res.user?.id ?? '' };
      saveAuth(a);
      setAuth(a as Auth);
      setMsg(mode === 'register' ? 'аккаунт готов' : 'вошли');
    } else setMsg(res.error ?? 'ошибка');
  };

  if (!auth?.access) {
    return (
      <div style={S.body}>
        <main style={S.main}>
          <div style={S.card}>
            <h2 style={S.h2}>🔥 Грелка — вход</h2>
            <p style={S.dim}>Холодная рассылка, не сжигающая домен: ящики греются в общей сети, здоровье — доказуемо.</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <input style={S.input} placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input style={S.input} type="password" placeholder="пароль (от 8 символов)" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.btn} onClick={() => void doAuth('register')}>Создать аккаунт</button>
                <button style={{ ...S.btn, ...S.ghost }} onClick={() => void doAuth('login')}>Войти</button>
              </div>
              {msg && <p style={S.dim}>{msg}</p>}
              <p style={S.dim}>Публично: ящиков в пуле — {pool?.pool_size ?? '…'} · {pool?.label ?? ''}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={S.body}>
      <header style={S.header}>
        <div style={S.logo}>🔥</div>
        <b>Грелка</b>
        <span style={S.dim}>{auth.email}</span>
        <nav style={S.nav}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setScreen(t.id)} style={{ ...S.tab, ...(screen === t.id ? S.tabOn : {}) }}>{t.title}</button>
          ))}
          <button style={S.tab} onClick={() => { saveAuth(null); setAuth(null); }}>выйти</button>
        </nav>
      </header>
      <main style={S.main}>
        {screen === 'dash' && <Dash auth={auth} />}
        {screen === 'onboard' && <Onboard auth={auth} />}
        {screen === 'campaign' && <Campaign auth={auth} />}
        {screen === 'paywall' && <Paywall auth={auth} />}
        {screen === 'partner' && <Partner auth={auth} />}
      </main>
    </div>
  );
}

function Dash({ auth }: { auth: Auth }) {
  const [domains, setDomains] = useState<{ id: string; name: string; dkim_status: string }[]>([]);
  const [health, setHealth] = useState<Record<string, { stats?: Stats; curve?: { day: string; score: number }[] }>>({});
  useEffect(() => {
    if (!auth) return;
    get('/api/domains', auth).then((r) => {
      const d = (r as { data?: { id: string; name: string; dkim_status: string }[] }).data ?? [];
      setDomains(d);
      d.forEach(async (dom) => {
        const h = (await get(`/api/health/${dom.id}`, auth)) as { stats?: Stats; curve?: { day: string; score: number }[] };
        setHealth((prev) => ({ ...prev, [dom.id]: { stats: h.stats, curve: h.curve } }));
      });
    });
  }, [auth]);
  return (
    <div style={S.card}>
      <h2 style={S.h2}>Здоровье домена — момент ценности</h2>
      {domains.length === 0 && <p style={S.dim}>Домены не привязаны — начните со вкладки «Подключение».</p>}
      {domains.map((d) => {
        const st = health[d.id]?.stats;
        return (
          <div key={d.id} style={{ marginBottom: 14 }}>
            <b>{d.name}</b> <span style={S.dim}>DKIM: {d.dkim_status}</span>
            {st && (
              <div style={{ ...S.grid, marginTop: 8 }}>
                <div style={S.stat}><span style={S.dim}>Score</span><b>{st.score}/100</b></div>
                <div style={S.stat}><span style={S.dim}>Доставляемость</span><b>{st.deliveredPct}%</b></div>
                <div style={S.stat}><span style={S.dim}>Спам-жалобы</span><b>{st.spamRate}%</b></div>
              </div>
            )}
            {st?.label && <p style={S.dim}>{st.label} · score из наблюдаемых событий, без «магии прогрева»</p>}
          </div>
        );
      })}
    </div>
  );
}

function Onboard({ auth }: { auth: Auth }) {
  const [domain, setDomain] = useState('');
  const [mb, setMb] = useState({
    domain_id: '' as string | null,
    address: '', smtp_host: 'smtp.gmail.com', smtp_port: 465,
    imap_host: 'imap.gmail.com', imap_port: 993, login: '', password: '',
  });
  const [log, setLog] = useState('');
  return (
    <div>
      <div style={S.card}>
        <h2 style={S.h2}>1. Домен</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={S.input} placeholder="пример: warm-out.example" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <button style={S.btn} onClick={async () => {
            const r = (await call('/api/domains', { name: domain }, auth)) as { ok?: boolean; error?: string; domain?: { id: string } };
            if (r.ok && r.domain) {
              setMb((p) => ({ ...p, domain_id: r.domain!.id }));
              setLog(`домен ${domain} привязан; DNS-статусы появятся во вкладке «Здоровье»`);
            } else setLog(r.error ?? 'ошибка');
          }}>Привязать</button>
        </div>
      </div>
      <div style={S.card}>
        <h2 style={S.h2}>2. Ящик по SMTP/IMAP (App Password)</h2>
        <div style={{ display: 'grid', gap: 6 }}>
          <input style={S.input} placeholder="адрес ящика" value={mb.address} onChange={(e) => setMb({ ...mb, address: e.target.value, login: e.target.value })} />
          <input style={S.input} type="password" placeholder="App Password" value={mb.password} onChange={(e) => setMb({ ...mb, password: e.target.value })} />
          <button style={S.btn} onClick={async () => {
            const r = (await call('/api/mailboxes', mb, auth)) as { ok?: boolean; error?: string };
            setLog(r.ok ? 'ящик добавлен и проверен живой probe (TLS-only)' : r.error ?? 'ошибка');
          }}>Добавить ящик</button>
        </div>
      </div>
      <div style={S.card}>
        <h2 style={S.h2}>3. Вход в общий пул (сетевой эффект)</h2>
        <div style={S.banner}>Согласие: «мне будут приходить прогрев-письма от участников сети; переписка — только между ящиками сети» (консент v1, запись в аудит).</div>
        <button style={S.btn} onClick={async () => {
          const me = (await get('/api/pool', auth)) as { my_status?: { mailbox_id: string; status: string }[] };
          const first = me.my_status?.[0]?.mailbox_id;
          if (!first) { setLog('пул — это подключённые ящики: сначала добавьте ящик выше'); return; }
          const r = (await call(`/api/mailboxes/${first}/pool`, { consent: true, consent_version: 'pool-consent-v1' }, auth)) as { ok?: boolean; error?: string };
          setLog(r.ok ? 'участие включено; согласие записано в аудит' : r.error ?? 'ошибка');
        }}>Войти в общий пул</button>
        {log && <p style={S.dim}>{log}</p>}
      </div>
    </div>
  );
}

function Campaign({ auth }: { auth: Auth }) {
  const [name, setName] = useState('Первая кампания');
  const [csv, setCsv] = useState('email,first_name\nclient@one.example,Иван\nclient@two.example,Пётр');
  const [template, setTemplate] = useState('Привет, {{first_name}}! Короткое полезное предложение + отписка в футере.');
  const [out, setOut] = useState('');
  const run = async (mode: 'create' | 'recipients' | 'launch') => {
    const id = localStorage.getItem('grelka-campaign-id') ?? '';
    if (mode === 'create') {
      const r = (await call('/api/campaigns', {
        name,
        mailbox_ids: [crypto.randomUUID()],
        recipients_csv: csv,
        steps: [
          { offset_days: 0, template },
          { offset_days: 3, template: `Напомню про предложение, {{first_name}}` },
        ],
      }, auth)) as { ok?: boolean; error?: string; campaign?: { id: string } };
      if (r.campaign) localStorage.setItem('grelka-campaign-id', r.campaign.id);
      setOut(r.ok ? `кампания создана: ${r.campaign?.id}` : r.error ?? 'ошибка');
      return;
    }
    if (mode === 'recipients') {
      const r = (await call(`/api/campaigns/${id}/recipients`, { csv }, auth)) as { ok?: boolean; imported?: number; rejected?: Record<string, number>; error?: string };
      setOut(r.ok ? `принято ${r.imported}; отсечения: ${JSON.stringify(r.rejected ?? {})}` : r.error ?? 'ошибка');
      return;
    }
    const r = (await call(`/api/campaigns/${id}/launch`, { consent_text_version: 'launch-consent-v1 (от имени моих ящиков)' }, auth)) as { ok?: boolean; error?: string; reasons?: string[]; slots_planned?: number };
    setOut(r.ok ? `запущено, слотов в очереди: ${r.slots_planned}` : (r.error ?? 'ошибка') + (r.reasons ? `: ${r.reasons.join('; ')}` : ''));
  };
  return (
    <div style={S.card}>
      <h2 style={S.h2}>Кампания: список → цепочка → запуск</h2>
      <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} />
      <textarea style={{ ...S.input, minHeight: 80, marginTop: 8 }} value={csv} onChange={(e) => setCsv(e.target.value)} />
      <textarea style={{ ...S.input, minHeight: 70, marginTop: 8 }} value={template} onChange={(e) => setTemplate(e.target.value)} />
      <p style={S.dim}>Порядок: «Создать» → «Импорт списка» (стоп-скрин: роли/дубли/стоп-лист) → «Запустить».</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button style={S.btn} onClick={() => void run('create')}>Создать</button>
        <button style={{ ...S.btn, ...S.ghost }} onClick={() => void run('recipients')}>Импорт списка</button>
        <button style={{ ...S.btn, ...S.ghost }} onClick={() => void run('launch')}>Запустить (явное согласие)</button>
      </div>
      {out && <p style={S.dim}>{out}</p>}
    </div>
  );
}

function Paywall({ auth }: { auth: Auth }) {
  const [msg, setMsg] = useState('');
  const go = async (plan: 'base' | 'pro', currency: 'RUB' | 'USD') => {
    const r = (await call('/api/billing/checkout', { plan, currency }, auth)) as { ok?: boolean; checkout_url?: string; error?: string; demo?: boolean };
    if (r.ok && r.checkout_url) {
      if (r.demo) {
        await fetch('/api/webhooks/yookassa', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: { user_ref: auth?.userId, plan } }),
        });
        setMsg(`демо-платёж активирован: план ${plan}`);
      } else window.location.href = r.checkout_url;
    } else setMsg(r.error ?? 'ошибка');
  };
  return (
    <div style={S.card}>
      <h2 style={S.h2}>Тарифы (flat, честные потолки)</h2>
      <div style={S.grid}>
        <div style={S.stat}><span style={S.dim}>Free</span><b>0 ₽</b><br /><span style={S.dim}>1 ящик · 1 кампания · 20/день</span></div>
        <div style={S.stat}><span style={S.dim}>Base</span><b>1 490 ₽ / $19</b><br /><span style={S.dim}>5 ящиков · 3 кампании · 100/день</span></div>
        <div style={S.stat}><span style={S.dim}>Pro</span><b>4 900 ₽ / $59</b><br /><span style={S.dim}>300 ящиков Fair Use · 300/день</span></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button style={S.btn} onClick={() => void go('base', 'RUB')}>Base ₽ (ЮKassa)</button>
        <button style={{ ...S.btn, ...S.ghost }} onClick={() => void go('base', 'USD')}>Base $ (Stripe)</button>
        <button style={{ ...S.btn, ...S.ghost }} onClick={() => void go('pro', 'RUB')}>Pro ₽</button>
      </div>
      {msg && <p style={S.dim}>{msg}</p>}
    </div>
  );
}

function Partner({ auth }: { auth: Auth }) {
  const [data, setData] = useState<{ codes?: { code: string }[]; commissions?: { amount: string; currency: string; payment_external_id: string }[] } | null>(null);
  useEffect(() => {
    get('/api/partner/me', auth).then((r) => setData(r as typeof data));
  }, [auth]);
  return (
    <div style={S.card}>
      <h2 style={S.h2}>Партнёрская программа</h2>
      <p>Ваш код: <b>{data?.codes?.[0]?.code ?? '—'}</b></p>
      <p style={S.dim}>Атрибуция до оплаты, срок 90 дней; self-referral отсекается; невалидный код не подменяет cookie. Приглашение раскрывает вознаграждение.</p>
      <p style={S.dim}>Комиссии от фактических оплат: {data?.commissions?.length ?? 0}</p>
      <button style={S.btn} onClick={async () => {
        await call('/api/partner/codes', {}, auth);
        const r2 = await get('/api/partner/me', auth);
        setData(r2 as typeof data);
      }}>Выпустить код</button>
    </div>
  );
}
