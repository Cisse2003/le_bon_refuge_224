// Petite couche d'accès à l'API + notifications (utilisée par toutes les pages)

async function api(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* réponse vide (ex: fichier téléchargé) */ }
  if (!res.ok) {
    const message = (data && data.error) || `Erreur ${res.status}`;
    throw new Error(message);
  }
  return data;
}

const apiGet = (url) => api('GET', url);
const apiPost = (url, body) => api('POST', url, body || {});
const apiPut = (url, body) => api('PUT', url, body || {});
const apiPatch = (url, body) => api('PATCH', url, body || {});
const apiDelete = (url) => api('DELETE', url);

function ensureToastContainer() {
  let el = document.querySelector('.toast-container');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

function toast(message, type) {
  const container = ensureToastContainer();
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function formatMontant(n) {
  // Franc guinéen (FG) : pas de décimales, séparateur de milliers "espace" (convention locale/française)
  return Math.round(Number(n || 0)).toLocaleString('fr-FR') + ' FG';
}

function formatHeure(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

async function getCurrentUser() {
  try {
    const { user } = await apiGet('/api/auth/me');
    return user;
  } catch (e) {
    return null;
  }
}

async function requireStaffAuth(rolesAutorises) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  if (rolesAutorises && !rolesAutorises.includes(user.role)) {
    document.body.innerHTML = '<div class="empty-state"><h2>Accès refusé</h2><p>Votre rôle ne permet pas d\'accéder à cette page.</p><a class="btn" href="/">Retour au site</a></div>';
    return null;
  }
  return user;
}

function connectSocket() {
  if (typeof io === 'undefined') return null;
  return io();
}
