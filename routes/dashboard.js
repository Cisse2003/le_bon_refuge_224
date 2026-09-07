const express = require('express');
const db = require('../utils/db');
const { requireAuth } = require('./auth');

const router = express.Router();

function debutJour(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function debutSemaine(d) {
  const x = debutJour(d);
  const jour = x.getDay() === 0 ? 7 : x.getDay(); // lundi = 1 ... dimanche = 7
  x.setDate(x.getDate() - (jour - 1));
  return x;
}
function debutMois(d) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }

router.get('/stats', requireAuth, (req, res) => {
  const orders = db.read('orders').filter((o) => o.statut !== 'ANNULEE');
  const now = new Date();
  const dJour = debutJour(now), dSemaine = debutSemaine(now), dMois = debutMois(now);

  const commandesEncaissables = orders.filter((o) => o.statut === 'TERMINEE');

  const caPeriode = (debut) => commandesEncaissables
    .filter((o) => new Date(o.dateCreation) >= debut)
    .reduce((s, o) => s + o.montantTotal, 0);

  const nbPeriode = (debut) => commandesEncaissables.filter((o) => new Date(o.dateCreation) >= debut).length;

  const caJour = caPeriode(dJour);
  const caSemaine = caPeriode(dSemaine);
  const caMois = caPeriode(dMois);
  const nbJour = nbPeriode(dJour);

  const panierMoyen = commandesEncaissables.length
    ? commandesEncaissables.reduce((s, o) => s + o.montantTotal, 0) / commandesEncaissables.length
    : 0;

  // Produits les plus vendus
  const ventesParProduit = {};
  const ventesParCategorie = {};
  const products = db.read('products');
  commandesEncaissables.forEach((o) => {
    o.items.forEach((it) => {
      ventesParProduit[it.nom] = (ventesParProduit[it.nom] || 0) + it.quantite;
      const p = products.find((pr) => pr.id === it.productId);
      const cat = p ? p.categorie : 'Autre';
      ventesParCategorie[cat] = (ventesParCategorie[cat] || 0) + it.prix * it.quantite;
    });
  });
  const topProduits = Object.entries(ventesParProduit)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nom, quantite]) => ({ nom, quantite }));

  const ventesCategorie = Object.entries(ventesParCategorie).map(([categorie, total]) => ({ categorie, total }));

  res.json({
    caJour, caSemaine, caMois, nbCommandesJour: nbJour,
    panierMoyen,
    totalCommandes: orders.length,
    commandesEnCours: orders.filter((o) => !['TERMINEE', 'ANNULEE'].includes(o.statut)).length,
    topProduits,
    ventesCategorie,
  });
});

router.get('/logs', requireAuth, (req, res) => {
  res.json(db.read('logs').slice(0, 300));
});

module.exports = router;
