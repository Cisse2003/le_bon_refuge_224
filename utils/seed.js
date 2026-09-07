const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const DEFAULT_USERS = [
  { username: 'admin', password: 'admin123', role: 'admin', nom: 'Administrateur' },
  { username: 'chef', password: 'chef123', role: 'chef', nom: 'Chef de cuisine' },
  { username: 'assistant', password: 'assistant123', role: 'assistant_chef', nom: "Assistant du chef" },
  { username: 'serveur1', password: 'serveur123', role: 'serveur', nom: 'Serveur 1' },
];

async function seed() {
  // Utilisateurs par défaut (uniquement si le fichier est vide, pour ne jamais
  // écraser des comptes déjà créés/modifiés par le restaurant).
  const users = db.read('users');
  if (users.length === 0) {
    const seeded = DEFAULT_USERS.map((u) => ({
      id: uuidv4(),
      username: u.username,
      passwordHash: bcrypt.hashSync(u.password, 10),
      role: u.role,
      nom: u.nom,
      actif: true,
    }));
    await db.write('users', seeded);
    console.log('Utilisateurs par défaut créés :');
    DEFAULT_USERS.forEach((u) => console.log(`   - ${u.username} / ${u.password} (${u.role})`));
  }

  // Stock initial basé sur les produits existants.
  const stock = db.read('stock');
  const products = db.read('products');
  if (stock.length === 0 && products.length > 0) {
    const seededStock = products.map((p) => ({
      productId: p.id,
      quantite: 50,
      seuilAlerte: 10,
    }));
    await db.write('stock', seededStock);
    console.log('Stock initial créé (50 unités par produit).');
  }
}

module.exports = { seed };
