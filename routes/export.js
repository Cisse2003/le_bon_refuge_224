const express = require('express');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('../utils/db');
const { requireRole } = require('./auth');

const router = express.Router();
const EXPORT_DIR = path.join(__dirname, '..', 'exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

function horodatage() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// GET /api/export/excel - génère un classeur Excel multi-feuilles et le télécharge
router.get('/excel', requireRole('admin', 'chef', 'assistant_chef'), (req, res) => {
  const orders = db.read('orders');
  const products = db.read('products');
  const reservations = db.read('reservations');
  const stock = db.read('stock');
  const logs = db.read('logs');
  const ingredients = db.read('ingredients');

  const wb = XLSX.utils.book_new();

  // --- Feuille Commandes (une ligne par article pour rester exploitable) ---
  const lignesCommandes = [];
  orders.forEach((o) => {
    if (o.items.length === 0) {
      lignesCommandes.push({
        Numero: o.numero, Type: o.type, Statut: o.statut, Table: o.table || '',
        Client: o.client ? o.client.nom : '', Article: '', Quantite: '', PrixUnitaire_FG: '',
        Total_Commande_FG: o.montantTotal, Date: o.dateCreation, ServiPar: o.servedBy ? o.servedBy.username : '',
      });
    }
    o.items.forEach((it) => {
      lignesCommandes.push({
        Numero: o.numero,
        Type: o.type,
        Statut: o.statut,
        Table: o.table || '',
        Client: o.client ? o.client.nom : '',
        Article: it.nom,
        Options: (it.options || []).join(', '),
        Quantite: it.quantite,
        PrixUnitaire_FG: it.prix,
        SousTotal_FG: it.prix * it.quantite,
        Total_Commande_FG: o.montantTotal,
        Date: o.dateCreation,
        ServiPar: o.servedBy ? o.servedBy.username : 'Site web',
      });
    });
  });
  const wsCommandes = XLSX.utils.json_to_sheet(lignesCommandes);
  XLSX.utils.book_append_sheet(wb, wsCommandes, 'Commandes');

  // --- Feuille Produits ---
  const wsProduits = XLSX.utils.json_to_sheet(products.map((p) => ({
    ID: p.id, Categorie: p.categorie, Nom: p.nom, Description: p.description,
    Prix_FG: p.prix, Poste: p.poste, Disponible: p.disponible ? 'Oui' : 'Non',
  })));
  XLSX.utils.book_append_sheet(wb, wsProduits, 'Produits');

  // --- Feuille Stock ---
  const wsStock = XLSX.utils.json_to_sheet(stock.map((s) => {
    const p = products.find((pr) => pr.id === s.productId);
    return { Produit: p ? p.nom : s.productId, Quantite: s.quantite, SeuilAlerte: s.seuilAlerte, Alerte: s.quantite <= s.seuilAlerte ? 'STOCK FAIBLE' : '' };
  }));
  XLSX.utils.book_append_sheet(wb, wsStock, 'Stock');

  // --- Feuille Ingrédients (matières premières / inventaire théorique) ---
  const wsIngredients = XLSX.utils.json_to_sheet(ingredients.map((i) => ({
    Nom: i.nom, Unite: i.unite, Stock_Theorique: i.quantiteStock, SeuilAlerte: i.seuilAlerte,
    Alerte: i.quantiteStock <= i.seuilAlerte ? 'STOCK FAIBLE' : '',
  })));
  XLSX.utils.book_append_sheet(wb, wsIngredients, 'Ingredients');

  // --- Feuille Réservations ---
  const wsReservations = XLSX.utils.json_to_sheet(reservations.map((r) => ({
    Nom: r.nom, Telephone: r.tel, Date: r.date, Heure: r.heure, Personnes: r.personnes, Statut: r.statut, Notes: r.notes,
  })));
  XLSX.utils.book_append_sheet(wb, wsReservations, 'Reservations');

  // --- Feuille Historique / traçabilité ---
  const wsLogs = XLSX.utils.json_to_sheet(logs.map((l) => ({
    Date: l.date, Commande: l.orderNumero || '', Utilisateur: l.utilisateur, Role: l.role,
    Action: l.action, Champ: l.champ || '', AncienneValeur: l.ancienneValeur || '', NouvelleValeur: l.nouvelleValeur || '',
  })));
  XLSX.utils.book_append_sheet(wb, wsLogs, 'Historique');

  const nomFichier = `Le_Bon_Coin_Export_${horodatage()}.xlsx`;
  const cheminFichier = path.join(EXPORT_DIR, nomFichier);
  XLSX.writeFile(wb, cheminFichier);

  res.download(cheminFichier, nomFichier);
});

// GET /api/export/json - sauvegarde complète de toutes les données en un seul fichier JSON
router.get('/json', requireRole('admin', 'chef', 'assistant_chef'), (req, res) => {
  const backup = {
    dateExport: new Date().toISOString(),
    products: db.read('products'),
    orders: db.read('orders'),
    reservations: db.read('reservations'),
    stock: db.read('stock'),
    ingredients: db.read('ingredients'),
    logs: db.read('logs'),
  };
  const nomFichier = `Le_Bon_Coin_Sauvegarde_${horodatage()}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(backup, null, 2));
});

module.exports = router;
