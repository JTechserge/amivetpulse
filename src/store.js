// Shared mutable application state.
// Imported as a live object reference: any module that reads store.DATA
// gets the current value without copying. Reassigning store.DATA replaces
// the object for every consumer simultaneously.
export const store = {
  // Planning data (synced to Supabase + cached in localStorage)
  DATA: { version: 2, slots: {} },

  // Auth
  currentUser: null, // { id, email, role, person_id, display_name, can_edit_vet_calendar, can_edit_all_asv }
  adminViewMode: 'vet', // 'vet' | 'asv' — admin only
  adminImpersonatedPersonId: null,

  // Signatures
  SIGNATURES: new Set(),
  signatureDetails: new Map(),
  pendingSignToken: null,

  // Annual interviews
  INTERVIEWS: [],

  // Announcements
  announcementsCache: {
    list: [],
    reads: new Set(),
    loaded: false,
    filter: 'all',
  },

  // Calendar views (rebuilt each year rollover via buildCalViews())
  // Format: { [viewKey]: { year, people, navState, todayNav, forecast, label, containerId, printable } }
  CAL_VIEWS: null,

  // Nav state objects referenced inside CAL_VIEWS.navState
  // Initialized by initCalState() in app.js after getCurrentYear() is available
  calStateCurrent: { month: 0 },
  calStateForecast: { month: 0 },
  calStateAsvCurrent: { month: 0 },
  calStateAsvForecast: { month: 0 },

  // Dashboard + sub-navigation state
  dashState: { year: 0 },           // year set by initCalState()
  subNavState: { vets: 'calendar', asv: 'calendar' },
  annualYearState: { vets: 'current', asv: 'current' },

  // Undo stack (snapshots of DATA.slots before each user action)
  UNDO_STACK: [],

  // Dashboard sub-tab navigation (tab actif dans le tableau de bord)
  dashSubState: { tab: 'stats' },
};
