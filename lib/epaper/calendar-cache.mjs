import { createHash } from 'node:crypto';
import { normalizeCalendar, seoulDate } from './model.mjs';

// A separate key per calendar source prevents mixing different owners' data.
export function redisCalendarStore(source) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const key = 'epaper:calendar:v1:' + createHash('sha256').update(source).digest('hex');
  async function command(args) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(url, {
        method: 'POST', signal: controller.signal, cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) throw Error('Calendar storage HTTP ' + response.status);
      const body = await response.json();
      if (body.error) throw Error('Calendar storage command failed');
      return body.result;
    } finally { clearTimeout(timer); }
  }
  return {
    async read() {
      const result = await command(['GET', key]);
      return result ? JSON.parse(result) : null;
    },
    async write(item) {
      // Do not let an older concurrent invocation overwrite a newer snapshot.
      const script = `local old=redis.call('GET',KEYS[1])
        if old then local ok,v=pcall(cjson.decode,old)
          if ok and tonumber(v.at) and tonumber(v.at)>tonumber(ARGV[1]) then return 0 end end
        redis.call('SET',KEYS[1],ARGV[2]); return 1`;
      await command(['EVAL', script, '1', key, String(item.at), JSON.stringify(item)]);
    }
  };
}

function snapshot(item) {
  if (!item || item.version !== 1 || !Number.isFinite(item.at) || item.at <= 0) return null;
  const raw = item.value;
  if (!raw || !Array.isArray(raw.events) || !Array.isArray(raw.todos) || !Array.isArray(raw.important)) return null;
  try {
    // Normalize against the saved date, so yesterday's rows are not discarded.
    return { version: 1, at: item.at, value: normalizeCalendar(raw, raw.date) };
  } catch { return null; }
}

export function createCalendarReader({ loader, store = null, now = () => Date.now(), log = console.error }) {
  let last = null, pending = null;
  const result = (item, stale) => ({ ...item, value: structuredClone(item.value), stale });
  return function readCalendar() {
    const today = seoulDate(new Date(now()));
    if (last && last.value.date === today && now() - last.at < 30000) {
      return Promise.resolve(result(last, false));
    }
    if (pending) return pending;
    pending = (async () => {
      try {
        const raw = await loader();
        if (raw?.error || !Array.isArray(raw?.events) || !Array.isArray(raw?.todos) || !Array.isArray(raw?.important)) {
          throw Error('Invalid calendar response');
        }
        const value = normalizeCalendar(raw, today);
        if (!value.current) throw Error('Calendar date mismatch');
        last = { version: 1, at: now(), value };
        if (store) {
          try { await store.write(last); }
          catch { log('[calendar] snapshot write failed'); }
        }
        return result(last, false);
      } catch (error) {
        log('[calendar] fetch failed; trying last successful snapshot');
        if (store) {
          try {
            const saved = snapshot(await store.read());
            if (saved && (!last || saved.at > last.at)) last = saved;
          } catch { log('[calendar] snapshot read failed'); }
        }
        if (last) return result(last, true);
        throw error;
      }
    })().finally(() => { pending = null; });
    return pending;
  };
}
