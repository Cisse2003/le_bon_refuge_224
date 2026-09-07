const express = require('express');
const db = require('../utils/db');
const { logAction } = require('../utils/logger');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// Liste du stock avec infos produit fusionnées - staff uniquement
router.get('/', requireAuth, (req, res) => {
  const stock = db.read('stock');
  const products = db.read('products');
  const enrichi = stock.map((s) => {
    const p = products.find((pr) => pr.id === s.productId);
    return {
      ...s,
      nom: p ? p.nom : 'Produit supprimé',
      categorie: p ? p.categorie : '',
      alerte: s.quantite <= s.seuilAlerte,
    };
  });
  res.json(enrichi);
});

// Mise à jour manuelle du stock - chef, assistant, admin
router.put('/:productId', requireRole('chef', 'assistant_chef', 'admin'), async (req, res) => {
  const { quantite, seuilAlerte } = req.body;
  const stock = db.read('stock');
  const idx = stock.findIndex((s) => s.productId === req.params.productId);
  if (idx === -1) return res.status(404).json({ error: 'Article de stock introuvable' });

  const avant = stock[idx].quantite;
  if (quantite !== undefined) stock[idx].quantite = Number(quantite);
  if (seuilAlerte !== undefined) stock[idx].seuilAlerte = Number(seuilAlerte);
  await db.write('stock', stock);

  await logAction({
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'MODIFICATION_STOCK',
    champ: req.params.productId,
    ancienneValeur: String(avant),
    nouvelleValeur: String(stock[idx].quantite),
  });

  res.json(stock[idx]);
});

module.exports = router;
