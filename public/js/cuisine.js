let USER = null;
let socket = null;
let posteActif = 'tous';

function biper() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  } catch (e) { /* audio non disponible */ }
}

async function init() {
  USER = await requireStaffAuth(['chef', 'assistant_chef', 'admin']);
  if (!USER) return;
  document.getElementById('rolePill').textContent = USER.nom + ' · ' + USER.role;

  document.getElementById('selectPoste').addEventListener('change', (e) => { posteActif = e.target.value; charger(); });
  document.getElementById('btnDeconnexion').addEventListener('click', async () => { await apiPost('/api/auth/logout'); window.location.href = '/login.html'; });

  await charger();

  socket = connectSocket();
  if (socket) {
    socket.on('nouvelle_commande_cuisine', () => { biper(); charger(); });
    socket.on('commande_statut', charger);
    socket.on('commande_modifiee', charger);
    socket.on('commande_supprimee', charger);
  }
  setInterval(charger, 15000); // filet de sécurité si un événement socket est manqué
}

function itemsPourPoste(order) {
  if (posteActif === 'tous') return order.items;
  return order.items.filter((it) => it.poste === posteActif);
}

async function charger() {
  const orders = await apiGet('/api/orders');
  const pertinentes = orders.filter((o) => o.envoiCuisine && itemsPourPoste(o).length > 0);

  const today = new Date().toISOString().slice(0, 10);
  const parStatut = { NOUVELLE: [], EN_PREPARATION: [], PRETE: [], TERMINEE: [] };
  pertinentes.forEach((o) => {
    if (o.statut === 'TERMINEE') {
      if (o.dateCreation.slice(0, 10) === today) parStatut.TERMINEE.push(o);
    } else if (parStatut[o.statut]) {
      parStatut[o.statut].push(o);
    }
  });

  document.getElementById('colNouvelle').innerHTML = rendreColonne(parStatut.NOUVELLE, true);
  document.getElementById('colEnPreparation').innerHTML = rendreColonne(parStatut.EN_PREPARATION, false);
  document.getElementById('colPrete').innerHTML = rendreColonne(parStatut.PRETE, false);
  document.getElementById('colTerminee').innerHTML = rendreColonne(parStatut.TERMINEE.slice(0, 8), false, true);

  attacherEvenements();
}

function rendreColonne(orders, urgent, lectureSeule) {
  if (orders.length === 0) return '<div class="empty-state" style="padding:1rem 0;">—</div>';
  return orders.map((o) => `
    <div class="card kds-card ${urgent ? 'urgent' : ''}">
      <h4><span>#${o.numero}</span><span>${formatHeure(o.dateCreation)}</span></h4>
      <div class="tag-poste">${o.table ? 'Table ' + o.table : (o.type === 'a_emporter' ? 'À emporter' : o.type)}</div>
      ${o.client ? `<div style="font-size:0.8rem; color:var(--text-dim); margin-top:0.3rem;">${o.client.nom}</div>` : ''}
      <div style="margin-top:0.6rem;">
        ${itemsPourPoste(o).map((it) => `
          <div class="kds-item-row ${it.statutItem === 'PRETE' ? 'done' : ''}">
            <label style="display:flex; gap:0.4em; align-items:center; cursor:${lectureSeule ? 'default' : 'pointer'};">
              <input type="checkbox" ${it.statutItem === 'PRETE' ? 'checked' : ''} ${lectureSeule ? 'disabled' : ''}
                data-order="${o.id}" data-item="${it.id}" data-cur="${it.statutItem}">
              ${it.quantite}× ${it.nom} ${it.options && it.options.length ? '<em>(' + it.options.join(', ') + ')</em>' : ''}
              ${it.personnalisation ? `<em>— ${it.personnalisation.taille}, ${it.personnalisation.parfum}${it.personnalisation.texte ? ', "' + it.personnalisation.texte + '"' : ''}</em>` : ''}
            </label>
          </div>
        `).join('')}
      </div>
      ${o.notesGenerales ? `<div style="margin-top:0.5rem; font-size:0.82rem; color:var(--accent);">📝 ${o.notesGenerales}</div>` : ''}
      ${!lectureSeule ? `
      <div style="margin-top:0.8rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
        <button class="btn btn--sm btn--ghost" data-annuler="${o.id}">Annuler</button>
      </div>` : ''}
    </div>
  `).join('');
}

function attacherEvenements() {
  document.querySelectorAll('input[type=checkbox][data-item]').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const nouveauStatut = chk.checked ? 'PRETE' : 'EN_PREPARATION';
      try {
        await apiPatch(`/api/orders/${chk.dataset.order}/items/${chk.dataset.item}/statut`, { statutItem: nouveauStatut });
        charger();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
  document.querySelectorAll('[data-annuler]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Annuler cette commande ?')) return;
      try {
        await apiPatch(`/api/orders/${btn.dataset.annuler}/statut`, { statut: 'ANNULEE' });
        charger();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

init();
