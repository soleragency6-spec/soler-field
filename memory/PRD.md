# FieldPro — Produit (PRD)

## Problème / Vision
SaaS mobile marque blanche pour les professionnels de terrain (plombiers, couvreurs,
électriciens, chauffagistes, techniciens, etc.). Le pro documente son intervention à la voix,
en photos et en notes ; l'app structure l'information, génère un rapport puis une facture,
que le pro relit, valide et envoie. Objectif : supprimer le travail administratif post-intervention,
sans jamais retirer le contrôle humain. Interface 100 % en français.

## Décisions d'architecture (validées avec le client)
- **Base de données / Auth : Supabase (PostgreSQL + Supabase Auth)** = source de vérité.
- **Multi-tenant** : chaque ressource métier porte `workspace_id`. Isolation stricte par **RLS**
  (le backend FastAPI exécute chaque requête via `SET LOCAL ROLE authenticated` + `request.jwt.claims`).
- Schéma isolé dans le schéma Postgres **`fieldpro`** (pour cohabiter avec un ancien schéma présent).
- **Backend** : FastAPI + asyncpg. JWT Supabase vérifié via JWKS (ES256).
- **Stockage fichiers** : adaptateur **Cloudflare R2** prêt (désactivé tant que les clés ne sont pas
  fournies) → stockage disque backend temporaire + URLs signées HMAC. Bascule R2 = config env only.
- **Email** : adaptateur **Resend** prêt (désactivé) → emails stockés en `draft`/`pending`.
- **IA** : couche provider-agnostique. V1 = génération de rapport **déterministe/template** (aucune clé
  payante requise). Dictée = reconnaissance vocale native du navigateur (web) / micro clavier (natif),
  transcription toujours éditable. Aucune dépendance à la clé Emergent.
- **Stripe** : non branché (architecture d'abonnement préparée : `subscriptions`, statut workspace,
  activation manuelle via Super Admin).
- Anti-hallucination : jamais inventer un fait/prix/mesure ; champs manquants = "À renseigner"/"À confirmer".

## Entités (schéma fieldpro)
workspaces, workspace_members (owner/admin/technician), app_admins, brand_settings (profil+marque),
clients, interventions, intervention_events (timeline), media (métadonnées + storage_key), reports,
services, invoices, invoice_items, quotes, quote_items, document_templates, emails, subscriptions, audit_logs.

## Implémenté (2026-09-21)
- Auth Supabase (login, mot de passe oublié, sessions persistantes, déconnexion, routes protégées).
- Provisioning auto d'un workspace + brand + subscription à la 1re connexion d'un pro.
- Marque blanche dynamique (nom société, nom app, couleurs) appliquée dans toute l'UI + PDF.
- CRM Clients : liste, recherche, création, fiche 360° (interventions/factures/rapports/emails).
- Nouvelle intervention + sélection/creation client + **Field Mode** (Dicter/Photo/Vidéo/Note + timeline).
- Upload média (photo/vidéo) via caméra/galerie avec gestion des permissions ; légendes de photo.
- Génération de rapport (déterministe, anti-hallucination) → éditeur → **Valider** → PDF verrouillé.
- Facture depuis intervention (suggestion via catalogue de prestations) → éditeur lignes → **Finaliser**
  (numérotation FAC-AAAA-####, verrouillage comptable, PDF).
- Catalogue Prestations & Tarifs (prix null → "À renseigner").
- Envoi email (brouillon + pièces jointes Rapport/Facture) — reste `pending` tant que Resend non configuré.
- Documents (Rapports/Factures/Devis), Dashboard (stats, stockage), Réglages/marque blanche.
- Super Admin (/admin) : liste des workspaces, suspendre/activer, création de compte (nécessite service_role).
- PDF générés (rapport + facture) avec en-tête/pieds de page brandés (fpdf2 + police Unicode).

## Ajouté (2026-09-21 — itération 2)
- **Modèles de documents importés** (PDF/DOCX/image) pour Rapports/Factures/Devis : upload,
  analyse de structure (sections/ordre via pypdf + python-docx, heuristique de titres), liste,
  définition d'un modèle par défaut, suppression, aperçu de l'original (URL signée).
- **Priorité au modèle du pro** : la génération de rapport reproduit les titres/l'ordre des
  sections du modèle par défaut (meta.template_used=true), en conservant la règle anti-hallucination.
- **Devis complets** à parité avec les factures : création depuis intervention/catalogue, éditeur de
  lignes (qté, PU, TVA, remise), date de validité, conditions/notes, totaux, numérotation DEV-AAAA-####,
  PDF brandé (« DEVIS » + validité), verrouillage, statuts draft/final/sent, envoi email (pièce jointe devis),
  historique dans l'onglet Documents. Bouton « Créer un devis » depuis un rapport validé.
- **Couche IA prête (non activée)** : hooks provider `transcribe`, `rewrite`, `ocr`, `analyze_image`,
  `analyze_template` renvoient None sans clé payante ; le cœur reste 100 % utilisable sans IA payante.
- Tests automatisés : 18/18 backend (templates + devis) au vert.

## En attente (fournir par le client pour activer)
- **Clé Supabase `service_role` complète** (l'actuelle est tronquée) → active la création de comptes par le Super Admin.
- **Identifiants Cloudflare R2** (R2_ACCOUNT_ID/ACCESS_KEY/SECRET/BUCKET) → bascule stockage production.
- **Clé API Resend + domaine expéditeur** → active l'envoi réel des emails.

## Backlog priorisé
- P1 : Import & analyse de modèles de rapports/factures/devis fournis par le client (PDF/DOCX/image).
- P1 : Devis complets (éditeur + PDF + envoi) au même niveau que les factures.
- P1 : Intégration IA optionnelle (OpenAI/Gemini/Whisper) via la couche provider pour réécriture/OCR/vision.
- P2 : Stripe (abonnements mensuels/annuels, portail client, sièges employés).
- P2 : Comptes multi-employés (WorkspaceMembers déjà en base), rôles, sièges facturés.
- P2 : Corbeille (soft-delete déjà en place), export RGPD, quotas de stockage configurables par plan.
- P2 : Recherche globale avancée + filtres date, planning/calendrier, signature client.

## Comptes de test
Voir /app/memory/test_credentials.md
