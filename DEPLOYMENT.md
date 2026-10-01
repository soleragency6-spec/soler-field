# Déploiement autonome SOLER FieldPro

Le projet ne dépend plus d'Emergent pour son exécution. `backend/Dockerfile` et `render.yaml` déploient l'API FastAPI sur Render, tandis que `.github/workflows/deploy-pages.yml` construit et publie le web Expo sur GitHub Pages.

## API

Créer le service depuis `render.yaml`, puis renseigner `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWKS_URL` et `DATABASE_URL`. La clé service Supabase, si nécessaire pour les fonctions d'administration, reste uniquement dans les variables serveur.

## Frontend

Activer Pages avec la source **GitHub Actions**. Ajouter dans les variables du dépôt : `BACKEND_URL`, `SUPABASE_URL` et `SUPABASE_ANON_KEY`. Chaque push sur `main` déclenche le build web.

## Local

```bash
cd frontend
yarn install
EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:8000 yarn web
```

Le backend se lance avec `uvicorn server:app --reload --port 8000` depuis `backend` après installation de `requirements.txt` et configuration de `.env`.
