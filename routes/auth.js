const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../utils/db');
const { logAction } = require('../utils/logger');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Accès refusé pour ce rôle' });
    }
    next();
  };
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

  const users = db.read('users');
  const user = users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (!user || !user.actif) return res.status(401).json({ error: 'Identifiants invalides' });

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

  req.session.user = { id: user.id, username: user.username, role: user.role, nom: user.nom };
  await logAction({
    utilisateur: user.username,
    role: user.role,
    action: 'CONNEXION',
  });
  res.json({ user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = { router, requireAuth, requireRole };
