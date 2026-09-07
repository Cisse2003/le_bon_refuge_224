const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { logAction } = require('../utils/logger');
const { requireAuth } = require('./auth');

const router = express.Router();

// Créer une réservation - public (formulaire du site)
router.post('/', async (req, res) => {
  const { nom, tel, date, heure, personnes, notes } = req.body;
  if (!nom || !tel || !date || !heure || !personnes) {
    return res.status(400).json({ error: 'Tous les champs sont requis (nom, téléphone, date, heure, personnes)' });
  }
  const reservations = db.read('reservations');
  const nouvelle = {
    id: uuidv4(),
    nom,
    tel,
    date,
    heure,
    personnes: Number(personnes),
    notes: notes || '',
    statut: 'EN_ATTENTE',
    dateCreation: new Date().toISOString(),
  };
  reservations.push(nouvelle);
  await db.write('reservations', reservations);

  await logAction({
    utilisateur: 'client (site)',
    role: 'client',
    action: 'CREATION_RESERVATION',
    nouvelleValeur: `${nom} - ${personnes} pers. - ${date} ${heure}`,
  });

  req.app.get('io').emit('reservation_creee', nouvelle);
  res.status(201).json(nouvelle);
});

// Liste - staff uniquement
router.get('/', requireAuth, (req, res) => {
  const reservations = db.read('reservations').sort((a, b) => new Date(a.date + ' ' + a.heure) - new Date(b.date + ' ' + b.heure));
  res.json(reservations);
});

// Changer le statut d'une réservation (confirmée / annulée / honorée)
router.patch('/:id', requireAuth, async (req, res) => {
  const { statut } = req.body;
  const reservations = db.read('reservations');
  const idx = reservations.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Réservation introuvable' });
  reservations[idx].statut = statut;
  await db.write('reservations', reservations);
  res.json(reservations[idx]);
});

module.exports = router;
