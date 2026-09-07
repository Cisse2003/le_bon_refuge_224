const { v4: uuidv4 } = require('uuid');
const db = require('./db');

/**
 * Enregistre une action sensible pour la traçabilité (§6 du cahier des charges).
 * Exemple : "#125 — Burger x2 -> x3 — Chef — 12:41"
 */
async function logAction({ orderId, orderNumero, utilisateur, role, action, champ, ancienneValeur, nouvelleValeur }) {
  const logs = db.read('logs');
  const entry = {
    id: uuidv4(),
    orderId: orderId || null,
    orderNumero: orderNumero || null,
    date: new Date().toISOString(),
    utilisateur,
    role,
    action,
    champ: champ || null,
    ancienneValeur: ancienneValeur !== undefined ? ancienneValeur : null,
    nouvelleValeur: nouvelleValeur !== undefined ? nouvelleValeur : null,
  };
  logs.unshift(entry);
  await db.write('logs', logs.slice(0, 5000)); // garde un historique raisonnable
  return entry;
}

module.exports = { logAction };
