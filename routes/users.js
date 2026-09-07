const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { logAction } = require('../utils/logger');
const { requireRole } = require('./auth');

const router = express.Router();

function sansMotDePasse(u) {
  const { passwordHash, ...reste } = u;
  return reste;
}

router.get('/', requireRole('admin'), (req, res) => {
  res.json(db.read('users').map(sansMotDePasse));
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { username, password, role, nom } = req.body;
  const rolesValides = ['serveur', 'chef', 'assistant_chef', 'admin'];
  if (!username || !password || !rolesValides.includes(role)) {
    return res.status(400).json({ error: 'Identifiant, mot de passe et rôle valide requis' });
  }
  const users = db.read('users');
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'Cet identifiant existe déjà' });
  }
  const nouveau = {
    id: uuidv4(),
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    nom: nom || username,
    actif: true,
  };
  users.push(nouveau);
  await db.write('users', users);

  await logAction({
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'CREATION_UTILISATEUR',
    nouvelleValeur: `${username} (${role})`,
  });

  res.status(201).json(sansMotDePasse(nouveau));
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const users = db.read('users');
  const idx = users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const { password, role, nom, actif } = req.body;
  if (password) users[idx].passwordHash = bcrypt.hashSync(password, 10);
  if (role) users[idx].role = role;
  if (nom !== undefined) users[idx].nom = nom;
  if (actif !== undefined) users[idx].actif = !!actif;

  await db.write('users', users);
  await logAction({
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'MODIFICATION_UTILISATEUR',
    champ: users[idx].username,
  });
  res.json(sansMotDePasse(users[idx]));
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const users = db.read('users');
  const cible = users.find((u) => u.id === req.params.id);
  const filtered = users.filter((u) => u.id !== req.params.id);
  if (filtered.length === users.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
  await db.write('users', filtered);

  await logAction({
    utilisateur: req.session.user.username,
    role: req.session.user.role,
    action: 'SUPPRESSION_UTILISATEUR',
    ancienneValeur: cible ? cible.username : req.params.id,
  });
  res.json({ ok: true });
});

module.exports = router;
