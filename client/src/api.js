import { session, logout } from './store.js';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && path !== '/auth/login') {
    logout();
    location.assign('/login');
  }
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

/** Descarga un archivo de la API con la sesión actual (un enlace normal no llevaría el token). */
export async function download(path, filename) {
  const res = await fetch(`/api${path}`, {
    headers: session.token ? { Authorization: `Bearer ${session.token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Error ${res.status}`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Carga los datos de la sesión que usan todas las vistas. */
export async function loadSession() {
  const [user, types, sections, holidays, config] = await Promise.all([
    api('/auth/me'), api('/types'), api('/sections'), api('/holidays'), api('/config'),
  ]);
  Object.assign(session, { user, types, sections, holidays, config });
  await refreshBalance();
}

export async function refreshHolidays() {
  session.holidays = await api('/holidays');
}

export async function refreshBalance() {
  session.balance = await api('/balance');
}
