# Mission Pierrot

Petite app mobile pour un jeu de l'assassin à killer unique. Pierrot est le seul utilisateur authentifié; les autres personnes sont des cibles visibles seulement après connexion. GitHub Pages sert le frontend et Cloudflare Workers/D1/R2 stockent l'état et les photos chiffrées.

## Architecture

- `docs/`: frontend statique publié avec GitHub Pages.
- `worker/src/index.js`: API protégée par un mot de passe unique et une session temporaire.
- `worker/migrations/0001_initial.sql`: tables `events`, `targets`, `victories` et `sessions`.
- `worker/event.local.json`: noms, défis et mot de passe local, ignoré par Git.
- Cloudflare D1: événement, cibles, victoires et horodatages.
- Cloudflare R2: photos chiffrées AES-GCM, jamais le JPEG original.

## Mise en place

1. Installer Node.js, puis exécuter `npm install`.
2. Exécuter `npx wrangler login`.
3. Créer la base: `npx wrangler d1 create killer-game`.
4. Copier le `database_id` obtenu dans `wrangler.jsonc`.
5. Créer le stockage: `npx wrangler r2 bucket create killer-game-photos`.
6. Appliquer la migration: `npx wrangler d1 migrations apply killer-game --remote`.
7. Copier `worker/event.example.json` vers `worker/event.local.json`, puis y renseigner le mot de passe, les cibles et leurs défis.
8. Générer le seed privé: `npm run seed`.
9. Injecter le seed: `npx wrangler d1 execute killer-game --remote --file=.private/seed.sql`.
10. Déployer le Worker: `npm run deploy`.
11. Remplacer `apiOrigin` dans `docs/config.js` par l'URL réelle du Worker.
12. Dans les réglages GitHub, publier `main` depuis `/docs`.

`worker/event.local.json`, `.private/seed.sql` et les dépendances sont ignorés par Git.

## Comportement

Pierrot voit la liste complète des cibles. Pour chacune:

1. il réalise la condition;
2. il clique sur « Condition respectée »;
3. le Worker enregistre immédiatement la date et l'heure UTC;
4. il peut sélectionner une photo;
5. le navigateur compresse puis chiffre la photo avec une clé dérivée du mot de passe;
6. seul le blob chiffré est envoyé dans R2.

Les cibles ne se connectent pas et ne disposent d'aucun mot de passe.
