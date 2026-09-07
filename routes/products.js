const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { logAction } = require('../utils/logger');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// Liste des produits - publique (nécessaire pour le site vitrine)
router.get('/', (req, res) => {
  res.json(db.read('products'));
});

// Création - admin uniquement
router.post('/', requireRole('admin'), async (req, res) => {
  const { categorie, nom, description, prix, photo, poste, options, disponible, personnalisable, recette } = req.body;
  if (!categorie || !nom || prix === undefined) {
    return res.status(400).json({ error: 'Catégorie, nom et prix sont requis' });
  }
  const products = db.read('products');
  const nouveau = {
    id: 'p' + uuidv4().slice(0, 8),
    categorie,
    nom,
    description: description || '',
    prix: Number(prix),
    photo: photo || '',
    poste: poste || 'cuisine',
    options: Array.isArray(options) ? options : [],
    disponible: disponible !== undefined ? !!disponible : true,
    personnalisable: !!personnalisable,
    recette: Array.isArray(recette) ? recette : [],
  };
  products.push(nouveau);
  await db.write('products', products);

  // le nouveau produit entre aussi dans le stock
  const stock = db.read('stock');
  stock.push({ productId: nouveau.id, quantite: 50, seuilAlerte: 10 });
  await db.write('stock', stock);

  await logAction({
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'CREATION_PRODUIT',
    champ: 'produit',
    nouvelleValeur: nouveau.nom,
  });
  res.status(201).json(nouveau);
});

// Modification - admin (tout), chef/assistant (disponibilité uniquement)
router.put('/:id', requireAuth, async (req, res) => {
  const products = db.read('products');
  const idx = products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Produit introuvable' });

  const role = req.session.user.role;
  const avant = { ...products[idx] };

  if (role === 'admin') {
    products[idx] = { ...products[idx], ...req.body, id: products[idx].id };
  } else if (role === 'chef' || role === 'assistant_chef') {
    // Droits limités : uniquement la disponibilité (produit indisponible)
    if (req.body.disponible === undefined) {
      return res.status(403).json({ error: "Seule la disponibilité peut être modifiée avec ce rôle" });
    }
    products[idx].disponible = !!req.body.disponible;
  } else {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  await db.write('products', products);
  await logAction({
    utilisateur: req.session.user.username,
    role,
    action: 'MODIFICATION_PRODUIT',
    champ: avant.nom,
    ancienneValeur: JSON.stringify({ prix: avant.prix, disponible: avant.disponible }),
    nouvelleValeur: JSON.stringify({ prix: products[idx].prix, disponible: products[idx].disponible }),
  });
  res.json(products[idx]);
});

// Suppression - admin uniquement
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const products = db.read('products');
  const produit = products.find((p) => p.id === req.params.id);
  const filtered = products.filter((p) => p.id !== req.params.id);
  if (filtered.length === products.length) return res.status(404).json({ error: 'Produit introuvable' });
  await db.write('products', filtered);

  await logAction({
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'SUPPRESSION_PRODUIT',
    champ: 'produit',
    ancienneValeur: produit ? produit.nom : req.params.id,
  });
  res.json({ ok: true });
});

module.exports = router;
