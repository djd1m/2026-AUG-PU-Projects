interface Rule { allow: boolean; pattern: string }
interface Group { agents: string[]; rules: Rule[] }

function encoded(value: string): string {
  return value.replace(/%[0-9a-f]{2}|[^\x00-\x7f]/giu, (part) => {
    if (part[0] !== '%') return encodeURIComponent(part);
    const char = String.fromCharCode(parseInt(part.slice(1), 16));
    return /^[A-Za-z0-9._~-]$/.test(char) ? char : part.toUpperCase();
  });
}

export function parseRobots(text: string, agent = 'N6bBot'): (url: string) => boolean {
  const groups: Group[] = [];
  let group: Group | undefined;
  let hasRules = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.split('#')[0]!.trim();
    const colon = clean.indexOf(':');
    if (colon < 0) continue;
    const key = clean.slice(0, colon).trim().toLowerCase();
    const value = clean.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [] }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (group && (key === 'allow' || key === 'disallow')) {
      hasRules = true;
      if (value.startsWith('/')) group.rules.push({ allow: key === 'allow', pattern: encoded(value) });
    }
  }
  const token = agent.toLowerCase();
  const specificity = (g: Group) => Math.max(-1, ...g.agents.map((a) => a === '*' ? 0 : a && token.includes(a) ? a.length : -1));
  const best = Math.max(-1, ...groups.map(specificity));
  const rules = best < 0 ? [] : groups.filter((g) => specificity(g) === best).flatMap((g) => g.rules);
  const compiled = rules.map((rule) => {
    const end = rule.pattern.endsWith('$');
    const pattern = end ? rule.pattern.slice(0, -1) : rule.pattern;
    return { allow: rule.allow, end, parts: pattern.split('*'),
      score: pattern.replace(/\*/g, '').replace(/%[A-F0-9]{2}/g, 'x').length };
  });
  return (raw) => {
    const url = new URL(raw);
    const path = encoded(url.pathname + url.search);
    let length = -1;
    let allowed = true;
    for (const rule of compiled) {
      if (matches(path, rule.parts, rule.end) && (rule.score > length || (rule.score === length && rule.allow))) {
        length = rule.score; allowed = rule.allow;
      }
    }
    return allowed;
  };
}

// Each literal is searched once, with no recursive/backtracking wildcard expansion.
// Work is bounded by O(pattern length + path length × literal count).
function matches(path: string, parts: string[], end: boolean): boolean {
  const first = parts[0]!;
  if (!path.startsWith(first)) return false;
  let cursor = first.length;
  if (parts.length === 1) return !end || cursor === path.length;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    if (end && i === parts.length - 1) return path.endsWith(part) && path.length - part.length >= cursor;
    const found = path.indexOf(part, cursor);
    if (found < 0) return false;
    cursor = found + part.length;
  }
  return true;
}
