// ==== Configuration à adapter par le restaurant ====
const NUMERO_WHATSAPP = '33123456789'; // format international sans "+" ni espaces, pour les liens wa.me
const NUMERO_TELEPHONE = '+33 1 23 45 67 89'; // affiché et utilisé pour le lien "tel:"
const LIEN_TIKTOK = 'https://www.tiktok.com/@lebonrefuge';
const LIEN_FACEBOOK = 'https://www.facebook.com/lebonrefuge';

// ==== État ====
let PRODUITS = [];
let categorieActive = 'Tous';
let panier = JSON.parse(localStorage.getItem('lbc_panier') || '[]');

function sauvegarderPanier() {
  localStorage.setItem('lbc_panier', JSON.stringify(panier));
  majBadgePanier();
}

function majBadgePanier() {
  const total = panier.reduce((s, it) => s + it.quantite, 0);
  const badge = document.getElementById('cartBadge');
  badge.textContent = total;
  badge.style.display = total > 0 ? 'flex' : 'none';
}

// ==== Chargement des produits ====
async function chargerProduits() {
  PRODUITS = await apiGet('/api/products');
  construireOnglets();
  afficherMenu();
  afficherPopulaires();
  remplirParfumsGateau();
}

function construireOnglets() {
  const categories = ['Tous', ...new Set(PRODUITS.map((p) => p.categorie))];
  const container = document.getElementById('tabsCategories');
  container.innerHTML = categories.map((c) =>
    `<button class="tab ${c === categorieActive ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  container.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      categorieActive = btn.dataset.cat;
      construireOnglets();
      afficherMenu();
    });
  });
}

function afficherMenu() {
  const liste = categorieActive === 'Tous' ? PRODUITS : PRODUITS.filter((p) => p.categorie === categorieActive);
  const grille = document.getElementById('grilleMenu');
  if (liste.length === 0) {
    grille.innerHTML = '<div class="empty-state">Aucun produit dans cette catégorie pour le moment.</div>';
    return;
  }
  grille.innerHTML = liste.map((p) => `
    <div class="card product-card">
      ${p.photo ? `<img class="product-photo" src="${p.photo}" alt="${p.nom}">` : `<div class="product-photo placeholder">🍽</div>`}
      <div class="product-title-row">
        <h3>${p.nom}</h3>
        <span class="price">${formatMontant(p.prix)}</span>
      </div>
      <p style="font-size:0.88rem; margin:0;">${p.description || ''}</p>
      ${!p.disponible ? '<span class="badge badge--out">Indisponible</span>' :
        `<button class="btn btn--sm" data-add="${p.id}">Ajouter au panier</button>`}
    </div>
  `).join('');

  grille.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const produit = PRODUITS.find((p) => p.id === btn.dataset.add);
      if (produit.personnalisable) {
        ouvrirModale('modalGateau');
      } else {
        ajouterAuPanier(produit, 1, []);
        toast(`${produit.nom} ajouté au panier`, 'success');
      }
    });
  });
}

function afficherPopulaires() {
  const top = PRODUITS.filter((p) => ['Plats', 'Fast-food', 'Pizzas'].includes(p.categorie) && p.disponible).slice(0, 3);
  document.getElementById('platsPopulaires').innerHTML = top.map((p) => `
    <div class="ticket-row"><span>${p.nom}</span><span>${formatMontant(p.prix)}</span></div>
  `).join('');
}

function remplirParfumsGateau() {
  const gateau = PRODUITS.find((p) => p.personnalisable);
  const select = document.getElementById('selectParfumGateau');
  if (!gateau || !select) return;
  select.innerHTML = gateau.options.map((o) => `<option value="${o}">${o}</option>`).join('');
}

// ==== Panier ====
function ajouterAuPanier(produit, quantite, options, personnalisation) {
  panier.push({
    id: 'l' + Date.now() + Math.random().toString(36).slice(2, 6),
    productId: produit.id,
    nom: produit.nom,
    prix: produit.prix,
    quantite,
    options: options || [],
    personnalisation: personnalisation || null,
  });
  sauvegarderPanier();
  afficherPanier();
}

function retirerDuPanier(ligneId) {
  panier = panier.filter((l) => l.id !== ligneId);
  sauvegarderPanier();
  afficherPanier();
}

function changerQuantite(ligneId, delta) {
  const ligne = panier.find((l) => l.id === ligneId);
  if (!ligne) return;
  ligne.quantite += delta;
  if (ligne.quantite <= 0) return retirerDuPanier(ligneId);
  sauvegarderPanier();
  afficherPanier();
}

function totalPanier() {
  return panier.reduce((s, l) => s + l.prix * l.quantite, 0);
}

function afficherPanier() {
  const body = document.getElementById('cartBody');
  if (panier.length === 0) {
    body.innerHTML = '<div class="empty-state">Votre panier est vide.</div>';
  } else {
    body.innerHTML = panier.map((l) => `
      <div class="cart-item">
        <div>
          <strong>${l.nom}</strong><br>
          ${l.options.length ? `<small>${l.options.join(', ')}</small><br>` : ''}
          ${l.personnalisation ? `<small>${l.personnalisation.taille} · ${l.personnalisation.parfum} · retrait ${l.personnalisation.date} ${l.personnalisation.heure}</small><br>` : ''}
          <small>${formatMontant(l.prix)} / unité</small>
        </div>
        <div style="text-align:right;">
          <div class="qty-control">
            <button data-moins="${l.id}">−</button>
            <span>${l.quantite}</span>
            <button data-plus="${l.id}">+</button>
          </div>
          <small><a href="#" data-suppr="${l.id}" style="color:var(--danger);">supprimer</a></small>
        </div>
      </div>
    `).join('');
    body.querySelectorAll('[data-plus]').forEach((b) => b.addEventListener('click', () => changerQuantite(b.dataset.plus, 1)));
    body.querySelectorAll('[data-moins]').forEach((b) => b.addEventListener('click', () => changerQuantite(b.dataset.moins, -1)));
    body.querySelectorAll('[data-suppr]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); retirerDuPanier(b.dataset.suppr); }));
  }
  document.getElementById('cartTotal').textContent = formatMontant(totalPanier());
  majBadgePanier();
}

// ==== Ouverture / fermeture UI ====
function ouvrirPanier() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('overlay').classList.add('open');
}
function fermerPanier() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}
function ouvrirModale(id) { document.getElementById(id).classList.add('open'); }
function fermerModales() { document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('open')); }

// ==== Liens WhatsApp / appel génériques ====
function lienWhatsapp(message) {
  return `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
function lienAppel() {
  return `tel:${NUMERO_TELEPHONE.replace(/\s+/g, '')}`;
}

// ==== Initialisation ====
document.addEventListener('DOMContentLoaded', () => {
  chargerProduits();
  afficherPanier();

  document.getElementById('lienWhatsappHero').href = lienWhatsapp("Bonjour Le Bon Refuge, je souhaiterais avoir des informations 🙂");
  document.getElementById('lienWhatsappContact').href = lienWhatsapp("Bonjour Le Bon Refuge !");
  document.getElementById('lienWhatsappReservation').href = lienWhatsapp("Bonjour, je souhaite réserver une table.");
  document.getElementById('lienAppelHero').href = lienAppel();
  document.getElementById('lienAppelContact').href = lienAppel();
  document.getElementById('texteTelephoneContact').textContent = NUMERO_TELEPHONE;
  document.getElementById('lienTiktokContact').href = LIEN_TIKTOK;
  document.getElementById('lienFacebookContact').href = LIEN_FACEBOOK;

  document.getElementById('btnOuvrirPanier').addEventListener('click', ouvrirPanier);
  document.getElementById('btnFermerPanier').addEventListener('click', fermerPanier);
  document.getElementById('overlay').addEventListener('click', fermerPanier);
  document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', fermerModales));

  document.getElementById('btnCommanderGateau').addEventListener('click', () => ouvrirModale('modalGateau'));

  // Formulaire gâteau personnalisé
  document.getElementById('formGateau').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const gateau = PRODUITS.find((p) => p.personnalisable);
    let photoUrl = '';
    const fichier = fd.get('photo');
    if (fichier && fichier.size > 0) {
      const uploadFd = new FormData();
      uploadFd.append('photo', fichier);
      try {
        const up = await fetch('/api/upload', { method: 'POST', body: uploadFd });
        const upData = await up.json();
        photoUrl = upData.url || '';
      } catch (err) { console.warn('Upload photo échoué', err); }
    }
    ajouterAuPanier(gateau, 1, [], {
      taille: fd.get('taille'), parfum: fd.get('parfum'), decoration: fd.get('decoration'),
      texte: fd.get('texte'), date: fd.get('date'), heure: fd.get('heure'), photoModele: photoUrl,
    });
    toast('Gâteau ajouté au panier', 'success');
    fermerModales();
    e.target.reset();
  });

  // Ouverture de la préparation de commande (aucune validation en ligne, juste un récapitulatif)
  document.getElementById('btnCommander').addEventListener('click', () => {
    if (panier.length === 0) return toast('Votre panier est vide', 'error');
    fermerPanier();
    ouvrirModale('modalCommande');
  });

  document.getElementById('selectTypeCommande').addEventListener('change', (e) => {
    document.getElementById('champsAvance').style.display = e.target.value === 'a_l_avance' ? 'block' : 'none';
  });

  // La commande n'est JAMAIS créée automatiquement en ligne : ce formulaire sert uniquement
  // à préparer un récapitulatif clair, que le client confirme ensuite par appel ou WhatsApp.
  // C'est le personnel qui saisit la commande dans le système (Caisse) à réception de l'appel.
  document.getElementById('formCommande').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get('type');
    const commandeSimulee = {
      type,
      client: { nom: fd.get('nom'), tel: fd.get('tel') },
      items: panier,
      notesGenerales: fd.get('notes') || '',
      montantTotal: totalPanier(),
      avance: type === 'a_l_avance' ? { date: fd.get('date'), heure: fd.get('heure'), personnes: fd.get('personnes') } : null,
    };
    afficherRecapitulatif(commandeSimulee);
    fermerModales();
    ouvrirModale('modalConfirmation');
  });

  document.getElementById('formReservation').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await apiPost('/api/reservations', {
        nom: fd.get('nom'), tel: fd.get('tel'), date: fd.get('date'),
        heure: fd.get('heure'), personnes: fd.get('personnes'), notes: fd.get('notes'),
      });
      toast('Réservation envoyée ! Nous vous confirmons rapidement.', 'success');
      e.target.reset();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});

function afficherRecapitulatif(commande) {
  const typeLabels = { a_emporter: 'À emporter', a_l_avance: 'Commande à l\'avance' };
  const lignes = commande.items.map((it) =>
    `<div class="ticket-row"><span>${it.quantite}× ${it.nom}</span><span>${formatMontant(it.prix * it.quantite)}</span></div>`
  ).join('');
  document.getElementById('ticketConfirmation').innerHTML = `
    <h4>Récapitulatif — à confirmer</h4>
    <div class="ticket-row"><span>Type</span><span>${typeLabels[commande.type] || commande.type}</span></div>
    ${commande.avance ? `<div class="ticket-row"><span>Retrait</span><span>${commande.avance.date} ${commande.avance.heure}</span></div>` : ''}
    <div class="ticket-row"><span>Nom</span><span>${commande.client.nom}</span></div>
    <div class="ticket-sep"></div>
    ${lignes}
    <div class="ticket-sep"></div>
    <div class="ticket-total"><span>Total</span><span>${formatMontant(commande.montantTotal)}</span></div>
  `;

  let message = `Bonjour Le Bon Refuge, je souhaite confirmer ma commande :\n`;
  commande.items.forEach((it) => { message += `- ${it.quantite}x ${it.nom}${it.options.length ? ' (' + it.options.join(', ') + ')' : ''}\n`; });
  message += `Total : ${formatMontant(commande.montantTotal)}\n`;
  message += `Type : ${typeLabels[commande.type] || commande.type}`;
  if (commande.avance) message += ` — retrait le ${commande.avance.date} à ${commande.avance.heure}`;
  message += `\nNom : ${commande.client.nom} — Tél : ${commande.client.tel}`;
  if (commande.notesGenerales) message += `\nNote : ${commande.notesGenerales}`;

  document.getElementById('btnAppelerRecap').href = lienAppel();
  document.getElementById('btnWhatsappRecap').href = lienWhatsapp(message);

  // Le panier n'est vidé qu'une fois le récapitulatif affiché, puisque c'est la dernière
  // étape avant l'appel/WhatsApp de confirmation.
  panier = [];
  sauvegarderPanier();
  afficherPanier();
  document.getElementById('formCommande').reset();
}
