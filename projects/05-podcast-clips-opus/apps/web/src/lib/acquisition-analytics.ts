/** Optional browser observations. No business action awaits this adapter. */
export const ANALYTICS_READY = 'n5-analytics-ready';
export const ANALYTICS_STORAGE_KEY = 'n5.acquisition.v1';
export const CONSENT_KEY = 'n5.analytics.consent';
const TTL = 30 * 86400000, VISIT_TTL = 30 * 60000;
const PILOT = { utm_source: 'telegram', utm_medium: 'community', utm_campaign: 'n5_pilot', utm_content: 'demo_a' } as const;
export type Goal = 'n5_visit' | 'n5_signup_success' | 'n5_first_clip_ready' | 'n5_payment_confirmed';
export type Route = 'landing' | 'dashboard' | 'video' | 'upgrade' | 'payment_return';
export type Metrika = (id: number, method: string, ...args: unknown[]) => void;
export function counterId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value); return Number.isSafeInteger(id) ? id : null;
}
export function routeCategory(path: string): Route | null {
  if (path === '/') return 'landing';
  if (path === '/dashboard') return 'dashboard';
  if (/^\/dashboard\/videos\/[^/]+$/.test(path)) return 'video';
  if (path === '/upgrade') return 'upgrade';
  if (path === '/upgrade/return') return 'payment_return';
  return null;
}
export function approvedCampaign(search: string): boolean {
  const params = new URLSearchParams(search);
  const utms = [...params.keys()].filter(key => key.startsWith('utm_'));
  return utms.length === 4 && utms.every(key => key in PILOT) && Object.entries(PILOT).every(([key, value]) => params.getAll(key).length === 1 && params.get(key) === value);
}
export function confirmedPayment(requested: string, data: unknown): boolean {
  return !!requested && typeof data === 'object' && data !== null && 'intent_id' in data && data.intent_id === requested && 'status' in data && data.status === 'succeeded';
}
export function availableClip(clips: readonly { status: string; available: boolean }[]): boolean {
  return clips.some(clip => clip.status === 'done' && clip.available === true);
}
/** Closed bridge wire schema; also serialized into the isolated SDK document. */
export function validSdkCall(value: unknown): boolean {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const routes = ['landing', 'dashboard', 'video', 'upgrade', 'payment_return'];
  const goals = ['n5_visit', 'n5_signup_success', 'n5_first_clip_ready', 'n5_payment_confirmed'];
  const url = (v: unknown) => typeof v === 'string' && routes.some(route => v === `https://clipmkr.ru/analytics/${route}`);
  const direct = 'https://clipmkr.ru/analytics/direct';
  const payload = (v: unknown, goal?: unknown) => {
    if (!object(v) || v.schema_version !== 1 || v.pilot !== 'n5_pilot' || typeof v.route !== 'string' || !routes.includes(v.route)) return false;
    if (goal ? v.event !== goal : 'event' in v) return false;
    const tuple: Record<string, string> = { utm_source: 'telegram', utm_medium: 'community', utm_campaign: 'n5_pilot', utm_content: 'demo_a' };
    const keys = Object.keys(v), hasUtm = keys.some(key => key.startsWith('utm_'));
    return keys.every(key => ['schema_version', 'pilot', 'route', ...(goal ? ['event'] : []), ...Object.keys(tuple)].includes(key)) && (!hasUtm || Object.entries(tuple).every(([key, expected]) => v[key] === expected));
  };
  if (!Array.isArray(value) || !Number.isSafeInteger(value[0]) || value[0] <= 0) return false;
  const [, method, arg, options] = value;
  if (method === 'destruct') return value.length === 2;
  if (method === 'reachGoal') return value.length === 4 && goals.includes(arg) && payload(options, arg);
  if (method === 'hit') return value.length === 4 && url(arg) && object(options) && Object.keys(options).length === 3 && options.referer === direct && options.title === 'N5' && payload(options.params);
  if (method !== 'init' || value.length !== 3 || !object(arg)) return false;
  const disabled = ['webvisor', 'clickmap', 'trackLinks', 'trackHash', 'sendTitle', 'ecommerce', 'accurateTrackBounce', 'triggerEvent', 'childIframe'];
  return url(arg.url) && arg.referrer === direct && arg.defer === true && arg.disableYtm === true && disabled.every(key => arg[key] === false) && Object.keys(arg).length === disabled.length + 4;
}
type State = { expires: number; campaign: boolean; captured: boolean; signup: boolean; ready: boolean; visit: number; payments: { id: string; at: number }[] };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Dependencies = { storage: () => Storage; now: () => number; load: (ready: (sdk: Metrika) => void) => () => void };
export function createAcquisitionAnalytics(deps: Dependencies) {
  let id: number | null = null, route: Route | null = null, sdk: Metrika | null = null;
  let stopLoad: (() => void) | null = null, generation = 0, consent = false;
  let queue: (() => void)[] = [], state: State | null = null;
  const safe = (fn: () => void) => { try { fn(); } catch { /* analytics never blocks product */ } };
  function clear() { state = null; safe(() => deps.storage().removeItem(ANALYTICS_STORAGE_KEY)); }
  function save() { safe(() => deps.storage().setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(state))); }
  function read(): State {
    const now = deps.now();
    if (state && state.expires > now) return state;
    let stored: unknown;
    safe(() => { const raw = deps.storage().getItem(ANALYTICS_STORAGE_KEY); if (raw && raw.length < 8192) stored = JSON.parse(raw); });
    const s = stored as State | undefined;
    state = s && Number.isFinite(s.expires) && s.expires > now && s.expires <= now + TTL && typeof s.campaign === 'boolean' && typeof s.captured === 'boolean' && typeof s.signup === 'boolean' && typeof s.ready === 'boolean' && Number.isFinite(s.visit) && s.visit <= now && Array.isArray(s.payments) && s.payments.length <= 20 && s.payments.every(p => p && typeof p.id === 'string' && p.id.length <= 128 && Number.isFinite(p.at) && p.at <= now)
      ? { expires: s.expires, campaign: s.campaign, captured: s.captured, signup: s.signup, ready: s.ready, visit: s.visit, payments: s.payments.filter(p => p.at > now - TTL).map(p => ({ id: p.id, at: p.at })) }
      : { expires: now + TTL, campaign: false, captured: false, signup: false, ready: false, visit: 0, payments: [] };
    return state;
  }
  function payload(goal?: Goal) {
    return { schema_version: 1, pilot: 'n5_pilot', route, ...(goal ? { event: goal } : {}), ...(read().campaign ? PILOT : {}) };
  }
  function send(fn: () => void) {
    if (!consent || !id || !route) return;
    if (sdk) safe(fn); else if (queue.length < 20) queue.push(fn);
  }
  function hit() {
    const current = route;
    send(() => { if (sdk && id && current === route) sdk(id, 'hit', `https://clipmkr.ru/analytics/${current}`, { referer: 'https://clipmkr.ru/analytics/direct', title: 'N5', params: payload() }); });
  }
  function goal(name: Goal, paymentId?: string) {
    if (!consent || !id || !route) return;
    const s = read(), now = deps.now();
    if (name === 'n5_visit') {
      const duplicate = s.visit > now - VISIT_TTL; s.visit = now; save(); if (duplicate) return;
    } else if (name === 'n5_signup_success') { if (s.signup) return; s.signup = true;
    } else if (name === 'n5_first_clip_ready') { if (s.ready) return; s.ready = true;
    } else {
      if (!paymentId || paymentId.length > 128) return;
      s.payments = s.payments.filter(p => p.at > now - TTL);
      if (s.payments.some(p => p.id === paymentId)) return;
      s.payments = [...s.payments, { id: paymentId, at: now }].slice(-20);
    }
    save();
    const data = payload(name);
    send(() => { if (sdk && id) sdk(id, 'reachGoal', name, data); });
  }
  function stop(clearState: boolean) {
    generation++; queue = [];
    if (sdk && id) safe(() => sdk!(id!, 'destruct'));
    sdk = null; if (stopLoad) safe(stopLoad); stopLoad = null;
    if (clearState) clear();
  }
  // Only timestamps are observed; no event targets, keys, coordinates or content.
  function activity(force = false) {
    if (!consent || !id || !route) return;
    const s = read(), now = deps.now();
    // Once expired, the next landing observation starts a new visit.
    if (s.visit > now - VISIT_TTL && (force || now - s.visit >= 1000)) { s.visit = now; save(); }
  }
  function configure(value: number | null, allowed: boolean, path: string, search = '') {
    const nextRoute = routeCategory(path);
    if (id !== value || !allowed || !nextRoute) stop(!allowed);
    id = value; consent = allowed; const changed = nextRoute !== route; route = nextRoute;
    if (!id || !consent || !route) return;
    const s = read();
    if (!s.captured) { s.campaign = approvedCampaign(search); s.captured = true; save(); }
    if (!sdk && !stopLoad) {
      const current = ++generation;
      // Loader callbacks may run synchronously in tests; defer flush until configuration completes.
      try { stopLoad = deps.load(loaded => {
        if (current !== generation || !consent || !id || !route) return;
        sdk = loaded;
        // Even with defer, SDK sends an initialization nohit request; sanitize its URL/referrer too.
        safe(() => sdk!(id!, 'init', { url: `https://clipmkr.ru/analytics/${route}`, referrer: 'https://clipmkr.ru/analytics/direct', defer: true, webvisor: false, clickmap: false, trackLinks: false, trackHash: false, sendTitle: false, ecommerce: false, accurateTrackBounce: false, triggerEvent: false, childIframe: false, disableYtm: true }));
        const pending = queue; queue = []; pending.forEach(fn => safe(fn));
      }); } catch { queue = []; stopLoad = () => {}; }
      hit();
    } else if (changed) hit();
    if (route === 'landing') goal('n5_visit');
    else activity(true);
  }
  return { configure, goal, activity: () => activity(), stop: () => stop(false), withdraw: () => { consent = false; stop(true); } };
}
let bridgeGeneration = 0;
let browserAdapter: ReturnType<typeof createAcquisitionAnalytics> | undefined;
export function browserAnalytics() {
  if (!browserAdapter) browserAdapter = createAcquisitionAnalytics({
    storage: () => window.localStorage, now: Date.now,
    load: ready => {
      // Opaque origin prevents the SDK from observing product forms, DOM or URL.
      const frame = document.createElement('iframe');
      frame.hidden = true; frame.tabIndex = -1; frame.title = 'Аналитика';
      frame.setAttribute('sandbox', 'allow-scripts'); frame.referrerPolicy = 'no-referrer';
      const token = [...crypto.getRandomValues(new Uint32Array(4))].map(n => n.toString(16)).join('');
      const generation = ++bridgeGeneration;
      let active = true, initialized = false;
      const dispose = () => { active = false; clearTimeout(timer); window.removeEventListener('message', receive); frame.remove(); };
      const receive = (event: MessageEvent) => {
        const data = event.data;
        if (!active || initialized || event.source !== frame.contentWindow || !data || data.type !== 'n5-sdk-ready' || data.token !== token || data.generation !== generation) return;
        initialized = true; clearTimeout(timer);
        ready((...call) => { if (active && validSdkCall(call)) frame.contentWindow?.postMessage({ type: 'n5-sdk-call', token, generation, call }, '*'); });
      };
      const timer = setTimeout(dispose, 8000);
      window.addEventListener('message', receive);
      // All interpolation is executor-generated hex/integer/function source, never user content.
      frame.srcdoc = `<!doctype html><meta name="referrer" content="no-referrer"><title>N5</title><base href="https://clipmkr.ru/analytics/"><script>
        const token=${JSON.stringify(token)}, generation=${generation}, valid=${validSdkCall.toString()};
        let counter=null;
        window.ym=function(){if(window.ym.a.length>=20)window.ym.a.shift();window.ym.a.push(Array.from(arguments))};window.ym.a=[];window.ym.l=Date.now();
        addEventListener('message',event=>{const d=event.data;if(event.source!==parent||!d||d.type!=='n5-sdk-call'||d.token!==token||d.generation!==generation||!valid(d.call))return;
          if(d.call[1]==='init'&&counter===null)counter=d.call[0];if(d.call[0]!==counter)return;window.ym(...d.call)});
        const script=document.createElement('script');script.src='https://mc.yandex.ru/metrika/tag.js';script.async=true;script.referrerPolicy='no-referrer';
        script.onload=()=>parent.postMessage({type:'n5-sdk-ready',token,generation},'*');document.head.appendChild(script);
      <\/script>`;
      document.body.appendChild(frame);
      return dispose;
    },
  });
  return browserAdapter;
}
export function observeSignup() { try { browserAnalytics().goal('n5_signup_success'); } catch { /* optional */ } }
export function observeClips(clips: readonly { status: string; available: boolean }[]) {
  try { if (availableClip(clips)) browserAnalytics().goal('n5_first_clip_ready'); } catch { /* optional */ }
}
export function observePayment(requested: string, data: unknown) {
  try { if (confirmedPayment(requested, data)) browserAnalytics().goal('n5_payment_confirmed', requested); } catch { /* optional */ }
}
