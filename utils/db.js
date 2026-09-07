const fs = require('fs');
const path = require('path');

// Dossier "d'origine" livré avec le code (contient le menu de démonstration, etc.).
// Sert aussi de source d'amorçage quand un disque persistant externe est utilisé.
const BUNDLED_DEFAULTS_DIR = path.join(__dirname, '..', 'data');

// DATA_DIR peut être redirigé vers un disque persistant en hébergement
// (ex. Render, Railway) via la variable d'environnement DATA_DIR, pour que les
// données survivent aux redéploiements. En local, il pointe simplement vers ./data.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : BUNDLED_DEFAULTS_DIR;

const FICHIERS_CONNUS = ['products', 'users', 'orders', 'reservations', 'stock', 'logs', 'ingredients'];

function initialiserDossierDonnees() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  FICHIERS_CONNUS.forEach((nom) => {
    const cible = path.join(DATA_DIR, `${nom}.json`);
    if (fs.existsSync(cible)) return;
    const source = path.join(BUNDLED_DEFAULTS_DIR, `${nom}.json`);
    if (fs.existsSync(source) && path.resolve(source) !== path.resolve(cible)) {
      fs.copyFileSync(source, cible);
    } else {
      fs.writeFileSync(cible, '[]', 'utf-8');
    }
  });
}
initialiserDossierDonnees();

// File d'attente d'écriture très simple par fichier, pour éviter les
// écritures concurrentes qui corrompraient le JSON (le système tourne en local,
// mono-process, donc une file en mémoire suffit).
const queues = {};

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function read(name) {
  const p = filePath(name);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf-8').trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Erreur de lecture de ${name}.json :`, e.message);
    return [];
  }
}

function writeNow(name, data) {
  const p = filePath(name);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, p); // écriture atomique
}

function write(name, data) {
  // Sérialise les écritures par fichier pour rester cohérent.
  queues[name] = (queues[name] || Promise.resolve()).then(() => writeNow(name, data));
  return queues[name];
}

module.exports = { read, write, DATA_DIR };
