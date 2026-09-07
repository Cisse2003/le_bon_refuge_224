let USER = null;
let PRODUITS_CACHE = [];
let INGREDIENTS_CACHE = [];

async function init() {
  USER = await requireStaffAuth(['admin', 'chef', 'assistant_chef']);
  if (!USER) return;
  document.getElementById('rolePill').textContent = USER.nom + ' · ' + USER.role;

  // Certains onglets sont réservés à l'administrateur
  if (USER.role !== 'admin') {
    document.querySelectorAll('[data-panel="utilisateurs"]').forEach((b) => b.remove());
  }

  document.getElementById('btnDeconnexion').addEventListener('click', async () => { await apiPost('/api/auth/logout'); window.location.href = '/login.html'; });

  document.querySelectorAll('#adminNav button').forEach((btn) => {
    btn.addEventListener('click', () => ouvrirPanel(btn.dataset.panel));
  });
  document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('open'))));

  PRODUITS_CACHE = await apiGet('/api/products');
  try { INGREDIENTS_CACHE = await apiGet('/api/ingredients'); } catch (e) { INGREDIENTS_CACHE = []; }

  chargerDashboard();

  document.getElementById('btnNouveauProduit').addEventListener('click', () => ouvrirModaleProduit());
  document.getElementById('formProduit').addEventListener('submit', enregistrerProduit);

  document.getElementById('btnNouvelUtilisateur').addEventListener('click', () => ouvrirModaleUtilisateur());
  document.getElementById('formUtilisateur').addEventListener('submit', enregistrerUtilisateur);

  document.getElementById('btnNouvelIngredient').addEventListener('click', () => ouvrirModaleIngredient());
  document.getElementById('formIngredient').addEventListener('submit', enregistrerIngredient);
  document.getElementById('btnAjouterLigneRecette').addEventListener('click', () => ajouterLigneRecette());

  document.getElementById('filtreStatutCommande').addEventListener('change', chargerCommandes);

  const socket = connectSocket();
  if (socket) {
    ['commande_creee', 'commande_statut', 'commande_modifiee', 'commande_supprimee'].forEach((evt) => {
      socket.on(evt, () => {
        if (document.getElementById('panel-commandes').classList.contains('active')) chargerCommandes();
        if (document.getElementById('panel-dashboard').classList.contains('active')) chargerDashboard();
      });
    });
    socket.on('reservation_creee', () => {
      if (document.getElementById('panel-reservations').classList.contains('active')) chargerReservations();
    });
    socket.on('stock_ingredients_maj', () => {
      if (document.getElementById('panel-ingredients').classList.contains('active')) chargerIngredients();
    });
  }
  // Filet de sécurité : rafraîchit le panneau actif toutes les 20s même sans WebSocket,
  // au cas où l'hébergeur ne relaierait pas correctement les connexions temps réel.
  setInterval(() => {
    const chargeurs = {
      dashboard: chargerDashboard, produits: chargerProduits, stock: chargerStock,
      ingredients: chargerIngredients, commandes: chargerCommandes,
      reservations: chargerReservations, historique: chargerHistorique,
    };
    const actif = document.querySelector('.panel.active');
    if (actif) {
      const nom = actif.id.replace('panel-', '');
      if (chargeurs[nom]) chargeurs[nom]();
    }
  }, 20000);
}

function ouvrirPanel(nom) {
  document.querySelectorAll('#adminNav button').forEach((b) => b.classList.toggle('active', b.dataset.panel === nom));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + nom));
  const chargeurs = {
    dashboard: chargerDashboard, produits: chargerProduits, stock: chargerStock,
    ingredients: chargerIngredients,
    commandes: chargerCommandes, reservations: chargerReservations,
    utilisateurs: chargerUtilisateurs, historique: chargerHistorique,
  };
  if (chargeurs[nom]) chargeurs[nom]();
}

// ---------------- DASHBOARD ----------------
async function chargerDashboard() {
  const s = await apiGet('/api/dashboard/stats');
  document.getElementById('statsGrid').innerHTML = `
    <div class="card stat-card"><div class="num">${formatMontant(s.caJour)}</div><div class="label">CA du jour</div></div>
    <div class="card stat-card"><div class="num">${formatMontant(s.caSemaine)}</div><div class="label">CA de la semaine</div></div>
    <div class="card stat-card"><div class="num">${formatMontant(s.caMois)}</div><div class="label">CA du mois</div></div>
    <div class="card stat-card"><div class="num">${s.nbCommandesJour}</div><div class="label">Commandes du jour</div></div>
    <div class="card stat-card"><div class="num">${formatMontant(s.panierMoyen)}</div><div class="label">Panier moyen</div></div>
    <div class="card stat-card"><div class="num">${s.commandesEnCours}</div><div class="label">Commandes en cours</div></div>
  `;
  document.getElementById('tblTopProduits').innerHTML = s.topProduits.map((p) => `<tr><td>${p.nom}</td><td>${p.quantite}</td></tr>`).join('') || '<tr><td colspan="2">Pas encore de données</td></tr>';
  document.getElementById('tblVentesCategorie').innerHTML = s.ventesCategorie.map((c) => `<tr><td>${c.categorie}</td><td>${formatMontant(c.total)}</td></tr>`).join('') || '<tr><td colspan="2">Pas encore de données</td></tr>';
}

// ---------------- PRODUITS ----------------
async function chargerProduits() {
  PRODUITS_CACHE = await apiGet('/api/products');
  document.getElementById('tblProduits').innerHTML = PRODUITS_CACHE.map((p) => `
    <tr>
      <td>${p.nom}</td><td>${p.categorie}</td><td>${formatMontant(p.prix)}</td><td>${p.poste}</td>
      <td>${p.disponible ? '<span class="badge badge--ok">Oui</span>' : '<span class="badge badge--out">Non</span>'}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn--sm btn--ghost" data-edit="${p.id}">Modifier</button>
        ${USER.role === 'admin' ? `<button class="btn btn--sm btn--danger" data-del="${p.id}">Suppr.</button>` : ''}
      </td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => ouvrirModaleProduit(PRODUITS_CACHE.find((p) => p.id === b.dataset.edit))));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ce produit ?')) return;
    await apiDelete(`/api/products/${b.dataset.del}`);
    chargerProduits();
  }));
}

function ouvrirModaleProduit(produit) {
  const form = document.getElementById('formProduit');
  form.reset();
  document.getElementById('titreModalProduit').textContent = produit ? 'Modifier le produit' : 'Nouveau produit';
  if (produit) {
    form.id.value = produit.id;
    form.nom.value = produit.nom;
    form.categorie.value = produit.categorie;
    form.description.value = produit.description || '';
    form.prix.value = produit.prix;
    form.poste.value = produit.poste;
    form.options.value = (produit.options || []).join(', ');
    form.photo.value = produit.photo || '';
    form.disponible.checked = !!produit.disponible;
  } else {
    form.disponible.checked = true;
  }
  // Rôles restreints : uniquement la case "disponible" est modifiable
  const champsAdmin = ['nom', 'categorie', 'description', 'prix', 'poste', 'options', 'photoFile'];
  champsAdmin.forEach((c) => { if (form[c]) form[c].disabled = USER.role !== 'admin'; });

  document.getElementById('lignesRecette').innerHTML = '';
  (produit && Array.isArray(produit.recette) ? produit.recette : []).forEach((ligne) => ajouterLigneRecette(ligne));
  document.getElementById('btnAjouterLigneRecette').style.display = USER.role === 'admin' ? '' : 'none';

  document.getElementById('modalProduit').classList.add('open');
}

function ajouterLigneRecette(ligne) {
  if (INGREDIENTS_CACHE.length === 0) {
    document.getElementById('lignesRecette').innerHTML = '<p style="color:var(--text-dim); font-size:0.85rem;">Créez d\'abord des ingrédients dans l\'onglet "Ingrédients &amp; inventaire".</p>';
    return;
  }
  const readOnly = USER.role !== 'admin';
  const div = document.createElement('div');
  div.className = 'field-row ligne-recette';
  div.style.alignItems = 'center';
  div.innerHTML = `
    <select class="recette-ingredient" ${readOnly ? 'disabled' : ''}>
      ${INGREDIENTS_CACHE.map((i) => `<option value="${i.id}" ${ligne && ligne.ingredientId === i.id ? 'selected' : ''}>${i.nom} (${i.unite})</option>`).join('')}
    </select>
    <div style="display:flex; gap:0.4rem;">
      <input type="number" class="recette-quantite" min="0" step="1" placeholder="Qté / unité vendue" value="${ligne ? ligne.quantite : ''}" ${readOnly ? 'disabled' : ''}>
      ${!readOnly ? '<button type="button" class="btn btn--sm btn--danger" data-suppr-ligne>✕</button>' : ''}
    </div>
  `;
  document.getElementById('lignesRecette').appendChild(div);
  const btnSuppr = div.querySelector('[data-suppr-ligne]');
  if (btnSuppr) btnSuppr.addEventListener('click', () => div.remove());
}

async function enregistrerProduit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  let photoUrl = fd.get('photo') || '';
  const fichier = fd.get('photoFile');
  if (fichier && fichier.size > 0) {
    const uploadFd = new FormData();
    uploadFd.append('photo', fichier);
    const up = await fetch('/api/upload', { method: 'POST', body: uploadFd });
    const upData = await up.json();
    photoUrl = upData.url || photoUrl;
  }
  const recette = Array.from(document.querySelectorAll('#lignesRecette .ligne-recette')).map((div) => ({
    ingredientId: div.querySelector('.recette-ingredient').value,
    quantite: parseFloat(div.querySelector('.recette-quantite').value) || 0,
  })).filter((l) => l.quantite > 0);
  const payload = {
    nom: fd.get('nom'), categorie: fd.get('categorie'), description: fd.get('description'),
    prix: parseFloat(fd.get('prix')), poste: fd.get('poste'),
    options: fd.get('options') ? fd.get('options').split(',').map((s) => s.trim()).filter(Boolean) : [],
    photo: photoUrl, disponible: fd.get('disponible') === 'on', recette,
  };
  try {
    const id = fd.get('id');
    if (id) await apiPut(`/api/products/${id}`, USER.role === 'admin' ? payload : { disponible: payload.disponible });
    else await apiPost('/api/products', payload);
    document.getElementById('modalProduit').classList.remove('open');
    chargerProduits();
    toast('Produit enregistré', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ---------------- STOCK (produits finis) ----------------
async function chargerStock() {
  const stock = await apiGet('/api/stock');
  document.getElementById('tblStock').innerHTML = stock.map((s) => `
    <tr>
      <td>${s.nom} ${s.alerte ? '<span class="badge badge--alert">Stock faible</span>' : ''}</td>
      <td><input type="number" value="${s.quantite}" style="margin:0; width:90px;" data-qte="${s.productId}"></td>
      <td><input type="number" value="${s.seuilAlerte}" style="margin:0; width:90px;" data-seuil="${s.productId}"></td>
      <td><button class="btn btn--sm" data-save-stock="${s.productId}">Enregistrer</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-save-stock]').forEach((btn) => btn.addEventListener('click', async () => {
    const id = btn.dataset.saveStock;
    const quantite = document.querySelector(`[data-qte="${id}"]`).value;
    const seuilAlerte = document.querySelector(`[data-seuil="${id}"]`).value;
    await apiPut(`/api/stock/${id}`, { quantite, seuilAlerte });
    toast('Stock mis à jour', 'success');
    chargerStock();
  }));
}

// ---------------- INGRÉDIENTS / INVENTAIRE THÉORIQUE ----------------
function formatQuantiteIngredient(unite, valeur) {
  if (unite === 'g') return valeur >= 1000 ? `${(valeur / 1000).toFixed(2).replace(/\.00$/, '')} kg` : `${valeur} g`;
  if (unite === 'ml') return valeur >= 1000 ? `${(valeur / 1000).toFixed(2).replace(/\.00$/, '')} L` : `${valeur} ml`;
  return `${valeur} pièce(s)`;
}

async function chargerIngredients() {
  INGREDIENTS_CACHE = await apiGet('/api/ingredients');
  document.getElementById('tblIngredients').innerHTML = INGREDIENTS_CACHE.map((i) => `
    <tr>
      <td style="display:flex; align-items:center; gap:0.6rem;">
        ${i.photo ? `<img src="${i.photo}" alt="${i.nom}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;">` : `<span style="width:38px;height:38px;border-radius:6px;background:var(--bg-raised-2);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">🥩</span>`}
        <span>${i.nom} ${i.alerte ? '<span class="badge badge--alert">Stock faible</span>' : ''}</span>
      </td>
      <td>${formatQuantiteIngredient(i.unite, i.quantiteStock)}</td>
      <td>${formatQuantiteIngredient(i.unite, i.seuilAlerte)}</td>
      <td><input type="number" placeholder="+ quantité reçue" style="margin:0; width:150px;" data-livraison="${i.id}"></td>
      <td style="white-space:nowrap;">
        <button class="btn btn--sm" data-recevoir="${i.id}">Réceptionner</button>
        <button class="btn btn--sm btn--ghost" data-edit-ing="${i.id}">Modifier</button>
        ${USER.role === 'admin' ? `<button class="btn btn--sm btn--danger" data-del-ing="${i.id}">Suppr.</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">Aucun ingrédient enregistré</td></tr>';

  document.querySelectorAll('[data-recevoir]').forEach((btn) => btn.addEventListener('click', async () => {
    const input = document.querySelector(`[data-livraison="${btn.dataset.recevoir}"]`);
    const ajouter = parseFloat(input.value);
    if (!ajouter || ajouter <= 0) return toast('Indiquez une quantité reçue supérieure à 0', 'error');
    await apiPut(`/api/ingredients/${btn.dataset.recevoir}`, { ajouter });
    toast('Livraison enregistrée, stock mis à jour', 'success');
    chargerIngredients();
  }));
  document.querySelectorAll('[data-edit-ing]').forEach((btn) => btn.addEventListener('click', () => {
    ouvrirModaleIngredient(INGREDIENTS_CACHE.find((i) => i.id === btn.dataset.editIng));
  }));
  document.querySelectorAll('[data-del-ing]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Supprimer cet ingrédient ? Les recettes qui le référencent ne le décompteront plus.')) return;
    await apiDelete(`/api/ingredients/${btn.dataset.delIng}`);
    chargerIngredients();
  }));
}

function ouvrirModaleIngredient(ingredient) {
  const form = document.getElementById('formIngredient');
  form.reset();
  document.getElementById('titreModalIngredient').textContent = ingredient ? "Modifier l'ingrédient" : 'Nouvel ingrédient';
  document.getElementById('apercuPhotoIngredient').innerHTML = '';
  if (ingredient) {
    form.id.value = ingredient.id;
    form.nom.value = ingredient.nom;
    form.unite.value = ingredient.unite;
    form.quantiteStock.value = ingredient.quantiteStock;
    form.seuilAlerte.value = ingredient.seuilAlerte;
    form.photo.value = ingredient.photo || '';
    form.quantiteStock.disabled = true; // le stock se modifie via "Réceptionner", pas ici
    if (ingredient.photo) {
      document.getElementById('apercuPhotoIngredient').innerHTML = `<img src="${ingredient.photo}" alt="" style="width:70px;height:70px;object-fit:cover;border-radius:8px;">`;
    }
  } else {
    form.quantiteStock.disabled = false;
  }
  document.getElementById('modalIngredient').classList.add('open');
}

async function enregistrerIngredient(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  let photoUrl = fd.get('photo') || '';
  const fichier = fd.get('photoFile');
  if (fichier && fichier.size > 0) {
    const uploadFd = new FormData();
    uploadFd.append('photo', fichier);
    const up = await fetch('/api/upload', { method: 'POST', body: uploadFd });
    const upData = await up.json();
    photoUrl = upData.url || photoUrl;
  }
  const id = fd.get('id');
  const payload = {
    nom: fd.get('nom'), unite: fd.get('unite'),
    seuilAlerte: parseFloat(fd.get('seuilAlerte')) || 0,
    photo: photoUrl,
  };
  if (!id) payload.quantiteStock = parseFloat(fd.get('quantiteStock')) || 0;
  try {
    if (id) await apiPut(`/api/ingredients/${id}`, payload);
    else await apiPost('/api/ingredients', payload);
    document.getElementById('modalIngredient').classList.remove('open');
    toast('Ingrédient enregistré', 'success');
    chargerIngredients();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------------- COMMANDES ----------------
async function chargerCommandes() {
  const statut = document.getElementById('filtreStatutCommande').value;
  const orders = await apiGet('/api/orders' + (statut ? `?statut=${statut}` : ''));
  const badgeClasses = { NOUVELLE: 'badge--wait', EN_PREPARATION: 'badge--wait', PRETE: 'badge--ok', TERMINEE: 'badge--ok', ANNULEE: 'badge--out' };
  document.getElementById('tblCommandes').innerHTML = orders.map((o) => `
    <tr>
      <td>#${o.numero}</td><td>${o.type}</td>
      <td>${o.table ? 'Table ' + o.table : (o.client ? o.client.nom : '—')}</td>
      <td>${formatMontant(o.montantTotal)}</td>
      <td><span class="badge ${badgeClasses[o.statut] || ''}">${o.statut}</span></td>
      <td>${formatHeure(o.dateCreation)}</td>
      <td>
        <button class="btn btn--sm btn--ghost" data-voir="${o.id}">Voir</button>
        ${!o.envoiCuisine ? `<button class="btn btn--sm" data-envoyer="${o.id}">Envoyer en cuisine</button>` : ''}
        ${(USER.role !== 'serveur') ? `<button class="btn btn--sm btn--danger" data-suppr-cmd="${o.id}">Suppr.</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7">Aucune commande</td></tr>';

  document.querySelectorAll('[data-voir]').forEach((b) => b.addEventListener('click', () => voirCommande(orders.find((o) => o.id === b.dataset.voir))));
  document.querySelectorAll('[data-envoyer]').forEach((b) => b.addEventListener('click', async () => {
    try { await apiPost(`/api/orders/${b.dataset.envoyer}/envoyer-cuisine`); toast('Commande envoyée en cuisine', 'success'); chargerCommandes(); }
    catch (err) { toast(err.message, 'error'); }
  }));
  document.querySelectorAll('[data-suppr-cmd]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Supprimer définitivement cette commande ?')) return;
    try { await apiDelete(`/api/orders/${b.dataset.supprCmd}`); chargerCommandes(); }
    catch (err) { toast(err.message, 'error'); }
  }));
}

function voirCommande(o) {
  document.getElementById('detailCommandeContenu').innerHTML = `
    <h3 style="font-family:var(--font-body); color:var(--paper);">Commande #${o.numero}</h3>
    <p style="color:var(--text-dim);">${o.type} · ${o.table ? 'Table ' + o.table : ''} · ${new Date(o.dateCreation).toLocaleString('fr-FR')}</p>
    <table><thead><tr><th>Article</th><th>Qté</th><th>Prix</th></tr></thead><tbody>
      ${o.items.map((it) => `<tr><td>${it.nom}${it.options.length ? ' <small>(' + it.options.join(', ') + ')</small>' : ''}</td><td>${it.quantite}</td><td>${formatMontant(it.prix * it.quantite)}</td></tr>`).join('')}
    </tbody></table>
    <p style="text-align:right; font-weight:700; color:var(--paper); margin-top:0.6rem;">Total : ${formatMontant(o.montantTotal)}</p>
    ${o.notesGenerales ? `<p><strong>Note :</strong> ${o.notesGenerales}</p>` : ''}
  `;
  document.getElementById('modalCommandeDetail').classList.add('open');
}

// ---------------- RÉSERVATIONS ----------------
async function chargerReservations() {
  const reservations = await apiGet('/api/reservations');
  document.getElementById('tblReservations').innerHTML = reservations.map((r) => `
    <tr>
      <td>${r.nom}</td><td>${r.tel}</td><td>${r.date}</td><td>${r.heure}</td><td>${r.personnes}</td>
      <td><span class="badge badge--wait">${r.statut}</span></td>
      <td>
        <button class="btn btn--sm btn--success" data-conf="${r.id}">Confirmer</button>
        <button class="btn btn--sm btn--danger" data-annule="${r.id}">Annuler</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7">Aucune réservation</td></tr>';
  document.querySelectorAll('[data-conf]').forEach((b) => b.addEventListener('click', async () => { await apiPatch(`/api/reservations/${b.dataset.conf}`, { statut: 'CONFIRMEE' }); chargerReservations(); }));
  document.querySelectorAll('[data-annule]').forEach((b) => b.addEventListener('click', async () => { await apiPatch(`/api/reservations/${b.dataset.annule}`, { statut: 'ANNULEE' }); chargerReservations(); }));
}

// ---------------- UTILISATEURS ----------------
async function chargerUtilisateurs() {
  const users = await apiGet('/api/users');
  document.getElementById('tblUtilisateurs').innerHTML = users.map((u) => `
    <tr>
      <td>${u.nom}</td><td>${u.username}</td><td>${u.role}</td>
      <td>${u.actif ? '<span class="badge badge--ok">Oui</span>' : '<span class="badge badge--out">Non</span>'}</td>
      <td>
        <button class="btn btn--sm btn--ghost" data-edit-user="${u.id}">Modifier</button>
        <button class="btn btn--sm btn--danger" data-del-user="${u.id}">Suppr.</button>
      </td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-edit-user]').forEach((b) => b.addEventListener('click', () => ouvrirModaleUtilisateur(users.find((u) => u.id === b.dataset.editUser))));
  document.querySelectorAll('[data-del-user]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    await apiDelete(`/api/users/${b.dataset.delUser}`);
    chargerUtilisateurs();
  }));
}

function ouvrirModaleUtilisateur(u) {
  const form = document.getElementById('formUtilisateur');
  form.reset();
  form.id.value = u ? u.id : '';
  if (u) { form.nom.value = u.nom; form.username.value = u.username; form.role.value = u.role; }
  document.getElementById('hintMdp').textContent = u ? '(laisser vide pour ne pas changer)' : '';
  document.getElementById('modalUtilisateur').classList.add('open');
}

async function enregistrerUtilisateur(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get('id');
  const payload = { nom: fd.get('nom'), username: fd.get('username'), role: fd.get('role') };
  if (fd.get('password')) payload.password = fd.get('password');
  try {
    if (id) await apiPut(`/api/users/${id}`, payload);
    else {
      if (!payload.password) return toast('Mot de passe requis pour un nouvel utilisateur', 'error');
      await apiPost('/api/users', payload);
    }
    document.getElementById('modalUtilisateur').classList.remove('open');
    chargerUtilisateurs();
    toast('Utilisateur enregistré', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ---------------- HISTORIQUE ----------------
async function chargerHistorique() {
  const logs = await apiGet('/api/dashboard/logs');
  document.getElementById('tblHistorique').innerHTML = logs.map((l) => `
    <tr>
      <td>${new Date(l.date).toLocaleString('fr-FR')}</td>
      <td>${l.orderNumero ? '#' + l.orderNumero : '—'}</td>
      <td>${l.utilisateur}</td><td>${l.role}</td><td>${l.action}</td>
      <td>${l.champ || ''} ${l.ancienneValeur ? '· ' + l.ancienneValeur + ' → ' + l.nouvelleValeur : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="6">Aucune entrée</td></tr>';
}

init();
