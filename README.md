# DeepCorp

Idle mobile déguisé en vieux logiciel de bureau. On entre stagiaire au service Courrier d'une entreprise
banale, on automatise son travail, on monte en grade… et on remarque peu à peu que DeepCorp cache quelque chose.

Ce dépôt contient le **prototype jouable de l'étage 1** (Courrier) :

- introduction : la lettre, le contrat signé au doigt, le démarrage de DeepOS 95 ;
- 3 postes (stagiaire, employé, chef d'équipe) et 3 tâches en chaîne : tri → affranchissement → tournées ;
- niveaux (coût ×1,15), paliers ×2, macro assistée au niveau 10, subordonnés qui travaillent hors ligne ;
- goulot d'étranglement affiché en rouge, surplus écoulé au tarif de l'étape précédente ;
- fournitures, cafés (boost ×2), colis express, visite du directeur, mails de Hale ;
- production hors ligne plafonnée, avenant à signer et dézoom dans le bâtiment à chaque promotion.

Les pubs sont simulées dans ce prototype (boutons « pub »).

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173, à ouvrir aussi depuis un téléphone sur le même réseau
npm test         # tests de l'économie
npm run build    # vérification des types + build dans dist/
```

## Ajouter du contenu

Tout le contenu est dans `src/data/content.ts` : tâches, postes, fournitures, mails. Le moteur (`src/engine/`)
ne connaît aucun texte. Pour un nouvel étage : ajouter ses tâches à `CHAIN` et `TASKS`, ses postes à `POSTES`,
puis une vue de mini-jeu dans `src/ui/tasks.ts`.
