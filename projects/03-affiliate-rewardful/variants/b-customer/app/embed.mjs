const allowedParents = new Set([
  'http://127.0.0.1:13031',
  'http://localhost:13031',
]);

function exactOrigin(value) {
  if (!value || !allowedParents.has(value)) return null;
  try {
    const parsed = new URL(value);
    return parsed.origin === value ? value : null;
  } catch { return null; }
}

function parentFromLocation() {
  const requested = new URLSearchParams(location.search).get('parentOrigin');
  if (requested !== null) return exactOrigin(requested);
  try { return exactOrigin(new URL(document.referrer).origin); } catch { return null; }
}

function exactValueMoment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 3 && keys[0] === 'event' && keys[1] === 'type' && keys[2] === 'version'
    && value.type === 'n3.value-moment' && value.version === 1 && value.event === 'widget_published';
}

export function embedding(onValueMoment) {
  const enabled = new URLSearchParams(location.search).get('embed') === '1';
  if (!enabled) return { enabled:false, valid:true, ready() {}, dismissed() {} };
  const parentOrigin = parentFromLocation();
  if (!parentOrigin || window.parent === window) return { enabled:true, valid:false, parentOrigin:null, ready() {}, dismissed() {} };
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== parentOrigin || !exactValueMoment(event.data)) return;
    onValueMoment();
  });
  return {
    enabled:true,
    valid:true,
    parentOrigin,
    ready() { window.parent.postMessage({ type:'n3.ready', version:1 }, parentOrigin); },
    dismissed() { window.parent.postMessage({ type:'n3.dismissed', version:1 }, parentOrigin); },
  };
}
