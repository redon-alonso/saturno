import { reactive } from 'vue';

const TOKEN_KEY = 'saturno.token';

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/** Estado compartido de la sesión y datos que usan varias vistas. */
export const session = reactive({
  token: readToken(),
  user: null,
  balance: null, // { vacation, quotas }
  types: [],
  sections: [],
  holidays: [], // [{ date, name, scope }]
  config: { workdayHours: 8 },
});

export function setToken(token) {
  session.token = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* almacenamiento no disponible: la sesión dura lo que la pestaña */ }
}

export function logout() {
  setToken(null);
  session.user = null;
  session.balance = null;
}

export const ROLE_LABELS = { admin: 'Administrador', jefe: 'Jefe de sección', usuario: 'Usuario' };
export const isReviewer = () => ['admin', 'jefe'].includes(session.user?.role);
