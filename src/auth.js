/* ================================================================
   AMIVET PLANNING — Session Supabase Auth
   Fonctions HTTP pures : pas de mutation d'état global (currentUser reste dans app.js).
   ================================================================ */
import { SUPABASE_AUTH_URL, SUPABASE_ANON_KEY, AUTH_SESSION_KEY } from './config.js';

export function getAuthSession(){
  try{ return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY)); }catch{ return null; }
}
export function saveAuthSession(s){ sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s)); }

export function supabaseHeaders(extra){
  const session = getAuthSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;
  return Object.assign({ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${token}` }, extra || {});
}

export async function authSignIn(email, password){
  const res = await fetch(`${SUPABASE_AUTH_URL}token?grant_type=password`, {
    method:'POST',
    headers:{ apikey:SUPABASE_ANON_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ email, password }),
  });
  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error_description || err.message || `Erreur ${res.status}`);
  }
  const session = await res.json();
  saveAuthSession(session);
  return session;
}

export async function authUpdatePassword(accessToken, newPassword){
  const res = await fetch(`${SUPABASE_AUTH_URL}user`, {
    method:'PUT',
    headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ password:newPassword }),
  });
  if(!res.ok) throw new Error('Erreur lors de la mise à jour du mot de passe.');
}

export async function authSendPasswordReset(email){
  const res = await fetch(`${SUPABASE_AUTH_URL}recover`, {
    method:'POST',
    headers:{ apikey:SUPABASE_ANON_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ email, redirectTo:'https://jtechserge.github.io/amivetpulse/' }),
  });
  if(!res.ok) throw new Error('Impossible d\'envoyer l\'email de réinitialisation.');
}

export async function authRefreshSession(refreshToken){
  const res = await fetch(`${SUPABASE_AUTH_URL}token?grant_type=refresh_token`, {
    method:'POST',
    headers:{ apikey:SUPABASE_ANON_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ refresh_token:refreshToken }),
  });
  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error_description || err.message || `Erreur ${res.status}`);
  }
  const session = await res.json();
  saveAuthSession(session);
  return session;
}
