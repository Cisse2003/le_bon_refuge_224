const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const { seed } = require('./utils/seed');
const { router: authRouter } = require('./routes/auth');
const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const reservationsRouter = require('./routes/reservations');
const stockRouter = require('./routes/stock');
const ingredientsRouter = require('./routes/ingredients');
const usersRouter = require('./routes/users');
const dashboardRouter = require('./routes/dashboard');
const exportRouter = require('./routes/export');

const PORT = process.env.PORT || 3000;
const EST_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

// Nécessaire derrière le reverse proxy HTTPS d'un hébergeur (Render, Railway...)
// pour que les cookies "secure" et la détection du protocole fonctionnent.
app.set('trust proxy', 1);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'le-bon-refuge-secret-a-changer-en-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 12 * 60 * 60 * 1000, // 12h
    secure: EST_PRODUCTION, // cookie transmis uniquement en HTTPS une fois en ligne
    sameSite: 'lax',
  },
}));

if (EST_PRODUCTION && !process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET n\'est pas défini : utilisez une variable d\'environnement dédiée en production.');
}

// Upload des photos (produits, photo modèle de gâteau).
// UPLOADS_DIR peut être redirigé vers un disque persistant en hébergement,
// comme DATA_DIR (voir utils/db.js), pour que les photos survivent aux redéploiements.
const uploadDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  res.json({ url: `/uploads/${req.file.filename}` });
});
// Sert les photos uploadées même si UPLOADS_DIR pointe hors de public/ (disque persistant externe)
app.use('/uploads', express.static(uploadDir));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/stock', stockRouter);
app.use('/api/ingredients', ingredientsRouter);
app.use('/api/users', usersRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/export', exportRouter);

io.on('connection', (socket) => {
  socket.on('rejoindre_poste', (poste) => socket.join(poste));
});

seed().then(() => {
  server.listen(PORT, () => {
    const urlPublique = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || null;
    console.log('==================================================');
    console.log('  LE BON REFUGE — serveur démarré');
    if (urlPublique) {
      console.log(`  Site en ligne : ${urlPublique}`);
      console.log(`  Connexion staff : ${urlPublique}/login.html`);
    } else {
      console.log(`  Site : http://localhost:${PORT}`);
      console.log(`  Connexion staff : http://localhost:${PORT}/login.html`);
      console.log(`  Caisse : http://localhost:${PORT}/caisse.html`);
      console.log(`  Cuisine (KDS) : http://localhost:${PORT}/cuisine.html`);
      console.log(`  Admin : http://localhost:${PORT}/admin.html`);
    }
    console.log(`  Données stockées dans : ${require('./utils/db').DATA_DIR}`);
    console.log('==================================================');
  });
});
