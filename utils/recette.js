const db = require('./db');
const { logAction } = require('./logger');

/**
 * Calcule la consommation totale d'ingrédients pour une liste d'articles de commande,
 * en se basant sur la "recette" (fiche de grammage) de chaque produit.
 * Retourne une Map ingredientId -> quantité totale consommée.
 */
function calculerConsommation(items, products) {
  const consommation = {};
  items.forEach((item) => {
    const produit = products.find((p) => p.id === item.productId);
    if (!produit || !Array.isArray(produit.recette)) return;
    produit.recette.forEach((ligne) => {
      const total = Number(ligne.quantite) * Number(item.quantite);
      consommation[ligne.ingredientId] = (consommation[ligne.ingredientId] || 0) + total;
    });
  });
  return consommation;
}

/**
 * Déduit automatiquement le stock théorique des ingrédients utilisés par une commande.
 * Appelé au moment de l'envoi en cuisine (moment où les matières premières sont réellement
 * entamées). Journalise chaque mouvement pour la traçabilité.
 */
async function deduireStock(order, { utilisateur, role }) {
  const products = db.read('products');
  const consommation = calculerConsommation(order.items, products);
  if (Object.keys(consommation).length === 0) return;

  const ingredients = db.read('ingredients');
  for (const [ingredientId, quantite] of Object.entries(consommation)) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) continue;
    const avant = ing.quantiteStock;
    ing.quantiteStock = Math.max(0, ing.quantiteStock - quantite);
    await logAction({
      orderId: order.id,
      orderNumero: order.numero,
      utilisateur,
      role,
      action: 'DEDUCTION_STOCK_AUTO',
      champ: ing.nom,
      ancienneValeur: `${avant} ${ing.unite}`,
      nouvelleValeur: `${ing.quantiteStock} ${ing.unite}`,
    });
  }
  await db.write('ingredients', ingredients);
}

/**
 * Réapprovisionne les ingrédients d'une commande annulée après que le stock ait déjà été déduit
 * (ex : commande envoyée en cuisine puis annulée par le chef).
 */
async function restituerStock(order, { utilisateur, role }) {
  const products = db.read('products');
  const consommation = calculerConsommation(order.items, products);
  if (Object.keys(consommation).length === 0) return;

  const ingredients = db.read('ingredients');
  for (const [ingredientId, quantite] of Object.entries(consommation)) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) continue;
    const avant = ing.quantiteStock;
    ing.quantiteStock = ing.quantiteStock + quantite;
    await logAction({
      orderId: order.id,
      orderNumero: order.numero,
      utilisateur,
      role,
      action: 'RESTITUTION_STOCK_AUTO',
      champ: ing.nom,
      ancienneValeur: `${avant} ${ing.unite}`,
      nouvelleValeur: `${ing.quantiteStock} ${ing.unite}`,
    });
  }
  await db.write('ingredients', ingredients);
}

module.exports = { calculerConsommation, deduireStock, restituerStock };
