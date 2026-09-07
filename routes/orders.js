const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { logAction } = require('../utils/logger');
const { deduireStock, restituerStock } = require('../utils/recette');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

const STATUTS = ['NOUVELLE', 'CONFIRMEE', 'EN_PREPARATION', 'PRETE', 'TERMINEE', 'ANNULEE'];
const STATUTS_ITEM = ['ATTENTE', 'EN_PREPARATION', 'PRETE'];

function nextNumero() {
  const orders = db.read('orders');
  const today = new Date().toISOString().slice(0, 10);
  const ordersAujourdhui = orders.filter((o) => o.dateCreation.slice(0, 10) === today);
  return ordersAujourdhui.length + 1;
}

function calculerTotal(items) {
  return items.reduce((sum, it) => sum + Number(it.prix) * Number(it.quantite), 0);
}

function posteDeProduit(products, productId, posteExplicite) {
  if (posteExplicite) return posteExplicite;
  const p = products.find((pr) => pr.id === productId);
  return p ? p.poste : 'cuisine';
}

// GET /api/orders - liste (staff uniquement) avec filtres optionnels
router.get('/', requireAuth, (req, res) => {
  let orders = db.read('orders');
  const { statut, poste, type } = req.query;
  if (statut) orders = orders.filter((o) => o.statut === statut);
  if (type) orders = orders.filter((o) => o.type === type);
  if (poste) orders = orders.filter((o) => o.items.some((it) => it.poste === poste));
  orders.sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation));
  res.json(orders);
});

// GET /api/orders/public/:id - pour qu'un client suive sa commande passée depuis le site
router.get('/public/:id', (req, res) => {
  const orders = db.read('orders');
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  res.json(order);
});

router.get('/:id', requireAuth, (req, res) => {
  const orders = db.read('orders');
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  res.json(order);
});

// POST /api/orders - créer une commande (site public OU caisse, staff connecté)
router.post('/', async (req, res) => {
  const { type, table, client, items, notesGenerales, avance } = req.body;
  if (!type || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Type et articles requis' });
  }

  const staff = req.session.user || null;
  if (type === 'sur_place' && !staff) {
    return res.status(403).json({ error: "Une commande sur place doit être saisie par un serveur/caissier connecté" });
  }

  const products = db.read('products');
  const preparedItems = items.map((it) => ({
    id: uuidv4(),
    productId: it.productId,
    nom: it.nom,
    prix: Number(it.prix),
    quantite: Number(it.quantite) || 1,
    options: Array.isArray(it.options) ? it.options : [],
    personnalisation: it.personnalisation || null,
    poste: posteDeProduit(products, it.productId, it.poste),
    statutItem: 'ATTENTE',
  }));

  const orders = db.read('orders');
  const nouvelleCommande = {
    id: uuidv4(),
    numero: nextNumero(),
    type, // sur_place | a_emporter | a_l_avance | livraison
    canal: staff ? 'caisse' : 'site',
    table: table || null,
    client: client || null,
    avance: avance || null, // { date, heure, personnes } pour commande à l'avance
    items: preparedItems,
    statut: 'NOUVELLE',
    envoiCuisine: false,
    stockApplique: false,
    montantTotal: calculerTotal(preparedItems),
    notesGenerales: notesGenerales || '',
    servedBy: staff ? { id: staff.id, username: staff.username, nom: staff.nom } : null,
    dateCreation: new Date().toISOString(),
    dateModif: new Date().toISOString(),
  };

  orders.push(nouvelleCommande);
  await db.write('orders', orders);

  await logAction({
    orderId: nouvelleCommande.id,
    orderNumero: nouvelleCommande.numero,
    utilisateur: staff ? staff.username : 'client (site)',
    role: staff ? staff.role : 'client',
    action: 'CREATION_COMMANDE',
    nouvelleValeur: `${preparedItems.length} article(s), ${Math.round(nouvelleCommande.montantTotal).toLocaleString('fr-FR')} FG`,
  });

  const io = req.app.get('io');
  io.emit('commande_creee', nouvelleCommande);

  res.status(201).json(nouvelleCommande);
});

// PATCH /api/orders/:id - corriger les articles AVANT envoi en cuisine
router.patch('/:id', requireAuth, async (req, res) => {
  const orders = db.read('orders');
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Commande introuvable' });
  const order = orders[idx];

  if (order.envoiCuisine && !['chef', 'assistant_chef', 'admin'].includes(req.session.user.role)) {
    return res.status(403).json({ error: 'Commande déjà envoyée en cuisine : seul le chef peut la corriger' });
  }

  const { items, notesGenerales, table } = req.body;
  const avant = JSON.stringify(order.items.map((i) => `${i.nom} x${i.quantite}`));

  if (items) {
    const products = db.read('products');
    order.items = items.map((it) => ({
      id: it.id || uuidv4(),
      productId: it.productId,
      nom: it.nom,
      prix: Number(it.prix),
      quantite: Number(it.quantite) || 1,
      options: Array.isArray(it.options) ? it.options : [],
      personnalisation: it.personnalisation || null,
      poste: posteDeProduit(products, it.productId, it.poste),
      statutItem: it.statutItem || 'ATTENTE',
    }));
    order.montantTotal = calculerTotal(order.items);
  }
  if (notesGenerales !== undefined) order.notesGenerales = notesGenerales;
  if (table !== undefined) order.table = table;
  order.dateModif = new Date().toISOString();

  orders[idx] = order;
  await db.write('orders', orders);

  const apres = JSON.stringify(order.items.map((i) => `${i.nom} x${i.quantite}`));
  await logAction({
    orderId: order.id,
    orderNumero: order.numero,
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'MODIFICATION_COMMANDE',
    ancienneValeur: avant,
    nouvelleValeur: apres,
  });

  req.app.get('io').emit('commande_modifiee', order);
  res.json(order);
});

// POST /api/orders/:id/envoyer-cuisine
router.post('/:id/envoyer-cuisine', requireAuth, async (req, res) => {
  const orders = db.read('orders');
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Commande introuvable' });

  orders[idx].envoiCuisine = true;
  orders[idx].statut = 'NOUVELLE';
  orders[idx].dateModif = new Date().toISOString();

  // Déduction automatique du stock théorique des matières premières (fiches de grammage)
  if (!orders[idx].stockApplique) {
    await deduireStock(orders[idx], { utilisateur: req.session.user.username, role: req.session.user.role });
    orders[idx].stockApplique = true;
  }

  await db.write('orders', orders);

  await logAction({
    orderId: orders[idx].id,
    orderNumero: orders[idx].numero,
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'ENVOI_CUISINE',
  });

  req.app.get('io').emit('nouvelle_commande_cuisine', orders[idx]);
  req.app.get('io').emit('stock_ingredients_maj');
  res.json(orders[idx]);
});

// PATCH /api/orders/:id/statut - changer le statut global de la commande
router.patch('/:id/statut', requireAuth, async (req, res) => {
  const { statut } = req.body;
  if (!STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });

  const orders = db.read('orders');
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Commande introuvable' });

  const role = req.session.user.role;
  if (statut === 'ANNULEE' && role === 'serveur') {
    return res.status(403).json({ error: "Un serveur ne peut pas annuler définitivement une commande validée. Contactez le chef." });
  }

  const avant = orders[idx].statut;
  orders[idx].statut = statut;
  orders[idx].dateModif = new Date().toISOString();

  // Si la commande est annulée après que les matières premières aient déjà été décomptées,
  // on les réapprovisionne automatiquement (elles n'ont finalement pas été consommées).
  if (statut === 'ANNULEE' && orders[idx].stockApplique) {
    await restituerStock(orders[idx], { utilisateur: req.session.user.username, role });
    orders[idx].stockApplique = false;
  }

  await db.write('orders', orders);

  await logAction({
    orderId: orders[idx].id,
    orderNumero: orders[idx].numero,
    utilisateur: req.session.user.username,
    role,
    action: 'CHANGEMENT_STATUT',
    champ: 'statut',
    ancienneValeur: avant,
    nouvelleValeur: statut,
  });

  const io = req.app.get('io');
  io.emit('commande_statut', orders[idx]);
  if (statut === 'PRETE') io.emit('commande_prete', orders[idx]);
  if (statut === 'ANNULEE') io.emit('stock_ingredients_maj');
  res.json(orders[idx]);
});

// PATCH /api/orders/:id/items/:itemId/statut - avancement par poste (cuisine/crèmerie/pâtisserie)
router.patch('/:id/items/:itemId/statut', requireAuth, async (req, res) => {
  const { statutItem } = req.body;
  if (!STATUTS_ITEM.includes(statutItem)) return res.status(400).json({ error: 'Statut d\'article invalide' });

  const orders = db.read('orders');
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Commande introuvable' });

  const order = orders[idx];
  const item = order.items.find((it) => it.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Article introuvable' });

  item.statutItem = statutItem;

  // Statut global dérivé de l'avancement des postes
  const tousPrets = order.items.every((it) => it.statutItem === 'PRETE');
  const auMoinsUnEnPrepa = order.items.some((it) => it.statutItem === 'EN_PREPARATION' || it.statutItem === 'PRETE');
  if (tousPrets) order.statut = 'PRETE';
  else if (auMoinsUnEnPrepa) order.statut = 'EN_PREPARATION';

  order.dateModif = new Date().toISOString();
  orders[idx] = order;
  await db.write('orders', orders);

  const io = req.app.get('io');
  io.emit('commande_statut', order);
  if (order.statut === 'PRETE') io.emit('commande_prete', order); // notifie le serveur

  res.json(order);
});

// DELETE /api/orders/:id - suppression définitive (chef/admin uniquement)
router.delete('/:id', requireRole('chef', 'assistant_chef', 'admin'), async (req, res) => {
  const orders = db.read('orders');
  const order = orders.find((o) => o.id === req.params.id);
  const filtered = orders.filter((o) => o.id !== req.params.id);
  if (filtered.length === orders.length) return res.status(404).json({ error: 'Commande introuvable' });

  if (order && order.stockApplique) {
    await restituerStock(order, { utilisateur: req.session.user.username, role: req.session.user.role });
  }

  await db.write('orders', filtered);

  await logAction({
    orderId: req.params.id,
    orderNumero: order ? order.numero : null,
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'SUPPRESSION_COMMANDE',
  });

  req.app.get('io').emit('commande_supprimee', { id: req.params.id });
  if (order && order.stockApplique) req.app.get('io').emit('stock_ingredients_maj');
  res.json({ ok: true });
});

module.exports = router;
