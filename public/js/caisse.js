let PRODUITS = [];
let categorieActive = 'Tous';
let draft = []; // commande en cours de saisie (pas encore envoyée à l'API)
let USER = null;
let socket = null;

async function init() {
  USER = await requireStaffAuth(['serveur', 'chef', 'assistant_chef', 'admin']);
  if (!USER) return;
  document.getElementById('rolePill').textContent = USER.nom + ' · ' + USER.role;

  PRODUITS = await apiGet('/api/products');
  construireOnglets();
  afficherMenu();
  chargerCommandesEnCours();

  socket = connectSocket();
  if (socket) {
    socket.on('commande_prete', (commande) => {
      if (commande.servedBy && commande.servedBy.id === USER.id) {
        toast(`✅ Commande #${commande.numero} prête à servir !`, 'success');
      }
      chargerCommandesEnCours();
    });
    socket.on('commande_statut', chargerCommandesEnCours);
    socket.on('commande_creee', chargerCommandesEnCours);
  }
  // Filet de sécurité : si les WebSocket sont bloqués par l'hébergeur, on continue de
  // rafraîchir périodiquement (moins instantané, mais rien ne reste bloqué).
  setInterval(chargerCommandesEnCours, 15000);

  document.getElementById('btnDeconnexion').addEventListener('click', async () => {
    await apiPost('/api/auth/logout');
    window.location.href = '/login.html';
  });

  document.getElementById('btnEnvoyerCuisine').addEventListener('click', envoyerEnCuisine);
}

function construireOnglets() {
  const categories = ['Tous', ...new Set(PRODUITS.map((p) => p.categorie))];
  const container = document.getElementById('tabsCategoriesCaisse');
  container.innerHTML = categories.map((c) => `<button class="tab ${c === categorieActive ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
  container.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => {
    categorieActive = btn.dataset.cat;
    construireOnglets();
    afficherMenu();
  }));
}

function afficherMenu() {
  const liste = (categorieActive === 'Tous' ? PRODUITS : PRODUITS.filter((p) => p.categorie === categorieActive)).filter((p) => p.disponible);
  const grille = document.getElementById('grilleMenuCaisse');
  grille.innerHTML = liste.map((p) => `
    <div class="card product-card">
      <div class="product-title-row"><h3>${p.nom}</h3><span class="price">${formatMontant(p.prix)}</span></div>
      ${p.options.length ? `<select data-option-for="${p.id}">${p.options.map((o) => `<option>${o}</option>`).join('')}</select>` : ''}
      <button class="btn btn--sm" data-add="${p.id}">+ Ajouter</button>
    </div>
  `).join('');
  grille.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', () => {
    const produit = PRODUITS.find((p) => p.id === btn.dataset.add);
    const selectOption = grille.querySelector(`select[data-option-for="${produit.id}"]`);
    ajouterAuDraft(produit, selectOption ? [selectOption.value] : []);
  }));
}

function ajouterAuDraft(produit, options) {
  const existant = draft.find((l) => l.productId === produit.id && JSON.stringify(l.options) === JSON.stringify(options));
  if (existant) existant.quantite += 1;
  else draft.push({ id: 'd' + Date.now() + Math.random().toString(36).slice(2, 5), productId: produit.id, nom: produit.nom, prix: produit.prix, quantite: 1, options: options || [] });
  afficherDraft();
}

function afficherDraft() {
  const container = document.getElementById('draftItems');
  if (draft.length === 0) {
    container.innerHTML = '<div class="empty-state" style="color:#8a8168;">Ajoutez des articles depuis le menu</div>';
  } else {
    container.innerHTML = draft.map((l) => `
      <div class="ticket-row" style="align-items:center;">
        <span>${l.quantite}× ${l.nom}${l.options.length ? ' (' + l.options.join(', ') + ')' : ''}</span>
        <span>
          <button data-moins="${l.id}" style="border:none;background:none;cursor:pointer;">−</button>
          <button data-plus="${l.id}" style="border:none;background:none;cursor:pointer;">+</button>
          <button data-suppr="${l.id}" style="border:none;background:none;cursor:pointer;color:#a83f36;">✕</button>
        </span>
      </div>
    `).join('');
    container.querySelectorAll('[data-plus]').forEach((b) => b.addEventListener('click', () => { modifierQte(b.dataset.plus, 1); }));
    container.querySelectorAll('[data-moins]').forEach((b) => b.addEventListener('click', () => { modifierQte(b.dataset.moins, -1); }));
    container.querySelectorAll('[data-suppr]').forEach((b) => b.addEventListener('click', () => { draft = draft.filter((l) => l.id !== b.dataset.suppr); afficherDraft(); }));
  }
  document.getElementById('draftTotal').textContent = formatMontant(draft.reduce((s, l) => s + l.prix * l.quantite, 0));
}

function modifierQte(id, delta) {
  const l = draft.find((x) => x.id === id);
  if (!l) return;
  l.quantite += delta;
  if (l.quantite <= 0) draft = draft.filter((x) => x.id !== id);
  afficherDraft();
}

async function envoyerEnCuisine() {
  if (draft.length === 0) return toast('Ajoutez au moins un article', 'error');
  const type = document.getElementById('selectTypeService').value;
  const table = document.getElementById('inputTable').value;
  if (type === 'sur_place' && !table) return toast('Indiquez le numéro de table', 'error');

  try {
    const commande = await apiPost('/api/orders', { type, table: type === 'sur_place' ? table : null, items: draft });
    await apiPost(`/api/orders/${commande.id}/envoyer-cuisine`);
    toast(`Commande #${commande.numero} envoyée en cuisine 🔥`, 'success');
    draft = [];
    afficherDraft();
    document.getElementById('inputTable').value = '';
    chargerCommandesEnCours();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function chargerCommandesEnCours() {
  const toutes = await apiGet('/api/orders');
  const mesCommandes = toutes.filter((o) => !['TERMINEE', 'ANNULEE'].includes(o.statut) &&
    (USER.role !== 'serveur' || (o.servedBy && o.servedBy.id === USER.id)));

  const container = document.getElementById('listeCommandesEnCours');
  if (mesCommandes.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucune commande en cours.</div>';
    return;
  }
  const badgeClasses = { NOUVELLE: 'badge--wait', EN_PREPARATION: 'badge--wait', PRETE: 'badge--ok', CONFIRMEE: 'badge--wait' };
  container.innerHTML = mesCommandes.map((o) => `
    <div class="card" style="margin-bottom:0.8rem; display:flex; justify-content:space-between; align-items:center; gap:1rem;">
      <div>
        <strong>#${o.numero}</strong> — ${o.table ? 'Table ' + o.table : (o.type === 'a_emporter' ? 'À emporter' : o.type)}<br>
        <small>${o.items.length} article(s) · ${formatMontant(o.montantTotal)}</small>
      </div>
      <div style="text-align:right;">
        <span class="badge ${badgeClasses[o.statut] || 'badge--wait'}">${o.statut.replace('_', ' ')}</span><br>
        ${o.statut === 'PRETE' ? `<button class="btn btn--sm btn--success" style="margin-top:0.4rem;" data-encaisser="${o.id}">Encaisser</button>` : ''}
      </div>
    </div>
  `).join('');
  container.querySelectorAll('[data-encaisser]').forEach((btn) => btn.addEventListener('click', async () => {
    await apiPatch(`/api/orders/${btn.dataset.encaisser}/statut`, { statut: 'TERMINEE' });
    toast('Commande encaissée et terminée', 'success');
    chargerCommandesEnCours();
  }));
}

init();
