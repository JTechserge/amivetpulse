/* ================================================================
   AMIVET PLANNING — Constantes de paie
   Aucune dépendance. Extraites de src/config.js (lot 1 du chantier
   « correction auto des signalements ») pour que la frontière des
   modifications automatisées puisse s'exprimer par fichier :
   src/config.js ne porte plus que des libellés et de la configuration,
   ce module porte tout ce qui pèse sur le calcul des heures et des CP.
   Toute modification ici est un enjeu de paie : tests unitaires
   obligatoires avant commit, et signalement explicite dans le message.
   ================================================================ */

// ----------------------------------------------------------------
// Heures & plafonds légaux (modulation art. L3122-4 CT)
// ----------------------------------------------------------------
export const ANNUAL_FULLTIME_HOURS = 1607; // référence légale France (loi Aubry 2000)
export const HALFDAY_HOURS = 3.5; // 35h / 5j / 2 demi-journées
export const WEEKLY_MAX_HOURS = 42;

// Le temps de travail de Carla doit être DÉRIVÉ de cette constante, jamais
// recopié — un 7.25 écrit à la main au lieu de 7 + 25/60 fausserait ses CP
// proratisés (c'est le bug corrigé par le commit 5475ef0).
export const ASV_STD_SAT_CARLA = 7 + 25 / 60; // Carla : 8:30-16:45 avec ~50min pause → 7h25
export const ASV_STD_SAT_SECOND = 7.0; // 2e ASV samedi : 9:00-16:30
export const ASV_STD_WEEKDAY_AVG = 8.375;
export const CLINIC_HOURS = { mStart: '08:30', mEnd: '13:00', amStart: '15:00', amEnd: '20:00' };
export const CLINIC_M_H = 4.5; // 8h30→13h00
export const CLINIC_AM_H = 4.25; // 15h00→19h15

// ----------------------------------------------------------------
// Congés Payés
// ----------------------------------------------------------------
export const CP_DAYS_PER_MONTH = 2.5;
export const CP_REFERENCE_START_MONTH = 0; // janvier = index 0
