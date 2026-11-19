// Persistence. Production: Supabase Postgres via its REST API (PostgREST), using the
// service-role key on the server only. Local development without Supabase falls back to a
// JSON file so the app can be run and tested offline. The file store is refused on Vercel.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class DbError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DbError';
    this.code = code; // not_configured | conflict | unavailable
  }
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && key ? { url, key } : null;
}

export function dbMode() {
  if (supabaseConfig()) return 'supabase';
  if (process.env.VERCEL) return 'missing';
  return 'file';
}

// ---------------------------------------------------------------- Supabase adapter

async function sb(method, pathAndQuery, body, { prefer } = {}) {
  const cfg = supabaseConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(`${cfg.url}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: cfg.key,
        // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys must not.
        ...(cfg.key.startsWith('sb_') ? {} : { authorization: `Bearer ${cfg.key}` }),
        'content-type': 'application/json',
        ...(prefer ? { prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    console.error('[db] network error', err.name);
    throw new DbError('unavailable', 'Database unreachable');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    if (detail?.code === '23505') throw new DbError('conflict', 'Duplicate value');
    console.error('[db] error', res.status, detail?.code, detail?.message);
    throw new DbError('unavailable', 'Database error');
  }
  if (res.status === 204) return null;
  return res.json();
}

const supabaseStore = {
  async create(row) {
    const rows = await sb('POST', 'stores', row, { prefer: 'return=representation' });
    return rows[0];
  },
  async get(id) {
    const rows = await sb('GET', `stores?id=eq.${encodeURIComponent(id)}&select=*`);
    return rows[0] || null;
  },
  async getPublishedBySlug(slug) {
    const rows = await sb('GET', `stores?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=id,slug,status,input,content,published_at,updated_at`);
    return rows[0] || null;
  },
  async slugTaken(slug, exceptId) {
    const rows = await sb('GET', `stores?slug=eq.${encodeURIComponent(slug)}&id=neq.${encodeURIComponent(exceptId)}&select=id`);
    return rows.length > 0;
  },
  async update(id, patch) {
    const rows = await sb('PATCH', `stores?id=eq.${encodeURIComponent(id)}`, { ...patch, updated_at: new Date().toISOString() }, { prefer: 'return=representation' });
    return rows[0] || null;
  },
  async logGeneration(row) {
    await sb('POST', 'generations', row);
  },
  async insertEvents(rows) {
    // id is the primary key; duplicates (retries, repeat views) are silently ignored.
    await sb('POST', 'events?on_conflict=id', rows, { prefer: 'resolution=ignore-duplicates,return=minimal' });
  },
  async listEvents(sinceIso) {
    const out = [];
    const page = 1000;
    for (let offset = 0; offset < 50000; offset += page) {
      const rows = await sb('GET', `events?created_at=gte.${encodeURIComponent(sinceIso)}&select=id,name,session_id,store_id,slug,meta,created_at&order=created_at.asc&limit=${page}&offset=${offset}`);
      out.push(...rows);
      if (rows.length < page) break;
    }
    return out;
  },
  async hitRateLimit(bucket, windowSeconds) {
    const n = await sb('POST', 'rpc/hit_rate_limit', { p_bucket: bucket, p_window_seconds: windowSeconds });
    return Number(n);
  },
};

// ---------------------------------------------------------------- local file adapter (dev only)

const FILE = path.join(process.env.DATA_DIR || path.join(process.cwd(), '.data'), 'db.json');
let fileLock = Promise.resolve();

async function readFileDb() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return { stores: [], generations: [] };
  }
}
async function withFileDb(fn) {
  const run = fileLock.then(async () => {
    const db = await readFileDb();
    const result = await fn(db);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(db, null, 2));
    return result;
  });
  fileLock = run.catch(() => {});
  return run;
}

const fileStore = {
  async create(row) {
    return withFileDb((db) => {
      const now = new Date().toISOString();
      const full = { id: randomUUID(), slug: null, status: 'draft', published_at: null, created_at: now, updated_at: now, ...row };
      db.stores.push(full);
      return full;
    });
  },
  async get(id) {
    const db = await readFileDb();
    return db.stores.find((s) => s.id === id) || null;
  },
  async getPublishedBySlug(slug) {
    const db = await readFileDb();
    return db.stores.find((s) => s.slug === slug && s.status === 'published') || null;
  },
  async slugTaken(slug, exceptId) {
    const db = await readFileDb();
    return db.stores.some((s) => s.slug === slug && s.id !== exceptId);
  },
  async update(id, patch) {
    return withFileDb((db) => {
      const s = db.stores.find((x) => x.id === id);
      if (!s) return null;
      if (patch.slug && db.stores.some((x) => x.slug === patch.slug && x.id !== id)) {
        throw new DbError('conflict', 'Duplicate value');
      }
      Object.assign(s, patch, { updated_at: new Date().toISOString() });
      return s;
    });
  },
  async logGeneration(row) {
    return withFileDb((db) => {
      db.generations.push({ id: randomUUID(), created_at: new Date().toISOString(), ...row });
    });
  },
  async insertEvents(rows) {
    return withFileDb((db) => {
      db.events = db.events || [];
      const seen = new Set(db.events.map((e) => e.id));
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        db.events.push({ created_at: new Date().toISOString(), ...r });
      }
    });
  },
  async listEvents(sinceIso) {
    const db = await readFileDb();
    return (db.events || []).filter((e) => e.created_at >= sinceIso);
  },
  async hitRateLimit(bucket, windowSeconds) {
    return withFileDb((db) => {
      db.rate_limits = db.rate_limits || {};
      const win = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = `${bucket}|${win}`;
      db.rate_limits[key] = (db.rate_limits[key] || 0) + 1;
      for (const k of Object.keys(db.rate_limits)) if (Number(k.split('|')[1]) < win - 1) delete db.rate_limits[k];
      return db.rate_limits[key];
    });
  },
};

// ---------------------------------------------------------------- public API

function adapter() {
  const mode = dbMode();
  if (mode === 'supabase') return supabaseStore;
  if (mode === 'file') return fileStore;
  throw new DbError('not_configured', 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
}

export const db = {
  create: (row) => adapter().create(row),
  get: (id) => adapter().get(id),
  getPublishedBySlug: (slug) => adapter().getPublishedBySlug(slug),
  slugTaken: (slug, exceptId) => adapter().slugTaken(slug, exceptId),
  update: (id, patch) => adapter().update(id, patch),
  listEvents: (sinceIso) => adapter().listEvents(sinceIso),
  hitRateLimit: (bucket, windowSeconds) => adapter().hitRateLimit(bucket, windowSeconds),
  insertEvents: async (rows) => {
    if (!rows.length) return;
    try {
      await adapter().insertEvents(rows);
    } catch (err) {
      console.warn('[db] could not record events:', err.message);
    }
  },
  // Logging must never break the creator's flow.
  logGeneration: async (row) => {
    try {
      await adapter().logGeneration(row);
    } catch (err) {
      console.warn('[db] could not log generation:', err.message);
    }
  },
};
