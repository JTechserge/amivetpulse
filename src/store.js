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
};
