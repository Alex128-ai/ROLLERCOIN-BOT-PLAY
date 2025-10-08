# Briefing technique – Bot RollerCoin

## 1. Vue d'ensemble
- **Objectif** : automatiser les mini-jeux RollerCoin en contrôlant un navigateur Chromium via Puppeteer Extra et un plugin Stealth pour limiter la détection anti-bot.【F:index.mjs†L2-L25】
- **Entrée principale** : `index.mjs` lance le navigateur, instancie le bot et injecte un gestionnaire WebSocket pour écouter les mises à jour du jeu en temps réel.【F:index.mjs†L5-L52】【F:ws_handler.mjs†L6-L50】
- **Composants clés** :
  - `Bot` gère les états de jeu, la capture du canvas et l'exécution des solveurs spécifiques à chaque mini-jeu.【F:bot.mjs†L30-L654】
  - `ModalHandler` ferme automatiquement les pop-ups bloquants afin que le bot puisse jouer en continu.【F:modals-handler.mjs†L7-L60】
  - `Storage` expose des helpers pour la persistance des cookies (actuellement non activés dans `index.mjs`).【F:index.mjs†L27-L31】【F:storage.mjs†L1-L21】

## 2. Fonctionnalités existantes
### 2.1 Gestion du navigateur & page
- Lancement de Chromium non headless avec profil dédié `.user_data` pour conserver la session RollerCoin.【F:index.mjs†L12-L26】
- Injection automatique de la librairie `pako` (compression) lors du chargement initial et à chaque navigation d'iframe pour la capture compressée des frames de jeu.【F:index.mjs†L34-L52】

### 2.2 Cycle de vie du bot
- Initialisation : exposition de multiples fonctions côté page (recording, tests, démarrage de partie, résolution, auto-play) afin de piloter le bot depuis la console du navigateur.【F:bot.mjs†L107-L128】
- Catalogue des jeux : table `GAMES` définissant divIndex et solveur à utiliser pour chaque mini-jeu RollerCoin pris en charge.【F:bot.mjs†L30-L47】
- Auto-play : boucle `#consumeAutoPlayTokensLoop` qui sélectionne un jeu prêt via `#pickNextReadyGame`, lance la partie, résout et décrémente un compteur de jetons automatiques.【F:bot.mjs†L618-L647】
- Gestion des cool-downs : chaque `Game` maintient son délai de disponibilité via timers pour rejouer quand le cooldown est terminé.【F:bot.mjs†L49-L73】

### 2.3 Capture & résolution de jeu
- `recordGame` : enregistre des captures d'écran du canvas et leurs dimensions, utiles pour entraîner ou déboguer des solveurs.【F:bot.mjs†L182-L236】
- `playTestCanvasMovie` & `createTestCanvas` : rejouent une séquence enregistrée dans un canvas factice pour tester les solveurs hors ligne.【F:bot.mjs†L238-L291】【F:bot.mjs†L367-L392】
- `resolveGameWhenReady` : boucle temps réel qui capture une zone du canvas, compresse les pixels, les transmet au solveur correspondant puis exécute les clics/mouvements retournés (avec overlay de debug optionnel).【F:bot.mjs†L424-L582】

### 2.4 Automatisation de l'UI
- `ModalHandler` : surveille les modales RollerCoin (collecte de récompenses, fermeture d'annonces) et clique sur les boutons pour que les parties s'enchaînent sans intervention humaine.【F:modals-handler.mjs†L19-L55】
- `comeBackToGamesMenuAfterGameWinLoop` : détecte le bouton « Choose Game » après une victoire et revient au menu pour lancer la partie suivante.【F:bot.mjs†L583-L604】

## 3. Points d'attention / dette technique
- **Solveurs manquants** : les imports `./solvers/*.mjs` référencés dans `bot.mjs` ne sont pas présents dans le dépôt, ce qui provoquera une erreur d'exécution dès l'initialisation d'un jeu disposant d'un solveur dédié.【F:bot.mjs†L1-L47】
- **Persistance de session incomplète** : le chargement/sauvegarde des cookies est désactivé (`Storage.loadCookies` commenté), obligeant à se reconnecter à chaque lancement si la session RollerCoin expire.【F:index.mjs†L27-L31】【F:storage.mjs†L1-L21】
- **Robustesse** : peu de gestion d'erreurs/logging structuré dans les boucles infinies (ex. `#consumeAutoPlayTokensLoop`, `resolveGameWhenReady`). Une exception non gérée peut bloquer le bot sans alerte.【F:bot.mjs†L618-L647】【F:bot.mjs†L424-L582】
- **Documentation** : le README actuel est minimal et ne couvre ni l'installation (ex: dépendance native `canvas`) ni les paramètres d'exécution.【F:README.md†L1-L2】

## 4. Axes d'amélioration prioritaires
1. **Restaurer ou stubber les solveurs manquants** pour éviter les crashs au démarrage et permettre des tests unitaires par jeu. Ajouter un fallback désactivant automatiquement un jeu si son solveur est indisponible.【F:bot.mjs†L137-L166】
2. **Finaliser la persistance de session** : activer `Storage.loadCookies`/`saveCookies`, prévoir la création automatique du dossier `storage` et gérer les erreurs d'E/S.【F:index.mjs†L27-L31】【F:storage.mjs†L10-L21】
3. **Renforcer la résilience** : encapsuler les boucles principales avec des garde-fous (timeouts, retries) et exposer des métriques/logs (durée de résolution, erreurs solveur) pour le monitoring.【F:bot.mjs†L424-L647】
4. **Documenter et industrialiser** : enrichir le README avec les prérequis système (librairies pour `canvas`), les instructions d'installation, de configuration (autoPlay, debug), et un guide d'extension pour ajouter de nouveaux solveurs.【F:README.md†L1-L2】【F:bot.mjs†L82-L99】

## 5. Idées pour la suite
- **Interface de pilotage** : créer une UI (CLI ou web) pour activer/désactiver les jeux auto-play sans modifier le code, en s'appuyant sur `autoPlayGames` et `addAutoPlayTokens`.【F:bot.mjs†L82-L128】【F:bot.mjs†L649-L653】
- **Système de plugins de solveur** : factoriser `Solver` pour charger dynamiquement des modules via configuration JSON et faciliter le partage/MAJ des stratégies.【F:games-solvers.mjs†L10-L200】
- **Tests de régression** : utiliser les fonctions de replay (`playTestCanvasMovie`) pour comparer automatiquement les décisions d'un solveur avant/après modification.【F:bot.mjs†L238-L291】
- **Observabilité** : intégrer une couche de logging structurée (ex. Pino) et, à terme, un dashboard Prometheus/Grafana pour suivre le taux de réussite des parties et détecter les dérives.

## 6. Checklist d'onboarding pour ton collègue
- Installer les dépendances (`npm install`) et vérifier que les prérequis système pour `canvas` sont présents.
- Lancer `node index.mjs`, se connecter à RollerCoin manuellement (en attendant l'activation de la persistance de cookies).
- Depuis la console du navigateur, utiliser `window.addAutoPlayTokens(<nb>, <debug>)` pour démarrer l'auto-play, après avoir validé que les solveurs nécessaires sont accessibles.
- Surveiller les logs de la console Node pour confirmer la rotation des jeux et les éventuelles erreurs de solveur.

---
_N'hésite pas à adapter ce briefing à votre workflow (ex. ajout d'un plan de tests ou de consignes de sécurité selon vos contraintes internes)._ 
