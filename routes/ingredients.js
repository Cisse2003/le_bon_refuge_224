const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { logAction } = require('../utils/logger');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

function avecAlerte(ing) {
  return { ...ing, alerte: ing.quantiteStock <= ing.seuilAlerte };
}

// Liste - staff uniquement (nécessaire pour la cuisine/admin)
router.get('/', requireAuth, (req, res) => {
  res.json(db.read('ingredients').map(avecAlerte));
});

// Création - admin, chef, assistant
router.post('/', requireRole('admin', 'chef', 'assistant_chef'), async (req, res) => {
  const { nom, unite, quantiteStock, seuilAlerte, photo } = req.body;
  const unitesValides = ['g', 'ml', 'unite'];
  if (!nom || !unitesValides.includes(unite)) {
    return res.status(400).json({ error: "Nom et unité valide requis (g, ml ou unite)" });
  }
  const ingredients = db.read('ingredients');
  const nouveau = {
    id: 'ing' + uuidv4().slice(0, 8),
    nom,
    unite,
    quantiteStock: Number(quantiteStock) || 0,
    seuilAlerte: Number(seuilAlerte) || 0,
    photo: photo || '',
  };
  ingredients.push(nouveau);
  await db.write('ingredients', ingredients);

  await logAction({
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'CREATION_INGREDIENT',
    nouvelleValeur: nouveau.nom,
  });
  res.status(201).json(avecAlerte(nouveau));
});

// Mise à jour (réapprovisionnement, correction de seuil, renommage, photo) - admin, chef, assistant
router.put('/:id', requireRole('admin', 'chef', 'assistant_chef'), async (req, res) => {
  const ingredients = db.read('ingredients');
  const idx = ingredients.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ingrédient introuvable' });

  const avant = ingredients[idx].quantiteStock;
  const { nom, unite, quantiteStock, seuilAlerte, ajouter, photo } = req.body;
  if (nom !== undefined) ingredients[idx].nom = nom;
  if (unite !== undefined) ingredients[idx].unite = unite;
  if (seuilAlerte !== undefined) ingredients[idx].seuilAlerte = Number(seuilAlerte);
  if (photo !== undefined) ingredients[idx].photo = photo;
  if (ajouter !== undefined) {
    // Réception d'une livraison : on ajoute à la quantité existante (ex : +5000 g reçus)
    ingredients[idx].quantiteStock += Number(ajouter);
  } else if (quantiteStock !== undefined) {
    ingredients[idx].quantiteStock = Number(quantiteStock);
  }
  await db.write('ingredients', ingredients);

  await logAction({
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'MODIFICATION_STOCK_INGREDIENT',
    champ: ingredients[idx].nom,
    ancienneValeur: `${avant} ${ingredients[idx].unite}`,
    nouvelleValeur: `${ingredients[idx].quantiteStock} ${ingredients[idx].unite}`,
  });
  res.json(avecAlerte(ingredients[idx]));
});

// Suppression - admin uniquement
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const ingredients = db.read('ingredients');
  const cible = ingredients.find((i) => i.id === req.params.id);
  const filtered = ingredients.filter((i) => i.id !== req.params.id);
  if (filtered.length === ingredients.length) return res.status(404).json({ error: 'Ingrédient introuvable' });
  await db.write('ingredients', filtered);

  await logAction({
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'SUPPRESSION_INGREDIENT',
    ancienneValeur: cible ? cible.nom : req.params.id,
  });
  res.json({ ok: true });
});

module.exports = router;
