// Guide utilisateur d'Amivet PULSE — SOURCE UNIQUE.
//
// Deux lecteurs :
//   - l'application (menu ⚙️ → Guide utilisateur & FAQ), via src/settings.js ;
//   - l'email d'invitation envoyé par manage-users (_shared/access-email.ts).
// Le fichier est en JavaScript pur, sans dépendance, pour être importable à la
// fois par Vite (front) et par Deno (Edge Function). Modifier le guide ici le
// modifie aux deux endroits ; l'Edge Function manage-users doit être redéployée
// pour que l'email suive.
//
// Le contenu est du HTML statique de confiance, limité à <strong>, <em> et
// <br> : aucune donnée utilisateur n'y entre. Les champs « texte » (titres,
// libellés, questions) sont échappés au rendu.
//
// Chaque affirmation a été vérifiée contre le code le 01/10/2026. Quand une
// fonctionnalité change d'interface, son paragraphe ici change dans le même commit.

/* ------------------------------------------------------------------ */
/* Audiences                                                          */
/* ------------------------------------------------------------------ */

// 'associe' couvre l'admin et le vétérinaire associé : même interface, les
// actions propres à l'admin sont marquées « (admin) » dans le texte.
export function guideAudience(role) {
  if (role === 'asv') return 'asv';
  if (role === 'vet_employe') return 'salarie';
  return 'associe';
}

/* ------------------------------------------------------------------ */
/* Contenu                                                            */
/* ------------------------------------------------------------------ */

const sectionIntroAssocie = {
  id: 'intro',
  blocks: [
    {
      t: 'lead',
      html: "Amivet PULSE est l'outil de planning et de suivi RH de la Clinique Vétérinaire Amivet. Il remplace les feuilles papier, emails et tableurs par une interface unique, accessible depuis n'importe quel appareil.",
    },
    {
      t: 'cards',
      items: [
        { icon: '📅', title: 'Planning centralisé', html: "Présences et absences des vétérinaires et des ASV, à jour en temps réel pour toute l'équipe." },
        { icon: '⏱️', title: 'Heures ASV', html: 'Postes Ouverture / Fermeture / Demi-journée, H.supp. et H.manq. : totaux du jour et de la semaine calculés automatiquement.' },
        { icon: '✍️', title: 'Signature électronique', html: 'Feuilles de présence mensuelles et prévisionnel annuel des ASV, signés par lien email, horodatés et archivés.' },
        { icon: '📋', title: 'Congés', html: 'Les demandes des ASV et des vétérinaires salariés se valident dans le tableau de bord. Compteur de CP tenu pour chaque ASV.' },
        { icon: '📣', title: 'Annonces', html: "Messages pour toute l'équipe, les vétérinaires ou les ASV, avec badge « non lu »." },
        { icon: '🔐', title: 'Accès par rôle', html: 'Quatre rôles : Admin, Vétérinaire associé, Vétérinaire salarié, ASV. Chacun ne voit que les outils qui le concernent.' },
      ],
    },
    {
      t: 'info',
      html: "<strong>Qui fait quoi ?</strong><br>• <strong>Admin</strong> : tout ce que fait un associé, plus la gestion des collaborateurs, les annonces, les signalements et l'ajustement des CP.<br>• <strong>Vétérinaire associé</strong> : planning complet, validation des demandes, feuilles de présence et prévisionnels des ASV, tableau de bord.<br>• <strong>Vétérinaire salarié</strong> : saisit ses présences et ses congés sur le calendrier vétérinaire ; ses congés sont validés par les associés.<br>• <strong>ASV</strong> : saisit sa ligne de planning et ses demandes d'absence, signe sa feuille de présence et son prévisionnel.",
    },
  ],
};

const sectionIntroSalarie = {
  id: 'intro',
  blocks: [
    {
      t: 'lead',
      html: "Amivet PULSE est l'outil de planning de la Clinique Vétérinaire Amivet. Vous y renseignez vos jours de présence, vous y posez vos congés et vous consultez le planning de toute l'équipe.",
    },
    {
      t: 'cards',
      items: [
        { icon: '📅', title: 'Votre planning', html: "Vos présences et absences sur le calendrier vétérinaire, saisies avec une barre d'outils simple." },
        { icon: '🏖️', title: 'Vos congés', html: 'Posez une demande de congé : les associés la valident, vous voyez son statut dans le calendrier.' },
        { icon: '👀', title: "Le planning de l'équipe", html: 'Calendriers vétérinaires et ASV, vue annuelle, prévisionnel.' },
        { icon: '📣', title: 'Annonces', html: "Les messages adressés à toute l'équipe et aux vétérinaires." },
      ],
    },
    {
      t: 'info',
      html: "<strong>Réservé aux associés et à l'admin</strong> : tableau de bord, validation des demandes, réglages de l'application et gestion des collaborateurs. Le planning ASV vous est accessible en lecture.",
    },
  ],
};

const sectionIntroAsv = {
  id: 'intro',
  blocks: [
    {
      t: 'lead',
      html: "Amivet PULSE est l'outil de planning de la Clinique Vétérinaire Amivet. Vous y renseignez votre planning, vous suivez vos heures, vous soumettez vos demandes d'absence et vous signez électroniquement votre feuille de présence.",
    },
    {
      t: 'cards',
      items: [
        { icon: '📅', title: 'Votre planning', html: 'Vos postes, présences et absences, au mois ou à la semaine.' },
        { icon: '⏱️', title: 'Vos heures', html: 'Heures du jour, H.supp., H.manq. et total de la semaine, calculés automatiquement.' },
        { icon: '✍️', title: 'Signature en ligne', html: 'Feuille de présence mensuelle et prévisionnel annuel, signés depuis un lien reçu par email.' },
        { icon: '🏖️', title: "Demandes d'absence", html: 'Congés soumis aux vétérinaires pour validation ; arrêt maladie et accident du travail saisis directement.' },
      ],
    },
    {
      t: 'info',
      html: "Vous voyez les calendriers des vétérinaires et des ASV, mais vous ne modifiez que <strong>votre propre ligne</strong>. Valider des demandes, envoyer des feuilles de présence et accéder au tableau de bord est réservé aux vétérinaires associés et à l'admin.",
    },
  ],
};

const sectionRoutineAssocie = {
  id: 'routine',
  blocks: [
    { t: 'h', text: 'Au quotidien' },
    {
      t: 'steps',
      items: [
        { title: 'Vérifier les badges', html: 'Un badge rouge sur 📊 Tableau de bord signale une demande à traiter ; sur 📣 Annonces, une annonce non lue.' },
        { title: 'Traiter les demandes', html: 'Tableau de bord > 📋 Demandes de congé et de modification. Les modifications ASV à moins de deux semaines sont regroupées en tête, dans « 🔔 Modifications urgentes ».' },
        { title: 'Saisir les absences imprévues', html: '🩺 Vétérinaires > Calendrier mensuel pour un vétérinaire, 🐾 ASV > Calendrier mensuel pour une ASV.' },
      ],
    },
    { t: 'h', text: 'En cours de semaine' },
    {
      t: 'steps',
      items: [
        { title: 'Ajuster les postes ASV', html: '🐾 ASV > Calendrier mensuel, outils 🟢 Ouverture, 🌿 Fermeture, 🩷 Demi-j. La colonne <strong>Alertes</strong> signale un dépassement de 42h dans la semaine ou une ouverture / fermeture non couverte.' },
        { title: 'Saisir H.supp. et H.manq.', html: '🐾 ASV > ⏱️ Hebdomadaire : une liste par jour, par pas de 15 minutes.' },
      ],
    },
    { t: 'h', text: 'En fin de mois' },
    {
      t: 'steps',
      items: [
        { title: 'Vérifier chaque ASV', html: 'Parcourir les semaines du mois dans ⏱️ Hebdomadaire : postes, H.supp. et H.manq.' },
        { title: 'Demander les signatures', html: 'En bas du calendrier mensuel ASV, panneau « ✍️ Feuille de présence » → <strong>📧 Demander la signature</strong> pour chaque ASV.' },
        { title: 'Suivre et clôturer', html: 'Tableau de bord > ✍️ Feuilles signées pour le suivi. <strong>🔒 Clôturer</strong> le mois ASV bloque ensuite les modifications des ASV sur ce mois.' },
      ],
    },
  ],
};

const sectionRoutineSalarie = {
  id: 'routine',
  blocks: [
    { t: 'h', text: 'Chaque mois' },
    {
      t: 'steps',
      items: [
        { title: 'Renseigner vos présences', html: '🩺 Vétérinaires > Calendrier mensuel, outil <strong>✅ Présence</strong> : peignez les demi-journées travaillées sur votre ligne. Une case vide vaut repos.' },
        { title: "Poser vos congés à l'avance", html: "Outil <strong>🔵 Congé</strong> : la demande part aux associés. Elle reste en attente ⏳ jusqu'à leur décision." },
        { title: 'Vérifier les décisions', html: "Une demande approuvée s'affiche avec ✓ ; une demande refusée affiche « ⚠️ Voir vétérinaire »." },
      ],
    },
    { t: 'h', text: "En cas d'imprévu" },
    {
      t: 'steps',
      items: [
        { title: 'Arrêt maladie ou accident', html: 'Outils <strong>🤒 Maladie</strong> ou <strong>🤕 Accident</strong> : saisie directe, sans validation.' },
        { title: 'Corriger une erreur', html: 'Outil <strong>🧹 Gomme</strong> sur la case concernée.' },
      ],
    },
  ],
};

const sectionRoutineAsv = {
  id: 'routine',
  blocks: [
    { t: 'h', text: 'En cours de mois' },
    {
      t: 'steps',
      items: [
        { title: 'Consulter votre planning', html: '🐾 ASV > Calendrier mensuel pour le mois, ⏱️ Hebdomadaire pour le détail de la semaine (poste, H.supp., H.manq., heures).' },
        { title: 'Poser vos absences', html: "Outil <strong>🔵 Congé</strong> dans la barre d'outils : la demande part aux vétérinaires pour validation. Pensez au délai de prévenance de 15 jours." },
        { title: 'Suivre les validations', html: "Une demande en attente affiche ⏳. Toute modification de votre planning à moins de deux semaines apparaît en <strong>violet</strong> jusqu'à sa validation." },
      ],
    },
    { t: 'h', text: 'En fin de mois' },
    {
      t: 'steps',
      items: [
        { title: "Recevoir l'email de présence", html: 'Votre responsable vous envoie le récapitulatif du mois : jours, H.supp., départs anticipés, solde.' },
        { title: 'Vérifier', html: "Lisez le tableau jour par jour. En cas d'erreur, prévenez votre responsable <em>avant</em> de signer." },
        { title: 'Signer', html: 'Bouton <strong>✍️ Je certifie et signe ma feuille de présence</strong>. La signature est horodatée et archivée ; le lien est à usage unique.' },
      ],
    },
  ],
};

const sectionScenariosAssocie = {
  id: 'scenarios',
  blocks: [
    {
      t: 'scenario',
      title: 'Saisir une présence ou une absence vétérinaire',
      steps: [
        'Aller dans <strong>🩺 Vétérinaires</strong> > <strong>Calendrier mensuel</strong>',
        "Cliquer sur la demi-journée : chaque clic fait défiler <strong>Vide → Présent → Absent</strong>. Glisser remplit plusieurs cases d'un coup",
        "Pour préciser le motif : <strong>appui long</strong> (environ une demi-seconde) sur la case → fenêtre « Motif d'absence », texte libre ou raccourcis Vacances, Formation, Congrès, Maladie, RTT, Rendez-vous médical",
      ],
      tip: '💡 En tête de chaque jour : ✏️ édite la journée entière, 💬 ajoute un commentaire, 🏥 ferme la clinique ce jour, ⏰ enregistre une fermeture anticipée (qui réduit les heures ASV).',
    },
    {
      t: 'scenario',
      title: 'Commenter une journée',
      steps: [
        '🩺 Vétérinaires > Calendrier mensuel → bouton <strong>💬</strong> en tête du jour',
        'Saisir le commentaire → <strong>Enregistrer</strong>',
        "Le jour porte alors une <strong>pastille</strong> ; son texte s'affiche au survol, pour toute l'équipe, sur les calendriers vétérinaire et ASV",
      ],
    },
    {
      t: 'scenario',
      title: "Planifier les postes d'une ASV",
      steps: [
        'Aller dans <strong>🐾 ASV</strong> > <strong>Calendrier mensuel</strong>',
        'Choisir un outil : 🟢 Ouverture, 🌿 Fermeture, 🩷 Demi-j., 🔵 Congé, 🤒 Maladie, 🤕 Accident ou 🧹 Gomme',
        'Peindre les demi-journées concernées ; ↩️ (ou Cmd/Ctrl+Z) annule la dernière action',
        'Surveiller la colonne <strong>Alertes</strong> : plafond de 42h par semaine, couverture ouverture / fermeture',
      ],
      tip: '💡 Double-clic sur un jour du calendrier ASV : ouvre directement la semaine dans ⏱️ Hebdomadaire.',
    },
    {
      t: 'scenario',
      title: "Saisir les heures supplémentaires d'une ASV",
      steps: [
        "Aller dans <strong>🐾 ASV</strong> > <strong>⏱️ Hebdomadaire</strong> et choisir l'ASV",
        'Les jours sont en colonnes. Ligne <strong>Poste</strong> : le bouton bascule O ↔ F',
        'Lignes <strong>H.supp.</strong> et <strong>H.manq.</strong> : choisir la durée dans la liste, par pas de 15 minutes',
        'La ligne <strong>Heures</strong> donne le total du jour, le bandeau <strong>Total semaine</strong> celui de la semaine',
      ],
    },
    {
      t: 'scenario',
      title: 'Faire signer une feuille de présence',
      steps: [
        "Vérifier toutes les semaines du mois pour l'ASV concernée",
        '🐾 ASV > Calendrier mensuel → se placer sur le mois',
        "En bas de page, panneau <strong>« ✍️ Feuille de présence — [mois] »</strong> → <strong>📧 Demander la signature</strong> en face de l'ASV",
        "L'ASV reçoit un email avec le récapitulatif détaillé ; le lien est à usage unique et valable 7 jours",
        'Suivi dans <strong>📊 Tableau de bord</strong> > <strong>✍️ Feuilles signées</strong> (📄 PDF de la feuille signée, ✕ pour annuler une signature)',
      ],
      tip: "⚠️ Vérifiez les heures AVANT d'envoyer : l'ASV certifie en signant que les données sont exactes.",
    },
    {
      t: 'scenario',
      title: "Faire signer le prévisionnel annuel d'une ASV",
      steps: [
        'Aller dans <strong>🐾 ASV</strong> > <strong>🔮 Prévisionnel</strong>, mode <strong>Par ASV</strong>',
        "Ouvrir l'onglet de l'ASV → <strong>Demander la signature</strong>",
        "L'ASV reçoit un email avec le prévisionnel en PDF joint ; l'état des signatures se suit dans Tableau de bord > ✍️ Feuilles signées",
      ],
    },
    {
      t: 'scenario',
      title: 'Approuver ou refuser une demande',
      steps: [
        'Un badge rouge apparaît sur <strong>📊 Tableau de bord</strong> → <strong>📋 Demandes de congé et de modification</strong>',
        'Les demandes viennent des ASV et des vétérinaires salariés ; les modifications urgentes sont regroupées en tête',
        "Cliquer <strong>✓ Approuver</strong> ou <strong>✕ Refuser</strong> ; un refus exige un motif, visible par l'équipe",
      ],
      tip: '💡 Les arrêts maladie et accidents du travail ne passent pas par la validation.',
    },
    {
      t: 'scenario',
      title: 'Inviter un nouveau collaborateur (admin)',
      steps: [
        '⚙️ → <strong>👥 Gérer les collaborateurs</strong>',
        "Renseigner le prénom, l'email et le rôle : Vétérinaire associé, Vétérinaire salarié, ASV ou Admin",
        'Pour une ASV : nom de famille et temps de travail (Temps plein, 3/4 temps, Mi-temps, Certains jours)',
        "Cliquer <strong>📧 Envoyer l'invitation</strong> : le collaborateur reçoit un email avec son lien de connexion et ce guide, adapté à son rôle",
        "Il clique sur le lien, choisit son mot de passe et accède à l'application",
      ],
      tip: "💡 Email non reçu ? Ouvrir la fiche du collaborateur → <strong>📧 Renvoyer l'invitation</strong>.",
    },
    {
      t: 'scenario',
      title: 'Retirer un collaborateur (admin)',
      steps: [
        '⚙️ → 👥 Gérer les collaborateurs',
        '<strong>🗑️</strong> supprime uniquement le compte de connexion : le planning et la ligne du calendrier sont conservés, on peut réinviter la personne',
        "<strong>💣</strong> supprime définitivement le collaborateur et toutes ses données (planning, compte, prévisionnel, ajustements CP…). Une seconde confirmation est demandée s'il a des feuilles signées",
      ],
      tip: '⚠️ La suppression définitive est irréversible.',
    },
  ],
};

const sectionScenariosSalarie = {
  id: 'scenarios',
  blocks: [
    {
      t: 'scenario',
      title: 'Renseigner mes jours de présence',
      steps: [
        'Aller dans <strong>🩺 Vétérinaires</strong> > <strong>Calendrier mensuel</strong>',
        'Dans la barre « Outil », choisir <strong>✅ Présence</strong>',
        'Cliquer ou glisser sur les demi-journées travaillées de votre ligne',
      ],
      tip: '💡 Une case vide vaut repos : inutile de saisir vos jours non travaillés.',
    },
    {
      t: 'scenario',
      title: 'Demander un congé',
      steps: [
        'Calendrier mensuel vétérinaire → outil <strong>🔵 Congé</strong>',
        'Peindre les demi-journées concernées sur votre ligne',
        "La demande part aux associés et s'affiche en attente ⏳",
        "Approuvée, elle s'affiche avec ✓ ; refusée, elle affiche « ⚠️ Voir vétérinaire »",
      ],
    },
    {
      t: 'scenario',
      title: 'Déclarer un arrêt',
      steps: [
        'Outil <strong>🤒 Maladie</strong> ou <strong>🤕 Accident</strong>',
        'Peindre les demi-journées concernées : la saisie est directe, sans validation',
      ],
    },
    {
      t: 'scenario',
      title: 'Corriger une saisie',
      steps: [
        'Outil <strong>🧹 Gomme</strong> → cliquer sur la case à effacer',
        "Sur un bloc d'absence de plusieurs jours, un clic court efface tout le bloc ; un appui long permet de le défusionner",
      ],
    },
  ],
};

const sectionScenariosAsv = {
  id: 'scenarios',
  blocks: [
    {
      t: 'scenario',
      title: 'Consulter ma semaine',
      steps: [
        'Aller dans <strong>🐾 ASV</strong> > <strong>⏱️ Hebdomadaire</strong> ; les flèches ← → changent de semaine',
        'Les jours sont en colonnes. Ligne <strong>Poste</strong> : O (Ouverture) ou F (Fermeture)',
        'Lignes <strong>H.supp.</strong> et <strong>H.manq.</strong> : dépassements et heures manquantes, par pas de 15 minutes',
        'Ligne <strong>Heures</strong> : votre total du jour ; bandeau <strong>Total semaine</strong> : le total de la semaine',
      ],
      tip: '💡 Double-clic sur un jour du calendrier mensuel ASV : ouvre directement la semaine correspondante.',
    },
    {
      t: 'scenario',
      title: 'Renseigner mes postes',
      steps: [
        '🐾 ASV > <strong>Calendrier mensuel</strong>',
        'Dans la barre « Outil », choisir 🟢 Ouverture, 🌿 Fermeture ou 🩷 Demi-j.',
        'Peindre les demi-journées sur votre ligne ; 🧹 Gomme efface une case',
      ],
      tip: '🔒 Un mois clôturé par les vétérinaires ne peut plus être modifié.',
    },
    {
      t: 'scenario',
      title: 'Demander un congé',
      steps: [
        'Calendrier mensuel ASV → outil <strong>🔵 Congé</strong>',
        'Peindre les demi-journées concernées',
        'Fenêtre « Demande de congé » : choisir un raccourci ou saisir le motif → <strong>Soumettre la demande</strong>',
        "La demande part aux vétérinaires et s'affiche en attente ⏳ ; une fois approuvée, elle s'affiche avec ✓",
      ],
      tip: '⚠️ Une alerte vous prévient si la demande ne respecte pas le délai de prévenance de 15 jours.',
    },
    {
      t: 'scenario',
      title: 'Déclarer un arrêt maladie ou un accident du travail',
      steps: [
        'Outil <strong>🤒 Maladie</strong> ou <strong>🤕 Accident</strong>',
        'Peindre les demi-journées concernées : la saisie est directe, sans validation',
      ],
    },
    {
      t: 'scenario',
      title: 'Signer ma feuille de présence',
      steps: [
        'En fin de mois, vous recevez un email « Amivet PULSE — Signature feuille de présence [mois] »',
        'Lisez le récapitulatif : jours ouvrés, jours travaillés, H.supp., départs anticipés, solde net',
        'Consultez le tableau jour par jour : matin, après-midi, H.supp., départ anticipé, total',
        'Si tout est exact, cliquez sur <strong>✍️ Je certifie et signe ma feuille de présence</strong>',
        "Une page de confirmation s'affiche : votre signature est enregistrée avec la date et l'heure",
      ],
      tip: "⚠️ Le lien est à <strong>usage unique et valable 7 jours</strong>. En cas d'erreur, prévenez votre responsable AVANT de signer : la signature certifie que les informations sont exactes.",
    },
    {
      t: 'scenario',
      title: 'Signer mon prévisionnel annuel',
      steps: [
        "Vous recevez un email avec votre prévisionnel de l'année en PDF joint",
        'Vérifiez le document → bouton <strong>Signer mon prévisionnel [année]</strong>',
      ],
    },
    {
      t: 'scenario',
      title: 'Comprendre mes heures',
      blocks: [
        {
          t: 'cards',
          items: [
            { icon: '🟢', title: 'Poste O — Ouverture', html: '8h30 → 19h00, pause déjeuner de 2h = <strong>8h30 de travail effectif</strong>' },
            { icon: '🌿', title: 'Poste F — Fermeture', html: '9h00 → 19h15, pause déjeuner de 2h = <strong>8h15 de travail effectif</strong>' },
            { icon: '🩷', title: 'Demi-journée', html: 'Matin 9h → 13h, après-midi 15h → 19h' },
            { icon: '🗓️', title: 'Samedi', html: '9h00 → 16h30 = <strong>7h00</strong> en standard (certains contrats prévoient un autre horaire)' },
            { icon: '➕', title: 'H.supp.', html: 'Temps travaillé au-delà du poste, saisi par pas de 15 minutes.' },
            { icon: '➖', title: 'H.manq. / départ anticipé', html: 'Temps non effectué sur le poste, déduit du total du jour.' },
          ],
        },
      ],
      tip: 'Le <strong>solde net</strong> de votre feuille = total des H.supp. − total des départs anticipés sur le mois.',
    },
  ],
};

const sectionFeaturesAssocie = {
  id: 'features',
  blocks: [
    { t: 'h', text: '📊 Tableau de bord' },
    {
      t: 'cards',
      items: [
        { icon: '🩺', title: 'Suivi vétérinaires', html: 'Par vétérinaire : jours travaillés, demi-journées, samedis, jours de congés, mois le plus chargé ; comparaison et récapitulatif mensuels.' },
        { icon: '🐾', title: 'Suivi ASV', html: 'Heures, modulation, équité des samedis, plafond hebdomadaire et tableau des CP (✎ Ajuster : admin).' },
        { icon: '📋', title: 'Demandes', html: 'Demandes de congé et modifications urgentes, approbation ou refus motivé.' },
        { icon: '✍️', title: 'Feuilles signées', html: "État des prévisionnels et feuilles de présence signées : PDF, annulation d'une signature." },
        { icon: '📝', title: 'Entretiens annuels', html: 'Suivi des entretiens annuels de chaque collaborateur.' },
        { icon: '🚩', title: 'Signalements (admin)', html: "Problèmes signalés par l'équipe, avec gravité, statut et note interne." },
      ],
    },
    { t: 'h', text: '🩺 Vétérinaires' },
    {
      t: 'cards',
      items: [
        { icon: '📅', title: 'Calendrier mensuel', html: "Présences et absences par demi-journée, motif d'absence, commentaires du jour, fermeture de la clinique ou fermeture anticipée." },
        { icon: '🗓️', title: 'Vue annuelle', html: "Les 12 mois d'un coup d'œil, année en cours ou suivante, pour repérer les chevauchements d'absences." },
        { icon: '🔮', title: 'Prévisionnel', html: "Calendrier de l'année suivante, isolé des totaux réels." },
      ],
    },
    { t: 'h', text: '🐾 ASV' },
    {
      t: 'cards',
      items: [
        { icon: '📅', title: 'Calendrier mensuel', html: "Postes et absences à la barre d'outils, alertes, 🔒 clôture du mois, demande de signature des feuilles, 🖨️ impression." },
        { icon: '⏱️', title: 'Hebdomadaire', html: 'Poste O/F, H.supp. et H.manq. par jour, total de la semaine.' },
        { icon: '🗓️', title: 'Vue annuelle', html: "Présences de l'année en cours." },
        { icon: '🔮', title: 'Prévisionnel', html: "Heures prévues semaine par semaine pour l'année, par ASV ou consolidé, signature et impression." },
      ],
    },
    { t: 'h', text: '⚙️ Menu réglages' },
    {
      t: 'cards',
      items: [
        { icon: '👥', title: 'Collaborateurs (admin)', html: "Inviter, modifier (rôle, droits, temps de travail, couleur), renvoyer l'invitation, réinitialiser le mot de passe, retirer." },
        { icon: '🎨', title: 'Couleurs', html: "Couleur d'affichage de chaque vétérinaire et de chaque ASV." },
        { icon: '📅', title: 'Synchronisation calendrier', html: "Votre lien iCal personnel (Google Agenda, Apple Calendrier, Outlook) et l'envoi vers iCloud." },
        { icon: '⬇️', title: 'Export / Import', html: 'Sauvegarde complète en JSON et restauration.' },
        { icon: '🚩', title: 'Signaler un problème', html: "Décrire un bug ou une gêne : l'écran, le rôle et la version sont joints automatiquement." },
      ],
    },
    { t: 'tip', html: "💡 Couleurs, synchronisation et export / import ne s'affichent que sur ordinateur." },
  ],
};

const faqCommune = [
  {
    q: 'Comment signaler un problème ou un bug ?',
    a: "⚙️ → <strong>🚩 Signaler un problème</strong> → décrire ce qui s'est passé et choisir la gravité (Bloquant, Gênant, Confort) → <strong>Envoyer</strong>. L'écran, votre rôle et la version de l'application sont joints automatiquement.",
  },
  {
    q: 'Que signifie la pastille sur un jour du calendrier ?',
    a: 'Le jour porte un <strong>commentaire</strong>. Survolez le jour (ou touchez la pastille) pour le lire.',
  },
  {
    q: 'Mon mot de passe est perdu, que faire ?',
    a: "Sur l'écran de connexion, cliquer sur <strong>Mot de passe oublié ?</strong> → entrer votre email → un lien de réinitialisation vous est envoyé. Une fois connecté, ⚙️ → <strong>🔑 Changer mon mot de passe</strong>.",
  },
  {
    q: 'Comment recevoir les notifications ?',
    a: "⚙️ → <strong>🔔 Notifications</strong> → Activer les notifications. Sur iPhone, installez d'abord l'application sur l'écran d'accueil.",
  },
];

const faqAssocie = [
  {
    q: 'Comment approuver une demande de congé ?',
    a: 'Tableau de bord → <strong>📋 Demandes de congé et de modification</strong> → <strong>✓ Approuver</strong> ou <strong>✕ Refuser</strong> (motif obligatoire).',
  },
  {
    q: 'Que signifie la couleur violette sur une case ASV ?',
    a: "Une modification du planning d'une ASV a été saisie à <strong>moins de deux semaines</strong> de la date. Elle attend votre validation dans Tableau de bord → Demandes, section « 🔔 Modifications urgentes ».",
  },
  {
    q: 'Comment envoyer une feuille de présence à une ASV ?',
    a: "🐾 ASV > Calendrier mensuel → se placer sur le mois → panneau « ✍️ Feuille de présence » en bas de page → <strong>📧 Demander la signature</strong> en face de l'ASV.",
  },
  {
    q: "Comment demander la signature du prévisionnel d'une ASV ?",
    a: "🐾 ASV > 🔮 Prévisionnel → mode <strong>Par ASV</strong> → onglet de l'ASV → <strong>Demander la signature</strong>. L'ASV reçoit le prévisionnel en PDF joint ; le lien est valable 7 jours.",
  },
  {
    q: 'Où voir les signatures ?',
    a: "Tableau de bord → <strong>✍️ Feuilles signées</strong> : état des prévisionnels de l'année et feuilles de présence signées (📄 PDF, ✕ pour annuler).",
  },
  {
    q: "Comment voir les heures supplémentaires d'une ASV ?",
    a: '🐾 ASV > ⏱️ Hebdomadaire pour le détail de la semaine, ou Tableau de bord → <strong>🐾 Suivi ASV</strong> pour la synthèse.',
  },
  {
    q: "Comment préciser le motif d'une absence vétérinaire ?",
    a: "Appui long (environ une demi-seconde) sur la case du calendrier vétérinaire → fenêtre « Motif d'absence ».",
  },
  {
    q: 'Comment inviter un nouveau collaborateur ?',
    a: "(admin) ⚙️ → 👥 Gérer les collaborateurs → prénom, email, rôle et, pour une ASV, temps de travail → <strong>📧 Envoyer l'invitation</strong>. L'email contient le lien de connexion et ce guide, adapté au rôle.",
  },
  {
    q: 'Quelle différence entre 🗑️ et 💣 dans la liste des collaborateurs ?',
    a: '(admin) <strong>🗑️</strong> supprime le compte de connexion seulement : le planning reste et la personne peut être réinvitée. <strong>💣</strong> supprime définitivement le collaborateur et toutes ses données.',
  },
  {
    q: 'Comment synchroniser avec Google Agenda ou Apple Calendrier ?',
    a: "⚙️ → <strong>📅 Synchronisation calendrier</strong> (sur ordinateur) → <strong>Générer mon lien</strong> → <strong>Copier le lien</strong> et l'ajouter à votre calendrier (Google : « Autres agendas » → « À partir de l'URL » ; Apple : « S'abonner à un calendrier »).",
  },
  {
    q: 'Comment publier une annonce ?',
    a: "(admin) 📣 Annonces → nouvelle annonce → titre, contenu, destinataires (Tout le monde, Vétérinaires, ASV), catégorie, épinglage, date d'expiration éventuelle → Publier.",
  },
  {
    q: 'Comment imprimer un planning ?',
    a: 'Bouton <strong>🖨️ Imprimer</strong> sur le calendrier mensuel ASV et dans le prévisionnel ASV.',
  },
  {
    q: 'Comment exporter les données ?',
    a: '⚙️ → <strong>Exporter JSON</strong> (sur ordinateur). Pour restaurer : <strong>Importer JSON</strong> et choisir le fichier.',
  },
];

const faqSalarie = [
  {
    q: 'Pourquoi je ne vois pas le tableau de bord ?',
    a: "Il est réservé aux vétérinaires associés et à l'admin, comme la validation des demandes et les réglages.",
  },
  {
    q: 'Dois-je saisir mes jours de repos ?',
    a: 'Non : une case vide vaut repos. Saisissez seulement vos présences (✅ Présence) et vos absences.',
  },
  {
    q: 'Qui valide mes congés ?',
    a: "Les vétérinaires associés. Votre demande reste en attente ⏳ jusqu'à leur décision ; un refus affiche « ⚠️ Voir vétérinaire ».",
  },
  {
    q: 'Puis-je modifier le planning des ASV ?',
    a: 'Non, il vous est accessible en lecture seule.',
  },
];

const faqAsv = [
  {
    q: 'Comment demander un congé ?',
    a: 'Calendrier mensuel ASV → outil <strong>🔵 Congé</strong> → peindre les demi-journées → <strong>Soumettre la demande</strong>. Elle part aux vétérinaires pour validation.',
  },
  {
    q: 'Que signifie la case violette ?',
    a: "Une modification de votre planning a été saisie à <strong>moins de deux semaines</strong> de la date. Elle attend la validation d'un vétérinaire.",
  },
  {
    q: 'Que signifient les postes O, F et D ?',
    a: '<strong>O = Ouverture</strong> : 8h30 → 19h (8h30 effectives). <strong>F = Fermeture</strong> : 9h → 19h15 (8h15 effectives). <strong>D = Demi-journée</strong> : 9h → 13h et 15h → 19h.',
  },
  {
    q: "Comment voir mon total d'heures de la semaine ?",
    a: '🐾 ASV > ⏱️ Hebdomadaire → bandeau <strong>Total semaine</strong>. La ligne <strong>Heures</strong> donne le total de chaque jour.',
  },
  {
    q: 'Comment signer ma feuille de présence ?',
    a: "Ouvrez l'email mensuel d'Amivet PULSE → vérifiez le récapitulatif → <strong>✍️ Je certifie et signe ma feuille de présence</strong>. Le lien est à usage unique et valable 7 jours.",
  },
  {
    q: 'Les données de ma feuille sont fausses, que faire ?',
    a: 'Prévenez votre responsable <strong>avant de signer</strong>. Une fois signée, la feuille est archivée ; votre responsable peut vous en renvoyer une corrigée.',
  },
  {
    q: 'Quelle différence entre la feuille de présence et le prévisionnel ?',
    a: "La <strong>feuille de présence</strong> (mensuelle) récapitule les heures <em>réellement effectuées</em> sur le mois écoulé. Le <strong>prévisionnel</strong> (annuel) présente les heures <em>prévues</em> sur l'année. Les deux se signent par un lien reçu par email.",
  },
  {
    q: 'Pourquoi je ne peux plus modifier un mois ?',
    a: 'Le mois a été <strong>clôturé</strong> 🔒 par les vétérinaires. Contactez votre responsable pour une correction.',
  },
  {
    q: 'Pourquoi je ne vois pas le tableau de bord ?',
    a: "Il est réservé aux vétérinaires associés et à l'admin.",
  },
];

const faqSection = (items) => ({ id: 'faq', blocks: [{ t: 'faq', items }] });

const GUIDES = {
  associe: [
    sectionIntroAssocie,
    sectionRoutineAssocie,
    sectionScenariosAssocie,
    sectionFeaturesAssocie,
    faqSection([...faqAssocie, ...faqCommune]),
  ],
  salarie: [sectionIntroSalarie, sectionRoutineSalarie, sectionScenariosSalarie, faqSection([...faqSalarie, ...faqCommune])],
  asv: [sectionIntroAsv, sectionRoutineAsv, sectionScenariosAsv, faqSection([...faqAsv, ...faqCommune])],
};

// Libellé de navigation (application) et titre de section (application, email).
export const SECTION_META = {
  intro: { label: '🎯 Présentation', title: "🎯 À propos d'Amivet PULSE" },
  routine: { label: '📅 Routine', title: "📅 Routine d'utilisation" },
  scenarios: { label: '🔄 Scénarios', title: '🔄 Scénarios pas à pas' },
  features: { label: '📖 Fonctionnalités', title: '📖 Fonctionnalités détaillées' },
  faq: { label: '💬 FAQ', title: '💬 Questions fréquentes' },
};

export function guideSections(role) {
  return GUIDES[guideAudience(role)];
}

/* ------------------------------------------------------------------ */
/* Rendu                                                              */
/* ------------------------------------------------------------------ */

export function escapeGuideText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const esc = escapeGuideText;

// --- Application (classes ho-* de style.css) ---------------------------------

function appStep(n, html) {
  return `<div class="ho-step"><span class="ho-step-num">${n}</span><div>${html}</div></div>`;
}

function appBlock(b) {
  switch (b.t) {
    case 'lead':
      return `<p class="ho-lead">${b.html}</p>`;
    case 'h':
      return `<h3 class="ho-subtitle">${esc(b.text)}</h3>`;
    case 'cards':
      return `<div class="ho-cards">${b.items
        .map((c) => `<div class="ho-card"><div class="ho-card-icon">${c.icon}</div><strong>${esc(c.title)}</strong><p>${c.html}</p></div>`)
        .join('')}</div>`;
    case 'info':
      return `<div class="ho-info">${b.html}</div>`;
    case 'tip':
      return `<div class="ho-tip">${b.html}</div>`;
    case 'steps':
      return `<div class="ho-steps">${b.items
        .map((s, i) => appStep(i + 1, `<strong>${esc(s.title)}</strong> — ${s.html}`))
        .join('')}</div>`;
    case 'scenario':
      return `<div class="ho-scenario"><div class="ho-scenario-head">📌 ${esc(b.title)}</div><div class="ho-scenario-body">${(b.steps || [])
        .map((s, i) => appStep(i + 1, s))
        .join('')}${(b.blocks || []).map(appBlock).join('')}${b.tip ? `<div class="ho-tip">${b.tip}</div>` : ''}</div></div>`;
    case 'faq':
      return `<div class="ho-faq-list" id="ho-faq-list">${b.items
        .map(
          (f, i) => `
        <div class="ho-faq-item" data-i="${i}">
          <button class="help-faq-q" aria-expanded="false"><span>${esc(f.q)}</span><span class="help-faq-chevron">▾</span></button>
          <div class="help-faq-a" style="display:none;">${f.a}</div>
        </div>`
        )
        .join('')}</div>`;
    default:
      return '';
  }
}

export function renderGuideAppSection(section) {
  return `<h2 class="ho-title">${esc(SECTION_META[section.id].title)}</h2>${section.blocks.map(appBlock).join('')}`;
}

// --- Email (styles en ligne, rendu fiable dans les clients mail) -------------

export function renderGuideEmailHtml(role, colors) {
  const C = colors;
  const box = (bg, html) =>
    `<div style="background:${bg};border-radius:8px;padding:10px 12px;margin:8px 0 12px;font-size:13px;line-height:1.55;color:${C.text};">${html}</div>`;
  const step = (n, html) =>
    `<tr><td style="vertical-align:top;padding:3px 8px 3px 0;"><span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:10px;background:${C.primary};color:#FFFFFF;font-size:11px;font-weight:700;text-align:center;">${n}</span></td><td style="padding:3px 0;font-size:13px;line-height:1.55;color:${C.text};">${html}</td></tr>`;
  const table = (rows) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 10px;">${rows.join('')}</table>`;

  const block = (b) => {
    switch (b.t) {
      case 'lead':
        return `<p style="font-size:13.5px;line-height:1.6;color:${C.text};margin:0 0 12px;">${b.html}</p>`;
      case 'h':
        return `<h3 style="font-size:14px;color:${C.text};margin:16px 0 4px;">${esc(b.text)}</h3>`;
      case 'cards':
        return table(
          b.items.map(
            (c) =>
              `<tr><td style="vertical-align:top;padding:4px 8px 4px 0;font-size:16px;">${c.icon}</td><td style="padding:4px 0;font-size:13px;line-height:1.55;color:${C.text};"><strong>${esc(c.title)}</strong><br><span style="color:${C.textMuted};">${c.html}</span></td></tr>`
          )
        );
      case 'info':
        return box(C.secondary, b.html);
      case 'tip':
        return box('#FFFBEB', b.html);
      case 'steps':
        return table(b.items.map((s, i) => step(i + 1, `<strong>${esc(s.title)}</strong> — ${s.html}`)));
      case 'scenario':
        return `<h3 style="font-size:14px;color:${C.text};margin:18px 0 4px;">📌 ${esc(b.title)}</h3>${
          b.steps ? table(b.steps.map((s, i) => step(i + 1, s))) : ''
        }${(b.blocks || []).map(block).join('')}${b.tip ? box('#FFFBEB', b.tip) : ''}`;
      case 'faq':
        return b.items
          .map(
            (f) =>
              `<p style="font-size:13px;line-height:1.55;color:${C.text};margin:0 0 10px;"><strong>${esc(f.q)}</strong><br><span style="color:${C.textMuted};">${f.a}</span></p>`
          )
          .join('');
      default:
        return '';
    }
  };

  const sections = guideSections(role)
    .map(
      (s) =>
        `<h2 style="font-size:16px;color:${C.primary};margin:28px 0 8px;padding-bottom:6px;border-bottom:1px solid ${C.border};">${esc(SECTION_META[s.id].title)}</h2>${s.blocks.map(block).join('')}`
    )
    .join('');

  return `<div style="margin-top:28px;padding-top:8px;border-top:2px solid ${C.primary};">
    <h1 style="font-size:18px;color:${C.text};margin:16px 0 0;">📘 Guide utilisateur</h1>
    ${sections}
  </div>`;
}

// --- Texte brut (partie texte de l'email) -------------------------------------

function plain(html) {
  return String(html)
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&');
}

export function renderGuideText(role) {
  const out = ['=== GUIDE UTILISATEUR ==='];
  const block = (b) => {
    switch (b.t) {
      case 'lead':
      case 'info':
      case 'tip':
        out.push(plain(b.html), '');
        break;
      case 'h':
        out.push(`-- ${b.text} --`);
        break;
      case 'cards':
        b.items.forEach((c) => out.push(`${c.icon} ${c.title} : ${plain(c.html)}`));
        out.push('');
        break;
      case 'steps':
        b.items.forEach((s, i) => out.push(`${i + 1}. ${s.title} — ${plain(s.html)}`));
        out.push('');
        break;
      case 'scenario':
        out.push(`📌 ${b.title}`);
        (b.steps || []).forEach((s, i) => out.push(`${i + 1}. ${plain(s)}`));
        (b.blocks || []).forEach(block);
        if (b.tip) out.push(plain(b.tip));
        out.push('');
        break;
      case 'faq':
        b.items.forEach((f) => out.push(`• ${f.q}`, `  ${plain(f.a)}`, ''));
        break;
    }
  };
  guideSections(role).forEach((s) => {
    out.push('', SECTION_META[s.id].title.toUpperCase(), '');
    s.blocks.forEach(block);
  });
  return out.join('\n');
}
