# LE BON REFUGE — Site & Système de commandes (100% local)

Application complète, réellement fonctionnelle, développée pour le restaurant **Le Bon Refuge**
(« Le goût qui vous accueille ») d'après le cahier des charges fourni. Elle tourne **entièrement
en local** (aucun cloud requis), stocke toutes les données dans des **fichiers JSON** et permet
d'exporter à tout moment un **classeur Excel** et une **sauvegarde JSON complète**.

## 1. Ce que contient l'application

| Module | Description |
|---|---|
| **Site vitrine** (`/`) | Accueil avec logo, menu interactif par catégories, panier, commande à emporter / à l'avance, bouton "Appeler pour commander" et WhatsApp pré-rempli avec le panier, personnalisation de gâteaux, réservation, contact avec liens TikTok/Facebook. |
| **Caisse** (`/caisse.html`) | Prise de commande sur place / à emporter par le serveur, correction avant envoi, bouton "Envoyer en cuisine", suivi des commandes et encaissement. |
| **Écran cuisine — KDS** (`/cuisine.html`) | Réception automatique et en temps réel des commandes, classées par statut (Nouvelle / En préparation / Prête / Terminée), avec signal sonore, et articles répartis par poste (Cuisine / Crèmerie / Pâtisserie). |
| **Administration** (`/admin.html`) | Tableau de bord (CA jour/semaine/mois, panier moyen, top produits), gestion des produits/prix/photos/recettes, **stock d'ingrédients avec déduction automatique**, gestion des commandes, réservations, utilisateurs et droits, historique/traçabilité, export Excel/JSON. |

Toute la logique métier du cahier des charges est implémentée : rôles et droits différenciés,
traçabilité des modifications sensibles, statuts de commande, répartition automatique par poste,
notification du serveur quand une commande est prête, etc.

## 2. Installation

Prérequis : [Node.js](https://nodejs.org) version 18 ou plus récente.

```bash
cd le-bon-coin
npm install
npm start
```

Le serveur démarre sur **http://localhost:3000**.

- Site client : http://localhost:3000
- Connexion staff : http://localhost:3000/login.html
- Caisse : http://localhost:3000/caisse.html
- Écran cuisine : http://localhost:3000/cuisine.html
- Administration : http://localhost:3000/admin.html

## 3. Comptes fournis par défaut

Créés automatiquement au premier démarrage (modifiables ensuite dans **Admin → Utilisateurs**) :

| Identifiant | Mot de passe | Rôle |
|---|---|---|
| admin | admin123 | Administrateur |
| chef | chef123 | Chef |
| assistant | assistant123 | Assistant du chef |
| serveur1 | serveur123 | Serveur / Caissier |

**Changez ces mots de passe dès la mise en service réelle.**

## 4. Stockage des données

Toutes les données sont de simples fichiers JSON, lisibles et modifiables directement si besoin :

```
data/
  products.json      -> le menu, avec les recettes (fiches de grammage) rattachées à chaque produit
  ingredients.json    -> stock théorique des matières premières (poulet, viande, pâte à pizza...)
  users.json          -> comptes et rôles
  orders.json         -> toutes les commandes (site + caisse)
  reservations.json   -> réservations de table
  stock.json          -> quantités de produits finis et seuils d'alerte
  logs.json           -> historique / traçabilité de toutes les actions sensibles
```

Chaque écriture est atomique (fichier temporaire puis renommage) pour éviter toute corruption
si le serveur est arrêté brutalement.

### Sauvegardes Excel & JSON

Depuis **Admin → Sauvegardes**, ou directement via ces adresses (staff connecté requis) :

- `GET /api/export/excel` → télécharge un classeur `.xlsx` avec un onglet par thème
  (Commandes, Produits, Stock, Réservations, Historique).
- `GET /api/export/json` → télécharge une sauvegarde JSON complète horodatée.

Pensez à lancer un export régulièrement (ou à copier le dossier `data/`) pour conserver un
historique en cas de changement d'ordinateur.

## 5. Fonctionnement en réseau local

Le serveur écoute sur toutes les interfaces réseau. Pour que les tablettes de salle et l'écran
cuisine accèdent au système depuis le **même Wi-Fi**, sans passer par Internet :

1. Trouvez l'adresse IP locale de l'ordinateur qui héberge le serveur (ex. `192.168.1.20`).
2. Sur chaque tablette/téléphone connecté au même Wi-Fi, ouvrez `http://192.168.1.20:3000`.

Tant que la box Wi-Fi fonctionne, la prise de commande sur place et l'écran cuisine continuent
de fonctionner même si la connexion Internet tombe (conformément au cahier des charges). Seules
les commandes passées depuis le site public nécessitent Internet pour arriver aux clients.

## 6. Personnalisation rapide

- **Devise** : tous les prix sont affichés en **Franc guinéen (FG)**, sans décimales, avec
  séparateur de milliers (ex. `45 000 FG`). Le formatage est centralisé dans la fonction
  `formatMontant()` de `public/js/api.js` — c'est le seul endroit à modifier si vous changiez un
  jour de devise. Les prix du menu de démonstration sont éditables (comme tout le reste) depuis
  `Admin → Produits`.
- **Téléphone, WhatsApp, TikTok, Facebook** : modifier les constantes en haut de
  `public/js/site.js` :
  ```js
  const NUMERO_WHATSAPP = '33123456789';       // format international, sans "+"
  const NUMERO_TELEPHONE = '+33 1 23 45 67 89'; // affiché et utilisé pour le bouton "Appeler"
  const LIEN_TIKTOK = 'https://www.tiktok.com/@lebonrefuge';
  const LIEN_FACEBOOK = 'https://www.facebook.com/lebonrefuge';
  ```
  Le bouton "Appeler pour commander" (en-tête et page Contact) ouvre directement le téléphone,
  le bouton WhatsApp ouvre une discussion pré-remplie. Sur l'étape "à emporter" du panier, un
  bloc "Appeler / WhatsApp" reprend automatiquement le contenu du panier dans le message.
- **Logo** : remplacer le fichier `public/images/logo.jpg` par votre propre logo (même nom de
  fichier, ou mettre à jour les balises `<img src="/images/logo.jpg">` dans les pages HTML).
- **Menu, prix, photos, recettes** : tout est modifiable depuis `Admin → Produits` (ajout de
  produits, upload de photo, options, disponibilité, recette) — aucune connaissance technique
  requise.
- **Couleurs / typographie** : variables CSS en haut de `public/css/style.css`.
- **Adresse, horaires** : à éditer directement dans `public/index.html` (section Contact et Hero).

## 7. Stock d'ingrédients et déduction automatique (fiches de grammage)

En plus du stock par produit fini (onglet **Stock produits**), l'application gère un véritable
**inventaire de matières premières** dans l'onglet **Admin → Ingrédients & inventaire** :

- Chaque ingrédient (ex. *Poulet (filet)*) a un stock théorique en grammes, millilitres ou pièces,
  et un seuil d'alerte.
- Chaque produit peut avoir une **recette** (fiche de grammage) : dans `Admin → Produits →
  Modifier`, la section "Recette" permet d'associer un ou plusieurs ingrédients avec la quantité
  consommée par unité vendue (ex. Tacos Poulet Cheddar = 150 g de poulet + 40 g de cheddar +
  80 g de frites).
- **Dès qu'une commande est envoyée en cuisine**, le système additionne automatiquement les
  quantités nécessaires pour tous les articles de la commande et les déduit du stock de chaque
  ingrédient concerné. Exemple : si 5 commandes contenant chacune un Tacos Poulet Cheddar sont
  envoyées en cuisine, 750 g de poulet (5 × 150 g) sont déduits automatiquement du stock théorique,
  sans aucune saisie manuelle.
- Si une commande est **annulée après avoir été envoyée en cuisine**, les ingrédients sont
  **réapprovisionnés automatiquement** (ils n'ont finalement pas été consommés).
- Chaque mouvement (déduction, réapprovisionnement, livraison reçue) est enregistré dans
  l'historique de traçabilité (`Admin → Historique`).
- Pour réceptionner une livraison (ex. 5 kg de poulet reçus), utilisez le champ "Livraison reçue"
  de l'onglet Ingrédients : la quantité saisie s'**ajoute** au stock existant.
- Ce stock reste un **inventaire théorique** basé sur les recettes déclarées : il ne remplace pas
  un inventaire physique régulier, mais donne une estimation fiable en continu.

## 8. Choix techniques (pour information)

- **Backend** : Node.js + Express, sessions serveur pour l'authentification par rôle.
- **Temps réel** : Socket.IO pour la synchronisation instantanée site ↔ caisse ↔ cuisine ↔ admin
  (nouvelles commandes, changements de statut, notification "commande prête").
- **Stockage** : fichiers JSON (pas de base de données à installer) + export Excel via la
  librairie `xlsx`.
- **Mots de passe** : hachés avec `bcryptjs`, jamais stockés en clair.
- **Photos** : upload local via `multer`, stockées dans `public/uploads/`.

## 9. Limites connues / pistes d'évolution (§12 du cahier des charges)

Cette version couvre l'intégralité du système de commande, de gestion et d'inventaire théorique.
Prévu pour plus tard, comme demandé dans le cahier des charges :

- Paiement en ligne et livraison réelle (le type "livraison" existe déjà dans le modèle de
  données, prêt à être activé).
- Application mobile dédiée (le site est déjà 100% responsive et utilisable sur mobile).
- Programme de fidélité et promotions étudiantes.
- Rapprochement automatique entre l'inventaire théorique (calculé à partir des recettes) et un
  inventaire physique (comptage manuel périodique conseillé pour ajuster les écarts).
- Impression thermique automatique des tickets (prévoir une imprimante réseau compatible ;
  le ticket HTML de confirmation peut servir de base à un gabarit d'impression).

## 10. Sécurité

- Identifiants individuels et mots de passe hachés.
- Droits vérifiés côté serveur à chaque action (pas seulement dans l'interface).
- Historique de toutes les actions sensibles (prix, annulations, stock, utilisateurs).
- Pensez à changer le `secret` de session dans `server.js` avant toute mise en production, et à
  servir le site en HTTPS si l'accès dépasse le réseau local (ex. via un reverse proxy).

## 11. Héberger le site en ligne (accessible depuis Internet)

Par défaut, l'application est conçue pour tourner en local (voir §5). Si vous voulez la rendre
accessible depuis Internet — et pas seulement depuis le Wi-Fi du restaurant — voici comment
procéder. **GitHub seul ne suffit pas** : GitHub Pages ne sait servir que des fichiers statiques,
alors que ce site a un vrai serveur Node.js derrière (sessions, temps réel, écriture de fichiers).
Il faut un hébergeur qui exécute du Node.js en continu.

### Étape 1 — Mettre le code sur GitHub

```bash
cd le-bon-refuge
git init
git add .
git commit -m "Le Bon Refuge - site et systeme de commandes"
```
Créez un dépôt vide sur [github.com/new](https://github.com/new), puis :
```bash
git remote add origin https://github.com/VOTRE-COMPTE/le-bon-refuge.git
git branch -M main
git push -u origin main
```

### Étape 2 — Déployer sur Hostinger (plan Business, sans VPS ni SSH)

Depuis la version récente de Hostinger, le plan **Business** (hébergement web partagé) sait
exécuter une vraie application Node.js via hPanel, sans configuration serveur manuelle.

**Checklist "zéro configuration" — l'app fonctionne sans régler aucune variable :**

1. hPanel → **Websites → Add website → Node.js Web App**.
2. Choisissez **Import Git Repository** (si le code est sur GitHub) ou **Upload your files**
   (envoi direct du dossier du projet en `.zip`).
3. Fichier de démarrage : `server.js`.
4. Cliquez sur **Deploy**. C'est tout — aucune variable d'environnement n'est obligatoire, le
   site fonctionne immédiatement à l'URL fournie.

**Variables à ajouter seulement une fois que le site fonctionne** (Environment Variables du
tableau de bord de l'app), pour renforcer la sécurité :
- `SESSION_SECRET` : une phrase aléatoire longue, pour signer les sessions de connexion.
- `COOKIE_SECURE=true` : **à ajouter seulement après avoir vérifié que le site s'ouvre bien en
  `https://`** dans le navigateur. Si vous l'activez trop tôt (avant confirmation du HTTPS), les
  connexions du staff (caisse/cuisine/admin) peuvent échouer silencieusement — testez d'abord
  sans cette variable.

**Sauvegarder avant de mettre à jour le code plus tard** : sur ce mode de déploiement (upload
ponctuel ou redéploiement manuel), vos données restent en place tant que vous ne redéployez pas.
Si un jour vous mettez à jour le code (nouveau ZIP ou nouveau push Git), **exportez d'abord une
sauvegarde** depuis `Admin → Sauvegardes` (Excel ou JSON) par précaution, au cas où le
redéploiement écraserait le dossier `data/`. Ce n'est utile qu'au moment d'une mise à jour du
code — pas pour l'usage quotidien du restaurant.

*Point d'attention (déjà géré dans le code) : l'écran cuisine et les notifications utilisent une
technologie de temps réel (WebSocket). Si l'infrastructure de Hostinger ne la relaie pas
parfaitement, un rafraîchissement automatique toutes les 15-20 secondes prend le relais — l'appli
reste donc fonctionnelle dans tous les cas.*

### Étape 3 — Déployer sur Render (alternative, gratuite pour commencer)

Le fichier `render.yaml` fourni configure tout automatiquement, disque persistant inclus.

1. Créez un compte sur [render.com](https://render.com) et connectez votre compte GitHub.
2. Cliquez sur **New → Blueprint**, sélectionnez votre dépôt `le-bon-refuge`.
3. Render détecte `render.yaml` et propose de créer :
   - un **Web Service** Node.js (build : `npm install`, démarrage : `npm start`) ;
   - un **disque persistant** de 1 Go monté sur `/var/data`, dans lequel `DATA_DIR` et
     `UPLOADS_DIR` sont automatiquement redirigés — vos commandes, votre menu et vos photos
     survivront donc aux redéploiements ;
   - les variables `SESSION_SECRET` et `COOKIE_SECURE` (Render gère le HTTPS de façon fiable,
     donc `COOKIE_SECURE=true` est activé sans risque dès le départ sur cette plateforme).
4. Cliquez sur **Apply**. Au bout de quelques minutes, Render vous donne une URL du type
   `https://le-bon-refuge.onrender.com` — c'est votre site, en ligne, en HTTPS.

Sans `render.yaml` (configuration manuelle) : créez un **Web Service** pointant sur votre repo,
build command `npm install`, start command `npm start`, ajoutez un disque persistant sur
`/var/data`, puis définissez les variables d'environnement `NODE_ENV=production`,
`COOKIE_SECURE=true`, `SESSION_SECRET` (valeur aléatoire), `DATA_DIR=/var/data`,
`UPLOADS_DIR=/var/data/uploads`.

**Important (plan gratuit Render)** : un service gratuit se met en veille après 15 minutes
d'inactivité et met quelques secondes à se réveiller au premier accès suivant. Pour un usage
restaurant en continu, un plan payant "Starter" (sans mise en veille) est recommandé.

### Alternatives

- **Railway** ([railway.app](https://railway.app)) : fonctionnement très similaire (déploiement
  depuis GitHub, ajout d'un "Volume" persistant, variables d'environnement identiques).
- **Fly.io** : plus technique (CLI requise), mais offre aussi des volumes persistants.
- **VPS classique** (OVH, Hetzner, DigitalOcean...) : vous gardez la main sur tout, `data/` et
  `public/uploads/` restent alors sur le disque du serveur sans configuration particulière
  (pas besoin de `DATA_DIR`/`UPLOADS_DIR`). Il faut en revanche gérer soi-même Node.js, un
  reverse proxy (nginx) et le certificat HTTPS (ex. via Let's Encrypt/Certbot).

### Ce qui ne change pas une fois en ligne

Le fonctionnement reste identique : mêmes comptes, même interface admin/caisse/cuisine, mêmes
exports Excel/JSON. Pensez simplement à :
- changer les mots de passe par défaut dès la mise en ligne ;
- mettre à jour `NUMERO_WHATSAPP`, `NUMERO_TELEPHONE`, `LIEN_TIKTOK`, `LIEN_FACEBOOK` dans
  `public/js/site.js` avant de pousser sur GitHub ;
- exporter régulièrement une sauvegarde JSON (`Admin → Sauvegardes`), en plus du disque
  persistant, pour garder une copie de secours de vos données.
