type Subscriber = (v: boolean) => void;
let state = false;
const subscribers = new Set<Subscriber>();

export function getLoading() {
  return state;
}

export function subscribe(fn: Subscriber) {
  subscribers.add(fn);
  // notificar estado atual imediatamente
  try { fn(state); } catch (e) {}
  return () => subscribers.delete(fn);
}

export function setLoading(v: boolean) {
  state = v;
  if (process.env.NODE_ENV !== 'production') {
    try { console.log(`[loadingStore] setLoading -> ${v}`); } catch (e) {}
  }
  for (const fn of subscribers) {
    try { fn(state); } catch (e) { console.error('loading subscriber error', e); }
  }
}

export async function runWithLoading<T>(fn: () => Promise<T>): Promise<T> {
  setLoading(true);
  try {
    const r = await fn();
    return r;
  } finally {
    setLoading(false);
  }
}
