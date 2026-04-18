# mathtype

Entraîneur de calcul mental minimaliste. Trois modes : calcul mental, algèbre, matrices.

## Fonctionnalités

- **3 onglets** : calcul mental (+, −, ×, mixed), algèbre (linéaire, 2 étapes, x des 2 côtés), matrices (det 2×2, det 3×3, trace, A×B élément)
- **Difficulté adaptative** : plus tu enchaînes les bonnes réponses, plus les problèmes deviennent durs
- **Panneau de scores** : 3 meilleurs + dernier score, par onglet et par durée, avec indicateur de difficulté couleur
- **Persistance** locale via `localStorage`
- **Stats en temps réel** : cpm, correct, erreurs, streak

## Utilisation

Ouvre simplement `index.html` dans un navigateur. Aucune dépendance, aucun build.

Pour le développement avec live-reload :

```bash
npx live-server
```

## Structure

```
.
├── index.html    # structure
├── styles.css    # thème sombre monospace
└── app.js        # logique de jeu
```

## Raccourcis

- `entrée` : valider la réponse / démarrer une partie
- `espace` : démarrer une partie depuis l'écran d'accueil
