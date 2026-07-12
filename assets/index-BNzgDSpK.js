(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=[{bg:`#86EFAC`,border:`#4ADE80`,text:`#14532D`},{bg:`#A7F3D0`,border:`#34D399`,text:`#064E3B`},{bg:`#BEF264`,border:`#A3E635`,text:`#3F6212`}],t=[{id:`david`,name:`Dr. David Pelois`,short:`David`,color:`#2563EB`,initial:`D`,present:e[0]},{id:`stephane`,name:`Dr. Stéphane Maquinay`,short:`Stéphane`,color:`#7C3AED`,initial:`S`,present:e[1]}],n=[{id:`marie`,name:`Marie`,short:`Marie`,color:`#DB2777`,initial:`M`,present:e[0],timeFraction:1},{id:`johanna`,name:`Johanna`,short:`Johanna`,color:`#EA580C`,initial:`Jo`,present:e[1],timeFraction:1},{id:`julie`,name:`Julie`,short:`Julie`,color:`#059669`,initial:`Ju`,present:e[2],timeFraction:.75},{id:`carla`,name:`Carla`,short:`Carla`,color:`#0EA5E9`,initial:`Ca`,present:e[3],timeFraction:7.25/35,saturdayOnly:!0}];function r(){return[...t,...n]}var i=2.5,a={urgent:{label:`Urgent`,color:`#DC2626`,bg:`#FEF2F2`,border:`#FECACA`,icon:`🚨`},meeting:{label:`Réunion`,color:`#7C3AED`,bg:`#EDE9FE`,border:`#DDD6FE`,icon:`🗓️`},task:{label:`Tâche`,color:`#D97706`,bg:`#FEF3C7`,border:`#FDE68A`,icon:`✅`},info:{label:`Info`,color:`#0369A1`,bg:`#EFF6FF`,border:`#BFDBFE`,icon:`ℹ️`}},o=`amivet_asv_roster`,s=[`#DB2777`,`#EA580C`,`#059669`,`#0EA5E9`,`#D946EF`,`#4F46E5`,`#0D9488`,`#DC2626`];function c(e){let t=e.toLowerCase().normalize(`NFD`),n=``;for(let e of t){let t=e.codePointAt(0);t>=768&&t<=879||(n+=e)}return n.replace(/[^a-z0-9]+/g,`-`).replace(/^-+|-+$/g,``)||`asv`}function l(e){let r=e,i=2;for(;t.some(e=>e.id===r)||n.some(e=>e.id===r);)r=`${e}-${i}`,i++;return r}function u(){let e=r().map(e=>e.color.toLowerCase());return s.find(t=>!e.includes(t.toLowerCase())&&!re(t))||`#64748B`}function d(){n.forEach((t,n)=>t.present=e[n%e.length])}function f(){localStorage.setItem(o,JSON.stringify(n.map(e=>({id:e.id,name:e.name,short:e.short,initial:e.initial,color:e.color,timeFraction:e.timeFraction??1,archived:e.archived??!1,saturdayOnly:e.saturdayOnly??!1}))))}function p(){try{let e=localStorage.getItem(o);if(e){let t=JSON.parse(e);Array.isArray(t)&&t.length&&(n.length=0,t.forEach(e=>n.push({id:e.id,name:e.name,short:e.short,initial:e.initial,color:e.color,present:null,timeFraction:e.timeFraction??1,archived:e.archived??!1,saturdayOnly:e.saturdayOnly??!1})),n.find(e=>e.id===`carla`)||(n.push({id:`carla`,name:`Carla`,short:`Carla`,color:`#0EA5E9`,initial:`Ca`,present:null,timeFraction:7.25/35,saturdayOnly:!0}),f()))}}catch(e){console.warn(`Effectif ASV personnalisé illisible, valeurs par défaut conservées.`,e)}d()}function m(e){if(e=(e||``).trim(),!e)return null;let t={id:l(c(e)),name:e,short:e,initial:e.slice(0,2).toUpperCase(),color:u(),present:null};return n.push(t),d(),f(),ae(),ie(),t}var h=[`M`,`AM`],g={M:`Matin`,AM:`Après-midi`},_=`amivet_planning_data`,ee=`amivet_person_colors`,te=`amivet_view_state`;function ne(e){let t=parseInt(e.slice(1,3),16)/255,n=parseInt(e.slice(3,5),16)/255,r=parseInt(e.slice(5,7),16)/255,i=Math.max(t,n,r),a=Math.min(t,n,r),o=0,s=0,c=(i+a)/2,l=i-a;if(l!==0){switch(s=c>.5?l/(2-i-a):l/(i+a),i){case t:o=(n-r)/l%6;break;case n:o=(r-t)/l+2;break;default:o=(t-n)/l+4}o*=60,o<0&&(o+=360)}return{h:o,s:s*100,l:c*100}}function re(e){if(!/^#[0-9a-fA-F]{6}$/.test(e))return`couleur invalide.`;let{h:t,s:n,l:r}=ne(e);return r>92?`trop proche du blanc (réservé aux demi-journées vides).`:n>25&&(t<=15||t>=345)?`trop proche du rouge (réservé aux congés validés).`:n>25&&t>=75&&t<=160?`trop proche du vert (réservé aux jours travaillés).`:n>25&&t>=200&&t<=250?`trop proche du bleu foncé (réservé aux congés en attente).`:n>25&&t>=40&&t<=65?`trop proche du jaune (réservé aux jours fériés).`:null}function ie(){r().forEach(e=>document.documentElement.style.setProperty(`--color-${e.id}`,e.color))}function ae(){let e={};r().forEach(t=>e[t.id]=t.color),localStorage.setItem(ee,JSON.stringify(e))}function oe(){try{let e=localStorage.getItem(ee);if(e){let t=JSON.parse(e);r().forEach(e=>{t[e.id]&&(e.color=t[e.id])})}}catch(e){console.warn(`Couleurs personnalisées illisibles, valeurs par défaut conservées.`,e)}ie()}function se(e){return`
    <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:700;color:var(--color-text);">
      ${e.short}
      <input type="color" id="color-input-${e.id}" value="${e.color}" style="width:48px;height:32px;border:1px solid var(--color-border);border-radius:6px;cursor:pointer;padding:2px;background:none;">
    </label>
  `}function ce(){let e=document.getElementById(`modal-backdrop`),i=document.getElementById(`modal-box`);i.className=`modal-box`,i.innerHTML=`
    <h3>🎨 Couleurs des associés et des ASV</h3>
    <p>Le vert, le rouge, le bleu foncé, le jaune et le blanc restent réservés aux indicateurs de statut (présent / congé validé / congé en attente / férié / vide).</p>
    <p class="settings-section-label" style="padding:0;margin-bottom:8px;">Vétérinaires</p>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      ${t.map(se).join(``)}
    </div>
    <p class="settings-section-label" style="padding:0;margin-bottom:8px;">ASV</p>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:6px;">
      ${n.map(se).join(``)}
    </div>
    <p id="color-error" style="color:#B91C1C;font-size:12px;display:none;margin:10px 0 0;"></p>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn btn-primary" id="color-save">Appliquer</button>
    </div>
  `,e.classList.add(`open`);let a=()=>e.classList.remove(`open`);i.querySelector(`#modal-cancel`).onclick=a,i.querySelector(`#color-save`).onclick=()=>{let e=r(),t={};e.forEach(e=>{t[e.id]=i.querySelector(`#color-input-${e.id}`).value});let n=i.querySelector(`#color-error`),o=[];e.forEach(e=>{if(t[e.id].toLowerCase()===e.color.toLowerCase())return;let n=re(t[e.id]);n&&o.push(`${e.short} : ${n}`)});for(let n=0;n<e.length;n++)for(let r=n+1;r<e.length;r++){let i=e[n],a=e[r];t[i.id].toLowerCase()===t[a.id].toLowerCase()&&o.push(`${i.short} et ${a.short} ne peuvent pas avoir la même couleur.`)}if(o.length){n.textContent=o.join(` `),n.style.display=`block`;return}e.forEach(e=>e.color=t[e.id]),ae(),ie(),z(),a(),I(`Couleurs appliquées`,`🎨`)},e.onclick=t=>{t.target===e&&a()}}function le(){let e=document.getElementById(`modal-backdrop`),t=document.getElementById(`modal-box`);t.className=`modal-box`,t.innerHTML=`
    <h3>🔑 Changer mon mot de passe</h3>
    <p>Choisissez un nouveau mot de passe pour votre compte <strong>${V(O?.email||``)}</strong>.</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <input type="password" id="pwd-new" placeholder="Nouveau mot de passe" autocomplete="new-password">
      <input type="password" id="pwd-confirm" placeholder="Confirmer le nouveau mot de passe" autocomplete="new-password">
    </div>
    <p id="pwd-error" style="color:#B91C1C;font-size:12px;display:none;margin:10px 0 0;"></p>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn btn-primary" id="pwd-save">Enregistrer</button>
    </div>
  `,e.classList.add(`open`);let n=()=>e.classList.remove(`open`);t.querySelector(`#modal-cancel`).onclick=n,e.onclick=t=>{t.target===e&&n()},t.querySelector(`#pwd-save`).onclick=async()=>{let e=t.querySelector(`#pwd-new`).value,r=t.querySelector(`#pwd-confirm`).value,i=t.querySelector(`#pwd-error`),a=t.querySelector(`#pwd-save`);if(!e||e.length<8){i.textContent=`Le mot de passe doit faire au moins 8 caractères.`,i.style.display=`block`;return}if(e!==r){i.textContent=`Les deux mots de passe ne correspondent pas.`,i.style.display=`block`;return}a.disabled=!0;try{await ot(et().access_token,e),n(),I(`Mot de passe mis à jour`,`🔑`)}catch(e){i.textContent=`Erreur : `+e.message,i.style.display=`block`,a.disabled=!1}},t.querySelector(`#pwd-new`).focus()}function ue(){let e=document.getElementById(`modal-backdrop`),r=document.getElementById(`modal-box`);r.className=`modal-box modal-box-wide`,r.innerHTML=`<h3>👥 Gestion des collaborateurs</h3><p class="text-muted" style="font-size:13px;">Chargement…</p>`,e.classList.add(`open`);let i=()=>e.classList.remove(`open`);e.onclick=t=>{t.target===e&&i()},fetch(`${D}manage-users`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({action:`list`})}).then(e=>e.json()).then(a=>{if(!a.ok)throw Error(a.error||`Erreur`);let o=a.users,s={admin:`Admin`,vet:`Vétérinaire`,asv:`ASV`},c=O?.role===`admin`,l=new Set(o.map(e=>e.person_id).filter(Boolean)),u=n.filter(e=>!e.archived&&!l.has(e.id)),p=[...t.filter(e=>!l.has(e.id)&&!o.some(t=>(t.display_name||``).toLowerCase().includes(e.short.toLowerCase())||(t.display_name||``).toLowerCase().includes(e.name.toLowerCase()))).map(e=>({...e,localRole:`vet`,roleLabel:`Vétérinaire`})),...u.map(e=>({...e,localRole:`asv`,roleLabel:`ASV`}))],h=o.map(e=>`<tr>
        <td style="font-weight:600;">${V(e.display_name||`—`)}</td>
        <td style="font-size:12px;color:var(--color-text-muted);">${s[e.role]||e.role||`—`}</td>
        <td style="font-size:12px;color:var(--color-text-muted);">${V(e.email||`—`)}</td>
        <td style="font-size:12px;text-align:center;">${e.can_edit_vet_calendar?`✅`:`—`}</td>
        <td style="font-size:12px;text-align:center;">${e.can_edit_all_asv?`✅`:`—`}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" data-edit-user="${e.id}" style="font-size:11.5px;padding:4px 8px;margin-right:4px;">Modifier</button>
          <button class="btn btn-sm" data-delete-user="${e.id}" data-delete-name="${V(e.display_name||e.email||e.id)}" style="font-size:11.5px;padding:4px 8px;color:#B91C1C;border-color:#FCA5A5;" title="Supprimer le compte uniquement">🗑️</button>
          ${c?`<button class="btn btn-sm" data-purge-user="${e.id}" data-purge-person="${e.person_id||``}" data-purge-name="${V(e.display_name||e.email||e.id)}" style="font-size:11.5px;padding:4px 8px;margin-left:4px;color:#FFFFFF;background:#B91C1C;border-color:#B91C1C;" title="Suppression définitive — efface toutes les données">💣</button>`:``}
        </td>
      </tr>`).join(``),g=p.map(e=>`<tr>
        <td style="font-weight:600;color:var(--color-text-muted);">${V(e.short)}</td>
        <td style="font-size:12px;color:var(--color-text-muted);">${e.roleLabel}</td>
        <td style="font-size:12px;color:var(--color-text-muted);font-style:italic;">Sans compte</td>
        <td style="font-size:12px;text-align:center;">—</td>
        <td style="font-size:12px;text-align:center;">—</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" data-prefill-invite="${V(e.short)}" data-prefill-role="${e.localRole}" style="font-size:11.5px;padding:4px 8px;">📧 Inviter</button>
          ${c?`<button class="btn btn-sm" data-purge-local="${e.id}" data-purge-local-name="${V(e.short)}" style="font-size:11.5px;padding:4px 8px;margin-left:4px;color:#FFFFFF;background:#B91C1C;border-color:#B91C1C;" title="Retirer du planning">💣</button>`:``}
        </td>
      </tr>`).join(``);r.innerHTML=`
      <h3>👥 Gestion des collaborateurs</h3>
      <div style="overflow-x:auto;margin-bottom:16px;">
        <table class="recap-table" style="min-width:600px;">
          <thead><tr>
            <th style="text-align:left;">Nom</th>
            <th style="text-align:left;">Rôle</th>
            <th style="text-align:left;">Email</th>
            <th title="Peut modifier le calendrier vétérinaires">Modif. vétos</th>
            <th title="Peut modifier toutes les lignes ASV">Modif. ASV</th>
            <th></th>
          </tr></thead>
          <tbody>${h+g||`<tr><td colspan="6" class="text-muted" style="text-align:center;padding:16px;">Aucun collaborateur.</td></tr>`}</tbody>
        </table>
      </div>
      <div style="border-top:1px solid var(--color-border);padding-top:14px;">
        <h4 style="font-size:14px;margin-bottom:10px;">Inviter un collaborateur</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:end;margin-bottom:8px;">
          <input type="text" id="invite-name" placeholder="Nom affiché" style="padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
          <input type="email" id="invite-email" placeholder="Email" style="padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
          <select id="invite-role" style="padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
            <option value="vet">Vétérinaire</option>
            <option value="asv">ASV</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <p id="invite-error" style="color:#B91C1C;font-size:12px;display:none;margin:4px 0 0;"></p>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn" id="modal-cancel">Fermer</button>
          <button class="btn btn-primary" id="invite-btn">📧 Envoyer l'invitation</button>
        </div>
      </div>
    `,r.querySelector(`#modal-cancel`).onclick=i,e.onclick=t=>{t.target===e&&i()},r.querySelectorAll(`[data-edit-user]`).forEach(e=>{e.onclick=()=>de(e.dataset.editUser,o,()=>ue())}),r.querySelectorAll(`[data-delete-user]`).forEach(e=>{e.onclick=()=>$t({title:`Supprimer le compte de ${e.dataset.deleteName} ?`,message:`Le compte sera définitivement supprimé. Cette action est irréversible. Les données de planning restent enregistrées.`,confirmLabel:`Supprimer le compte`,danger:!0,onConfirm:async()=>{try{let t=await fetch(`${D}manage-users`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({action:`delete`,user_id:e.dataset.deleteUser})});if(!t.ok){let e=await t.json().catch(()=>({}));throw Error(e.error||`Erreur ${t.status}`)}I(`Compte supprimé`,`🗑️`),ue()}catch(e){I(`Erreur : `+e.message,`⚠️`)}}})}),r.querySelectorAll(`[data-purge-user]`).forEach(e=>{e.onclick=()=>{let t=e.dataset.purgeName,r=e.dataset.purgeUser,i=e.dataset.purgePerson||null;$t({title:`⚠️ Suppression définitive de ${t} ?`,message:`Cette action est IRRÉVERSIBLE et supprime :

• Toutes les présences et absences saisies
• Toutes les signatures et demandes de congé
• Les entretiens annuels
• Le compte de connexion

Les données ne pourront pas être récupérées.`,confirmLabel:`Supprimer définitivement`,danger:!0,onConfirm:async()=>{try{i&&(Object.keys(M.slots).filter(e=>e.includes(`_${i}_`)||e.endsWith(`_${i}`)).forEach(e=>delete M.slots[e]),localStorage.setItem(_,JSON.stringify(M)),ht());let e=n.findIndex(e=>e.id===i);e!==-1&&(n.splice(e,1),d(),f());let a=await fetch(`${D}manage-users`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({action:`purge`,user_id:r,person_id:i})});if(!a.ok){let e=await a.json().catch(()=>({}));throw Error(e.error||`Erreur ${a.status}`)}I(`${t} supprimé(e) définitivement`,`🗑️`),x=Ae(),U(currentCalViewKey||`asv-current`),ue()}catch(e){I(`Erreur purge : `+e.message,`⚠️`)}}})}}),r.querySelectorAll(`[data-prefill-invite]`).forEach(e=>{e.onclick=()=>{r.querySelector(`#invite-name`).value=e.dataset.prefillInvite,r.querySelector(`#invite-role`).value=e.dataset.prefillRole||`asv`,r.querySelector(`#invite-email`).focus(),r.querySelector(`#invite-email`).scrollIntoView({behavior:`smooth`,block:`center`})}}),r.querySelectorAll(`[data-purge-local]`).forEach(e=>{e.onclick=()=>{let t=e.dataset.purgeLocalName,r=e.dataset.purgeLocal;$t({title:`⚠️ Retirer ${t} du planning ?`,message:`Cette action efface toutes les données de planning de ${t} et retire sa ligne du calendrier.\n\nElle est IRRÉVERSIBLE.`,confirmLabel:`Retirer définitivement`,danger:!0,onConfirm:()=>{Object.keys(M.slots).filter(e=>e.includes(`_${r}_`)||e.endsWith(`_${r}`)).forEach(e=>delete M.slots[e]),localStorage.setItem(_,JSON.stringify(M)),ht();let e=n.findIndex(e=>e.id===r);e!==-1&&(n.splice(e,1),d(),f()),I(`${t} retiré(e) du planning`,`🗑️`),x=Ae(),U(currentCalViewKey||`asv-current`),ue()}})}}),r.querySelector(`#invite-btn`).onclick=async()=>{let e=r.querySelector(`#invite-name`).value.trim(),i=r.querySelector(`#invite-email`).value.trim(),a=r.querySelector(`#invite-role`).value,o=r.querySelector(`#invite-error`);if(!e||!i){o.textContent=`Nom et email requis.`,o.style.display=`block`;return}r.querySelector(`#invite-btn`).disabled=!0;try{let s=await fetch(`${D}manage-users`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({action:`invite`,email:i,display_name:e,role:a})});if(!s.ok){let e=await s.json().catch(()=>({}));throw Error(e.error||`Erreur ${s.status}`)}let c=await s.json();if(c.user_id){let r=null;a===`vet`?r=t.find(t=>e.trim().toLowerCase().includes(t.short.toLowerCase()))?.id||null:a===`asv`&&(r=(n.find(t=>t.name.trim().toLowerCase()===e.trim().toLowerCase()&&!l.has(t.id))||m(e))?.id||null),r&&await fetch(`${D}manage-users`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({action:`update`,user_id:c.user_id,person_id:r})}).catch(()=>{})}r.querySelector(`#invite-name`).value=``,r.querySelector(`#invite-email`).value=``,o.style.display=`none`,r.querySelector(`#invite-btn`).disabled=!1,I(`Invitation envoyée à ${i}`,`📧`),ue()}catch(e){o.textContent=e.message,o.style.display=`block`,r.querySelector(`#invite-btn`).disabled=!1}}}).catch(e=>{r.innerHTML=`<h3>👥 Collaborateurs</h3><p class="text-muted">Impossible de charger la liste : ${V(e.message)}.</p><div class="modal-actions"><button class="btn" id="modal-cancel">Fermer</button></div>`,r.querySelector(`#modal-cancel`).onclick=i})}function de(e,t,n){let r=t.find(t=>t.id===e);if(!r)return;document.getElementById(`modal-backdrop`);let i=document.getElementById(`modal-box`);i.className=`modal-box`,i.innerHTML=`
    <h3>Modifier ${V(r.display_name||r.email||`collaborateur`)}</h3>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:4px;">Nom affiché</label>
        <input type="text" id="edit-display-name" value="${V(r.display_name||``)}" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;box-sizing:border-box;">
      </div>
      <div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:4px;">Adresse email</label>
        <input type="email" id="edit-email" value="${V(r.email||``)}" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;box-sizing:border-box;">
      </div>
      <div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:4px;">Rôle</label>
        <select id="edit-role" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
          <option value="vet" ${r.role===`vet`?`selected`:``}>Vétérinaire</option>
          <option value="asv" ${r.role===`asv`?`selected`:``}>ASV</option>
          <option value="admin" ${r.role===`admin`?`selected`:``}>Admin</option>
        </select>
      </div>
      <div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:8px;">Droits de modification des plannings</label>
        <label style="font-size:13px;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <input type="checkbox" id="edit-vet-cal" ${r.can_edit_vet_calendar?`checked`:``}>
          Peut modifier le planning vétérinaires
        </label>
        <label style="font-size:13px;display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="edit-all-asv" ${r.can_edit_all_asv?`checked`:``}>
          Peut modifier toutes les lignes ASV
        </label>
      </div>
      <div style="border-top:1px solid var(--color-border);padding-top:12px;">
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:8px;">Accès au compte</label>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="edit-send-invite" style="font-size:12px;">📧 Renvoyer l'invitation</button>
          <button class="btn" id="edit-send-reset" style="font-size:12px;">🔑 Réinitialiser le mot de passe</button>
        </div>
        <p id="edit-access-msg" style="font-size:12px;margin:6px 0 0;display:none;"></p>
      </div>
    </div>
    <p id="edit-error" style="color:#B91C1C;font-size:12px;display:none;margin-bottom:8px;"></p>
    <div class="modal-actions">
      <button class="btn" id="edit-back">← Retour</button>
      <button class="btn btn-primary" id="edit-save">Enregistrer</button>
    </div>
  `,i.querySelector(`#edit-back`).onclick=()=>n(),i.querySelector(`#edit-save`).onclick=async()=>{let t=i.querySelector(`#edit-display-name`).value.trim(),a=i.querySelector(`#edit-email`).value.trim(),o=i.querySelector(`#edit-role`).value,s=i.querySelector(`#edit-vet-cal`).checked,c=i.querySelector(`#edit-all-asv`).checked,l=i.querySelector(`#edit-error`);if(!t){l.textContent=`Le nom est requis.`,l.style.display=`block`;return}i.querySelector(`#edit-save`).disabled=!0;try{let i={action:`update`,user_id:e,display_name:t,role:o,can_edit_vet_calendar:s,can_edit_all_asv:c};a&&a!==r.email&&(i.email=a);let l=await fetch(`${D}manage-users`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify(i)});if(!l.ok){let e=await l.json().catch(()=>({}));throw Error(e.error||`Erreur ${l.status}`)}I(`Collaborateur mis à jour`,`✅`),n()}catch(e){l.textContent=e.message,l.style.display=`block`,i.querySelector(`#edit-save`).disabled=!1}};let a=async t=>{let n=i.querySelector(`#edit-access-msg`);n.style.display=`none`,i.querySelector(`#edit-send-invite`).disabled=!0,i.querySelector(`#edit-send-reset`).disabled=!0;try{let i=await fetch(`${D}manage-users`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({action:`send_access_email`,user_id:e,type:t})});if(i.status===401&&(await at(),i=await fetch(`${D}manage-users`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({action:`send_access_email`,user_id:e,type:t})})),!i.ok){let e=await i.json().catch(()=>({}));throw Error(e.error||`Erreur ${i.status}`)}let a=await i.json();n.style.color=`var(--color-primary)`,n.textContent=`Email envoyé à ${a.email||r.email}`,n.style.display=`block`}catch(e){n.style.color=`#B91C1C`,n.textContent=`Erreur : `+e.message,n.style.display=`block`}finally{i.querySelector(`#edit-send-invite`).disabled=!1,i.querySelector(`#edit-send-reset`).disabled=!1}};i.querySelector(`#edit-send-invite`).onclick=()=>a(`invite`),i.querySelector(`#edit-send-reset`).onclick=()=>a(`recovery`)}var fe=[`#0F766E`,`#2563EB`,`#7C3AED`,`#DC2626`,`#16A34A`,`#EA580C`];async function pe(e){let t=await fetch(`${E}rpc/get_calendar_sync_status`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({p_person_id:e})});if(!t.ok)throw Error(`HTTP ${t.status}`);return(await t.json())[0]||{token:null,sync_presence:!0,sync_absences:!0,color:fe[0]}}async function me(e){let t=await fetch(`${E}rpc/generate_calendar_sync_token`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({p_person_id:e})});if(!t.ok)throw Error(`HTTP ${t.status}`);return t.json()}async function he(e){let t=await fetch(`${E}rpc/revoke_calendar_sync_token`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({p_person_id:e})});if(!t.ok)throw Error(`HTTP ${t.status}`)}async function ge(e,t,n,r){let i=await fetch(`${E}rpc/update_calendar_sync_preferences`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({p_person_id:e,p_sync_presence:t,p_sync_absences:n,p_color:r})});if(!i.ok)throw Error(`HTTP ${i.status}`)}function _e(e){return`
    <div class="card" style="padding:14px 16px;" id="cal-sync-block-${e.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <span style="font-size:13.5px;font-weight:700;color:${e.color};">${V(e.short)}</span>
        <span class="text-muted" id="cal-sync-status-${e.id}" style="font-size:12px;">Chargement…</span>
      </div>
      <div id="cal-sync-body-${e.id}" style="margin-top:10px;"></div>
    </div>
  `}function ve(e,t){return`
    <div style="margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;margin-bottom:4px;">
        <input type="checkbox" data-pref-presence ${t.sync_presence?`checked`:``}> Jours de présence
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;margin-bottom:8px;">
        <input type="checkbox" data-pref-absences ${t.sync_absences?`checked`:``}> Jours d'absence
      </label>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        ${fe.map(e=>`
          <button type="button" data-pref-color="${e}" aria-label="Couleur ${e}"
            style="width:20px;height:20px;border-radius:50%;background:${e};border:2px solid ${e===t.color?`#0F172A`:`transparent`};cursor:pointer;padding:0;"></button>
        `).join(``)}
      </div>
      <button type="button" class="btn" data-save-prefs style="width:100%;justify-content:center;font-size:12px;padding:6px;">Enregistrer ces préférences</button>
    </div>
  `}function ye(e,t,n){let r=n.color;e.querySelectorAll(`[data-pref-color]`).forEach(t=>{t.onclick=()=>{r=t.dataset.prefColor,e.querySelectorAll(`[data-pref-color]`).forEach(e=>{e.style.border=`2px solid ${e.dataset.prefColor===r?`#0F172A`:`transparent`}`})}}),e.querySelector(`[data-save-prefs]`).onclick=async()=>{let n=e.querySelector(`[data-pref-presence]`).checked,i=e.querySelector(`[data-pref-absences]`).checked;await ge(t.id,n,i,r),I(`Préférences de ${t.short} enregistrées`,`📅`)}}function be(e,t,n,r){let i=!!n.token,a=e.querySelector(`#cal-sync-status-${t.id}`);a.textContent=i?`✅ Active`:`⬜ Non activée`;let o=e.querySelector(`#cal-sync-body-${t.id}`),s=ve(t,n);i?(o.innerHTML=`
      ${s}
      <input type="text" readonly value="${V(r)}" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:6px;font-size:11.5px;font-family:inherit;margin-bottom:8px;" onclick="this.select();">
      <div class="flex gap-2">
        <button type="button" class="btn" data-copy-link style="flex:1;justify-content:center;font-size:12.5px;">Copier le lien</button>
        <button type="button" class="btn" data-revoke style="flex:1;justify-content:center;font-size:12.5px;color:#B91C1C;border-color:#FCA5A5;">Désactiver</button>
      </div>
      <p class="text-muted" style="font-size:11px;margin-top:6px;">Le même lien peut être ajouté à plusieurs téléphones/comptes. "Désactiver" coupe l'accès à tous d'un coup ; les événements déjà ajoutés disparaissent au prochain rafraîchissement automatique de chaque appareil (pas instantané — ni Apple ni Google ne permettent de forcer une suppression immédiate à distance).</p>
    `,ye(o,t,n),o.querySelector(`[data-copy-link]`).onclick=()=>{navigator.clipboard?.writeText(r),I(`Lien copié`,`📋`)},o.querySelector(`[data-revoke]`).onclick=async()=>{await he(t.id),be(e,t,{...n,token:null},``),I(`Synchronisation de ${t.short} désactivée`,`📅`)}):(o.innerHTML=`
      ${s}
      <button type="button" class="btn btn-primary" data-generate style="width:100%;justify-content:center;font-size:12.5px;">Générer mon lien</button>
    `,ye(o,t,n),o.querySelector(`[data-generate]`).onclick=async()=>{let r=await me(t.id),i=`${Ye}?person=${t.id}&token=${r}`;be(e,t,{...n,token:r},i),I(`Lien généré pour ${t.short}`,`📅`)})}function xe(){let e=document.getElementById(`modal-backdrop`),n=document.getElementById(`modal-box`);n.className=`modal-box modal-box-wide`,n.innerHTML=`
    <h3>📅 Synchronisation calendrier</h3>
    <p>Chaque vétérinaire peut abonner son calendrier iPhone ou Android à son planning Amivet. Une fois le lien ajouté, la mise à jour est automatique (toutes les quelques heures, gérée par le téléphone) — sens unique du planning vers le téléphone.</p>
    <div class="cal-sync-grid">${t.map(e=>_e(e)).join(``)}</div>
    <p class="text-muted" style="font-size:11.5px;line-height:1.6;margin-top:14px;">
      <strong>iPhone :</strong> ouvrez le lien copié dans Safari, ou Réglages → Calendrier → Comptes → Ajouter un compte → Autre → Ajouter un calendrier en abonnement. La couleur choisie est reprise automatiquement.<br>
      <strong>Android :</strong> sur calendar.google.com (ordinateur), "Autres agendas" → "À partir de l'URL", collez le lien — il apparaît ensuite automatiquement sur le téléphone via le compte Google synchronisé. Google ne reprend pas toujours la couleur choisie ici : vous pouvez la réajuster vous-même dans Google Agenda si besoin.
    </p>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn" id="modal-cancel">Fermer</button>
    </div>
  `,e.classList.add(`open`);let r=()=>e.classList.remove(`open`);n.querySelector(`#modal-cancel`).onclick=r,e.onclick=t=>{t.target===e&&r()},t.forEach(e=>{pe(e.id).then(t=>{let r=t.token?`${Ye}?person=${e.id}&token=${t.token}`:``;be(n,e,t,r)}).catch(t=>{n.querySelector(`#cal-sync-status-${e.id}`).textContent=`Connexion impossible`,console.warn(t)})})}var v=[`Janvier`,`Février`,`Mars`,`Avril`,`Mai`,`Juin`,`Juillet`,`Août`,`Septembre`,`Octobre`,`Novembre`,`Décembre`],Se=[`Janv`,`Févr`,`Mars`,`Avr`,`Mai`,`Juin`,`Juil`,`Août`,`Sept`,`Oct`,`Nov`,`Déc`],Ce=[`Lu`,`Ma`,`Me`,`Je`,`Ve`,`Sa`,`Di`],y=new Date,we=`amivet_current_year`;function b(){let e=parseInt(localStorage.getItem(we),10);return Number.isInteger(e)?e:2026}function Te(e){localStorage.setItem(we,String(e))}var Ee={month:y.getFullYear()===b()?y.getMonth():0},De={month:0},Oe={month:y.getFullYear()===b()?y.getMonth():0},ke={month:0};function Ae(){let e=b();return{"vets-current":{year:e,people:t,navState:Ee,todayNav:!0,forecast:!1,label:`Vétérinaires`,containerId:`vets-sub-calendar`,printable:!1},"vets-forecast":{year:e+1,people:t,navState:De,todayNav:!1,forecast:!0,label:`Vétérinaires`,containerId:`vets-sub-forecast`,printable:!1},"asv-current":{year:e,people:n,navState:Oe,todayNav:!0,forecast:!1,label:`ASV`,containerId:`asv-sub-calendar`,printable:!0},"asv-forecast":{year:e+1,people:n,navState:ke,todayNav:!1,forecast:!0,label:`ASV`,containerId:`asv-sub-forecast`,printable:!0}}}var x=Ae(),je={year:b()},S={vets:`calendar`,asv:`calendar`},Me={vets:`current`,asv:`current`},Ne={vets:{label:`Vétérinaires`,calendarViewKey:`vets-current`,forecastViewKey:`vets-forecast`,calendarContainer:`vets-sub-calendar`,annualContainer:`vets-sub-annual`,forecastContainer:`vets-sub-forecast`},asv:{label:`ASV`,calendarViewKey:`asv-current`,forecastViewKey:`asv-forecast`,calendarContainer:`asv-sub-calendar`,annualContainer:`asv-sub-annual`,forecastContainer:`asv-sub-forecast`}};function Pe(){return y.getFullYear()>b()}function Fe(){let e=b()+1;Te(e),x=Ae(),Ee.month=0,Oe.month=0,De.month=0,ke.month=0,document.getElementById(`rollover-banner`)?.remove(),z(),I(`Calendrier basculé sur ${e}`,`🔄`)}function Ie(){if(!Pe()||document.getElementById(`rollover-banner`))return;let e=b(),t=e+1,n=document.createElement(`div`);n.id=`rollover-banner`,n.className=`rollover-banner`,n.innerHTML=`
    <span>📅 Nous sommes en ${y.getFullYear()} — le calendrier ${e} peut basculer sur ${t} (le prévisionnel ${t} devient le calendrier courant, ${t+1} est proposé en prévisionnel).</span>
    <div class="rollover-actions">
      <button class="btn btn-sm btn-primary" id="rollover-confirm">Basculer maintenant</button>
      <button class="btn-icon" id="rollover-dismiss" aria-label="Plus tard">✕</button>
    </div>
  `,document.getElementById(`app-main`).prepend(n),n.querySelector(`#rollover-confirm`).onclick=Fe,n.querySelector(`#rollover-dismiss`).onclick=()=>n.remove()}var Le=[],Re=30;function C(){Le.push(JSON.stringify(M.slots)),Le.length>Re&&Le.shift(),Be()}function ze(){Le.length!==0&&(M.slots=JSON.parse(Le.pop()),N(!1),z(),Be(),I(`Dernière action annulée`,`↩️`))}function Be(){document.querySelectorAll(`.undo-btn`).forEach(e=>{e.disabled=Le.length===0})}function Ve(e){let t=e%19,n=Math.floor(e/100),r=e%100,i=Math.floor(n/4),a=n%4,o=Math.floor((n+8)/25),s=Math.floor((n-o+1)/3),c=(19*t+n-i-s+15)%30,l=Math.floor(r/4),u=r%4,d=(32+2*a+2*l-c-u)%7,f=Math.floor((t+11*c+22*d)/451),p=Math.floor((c+d-7*f+114)/31),m=(c+d-7*f+114)%31+1,h=new Date(e,p-1,m),g=[new Date(e,0,1),new Date(h.getTime()+1*864e5),new Date(e,4,1),new Date(e,4,8),new Date(h.getTime()+39*864e5),new Date(h.getTime()+50*864e5),new Date(e,6,14),new Date(e,7,15),new Date(e,10,1),new Date(e,10,11),new Date(e,11,25)],_=[`Jour de l'An`,`Lundi de Pâques`,`Fête du Travail`,`Victoire 1945`,`Ascension`,`Lundi de Pentecôte`,`Fête Nationale`,`Assomption`,`Toussaint`,`Armistice`,`Noël`],ee={};return g.forEach((e,t)=>{ee[w(e)]=_[t]}),ee}var He={};function Ue(e){return He[e]||(He[e]=Ve(e)),He[e]}function We(e){return Ue(parseInt(e.slice(0,4),10))[e]||null}function w(e){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`}function Ge(e,t){return new Date(e,t+1,0).getDate()}function Ke(e){return(e.getDay()+6)%7}function T(e){return Ke(e)===6}function qe(e){return Ke(e)===5}var E=`https://ubowqtowyqmpraoxbaoo.supabase.co/rest/v1/`,Je=`https://ubowqtowyqmpraoxbaoo.supabase.co/auth/v1/`,D=`https://ubowqtowyqmpraoxbaoo.supabase.co/functions/v1/`,Ye=`${D}calendar-feed`,Xe=`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVib3dxdG93eXFtcHJhb3hiYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MzkzNjksImV4cCI6MjA5ODIxNTM2OX0.cC7vTWrK-Ykii5dtlg_6lA5quHe6rv78IRxZT-ArV_8`,O=null,Ze=`vet`,k={list:[],reads:new Set,loaded:!1,filter:`all`},Qe=null,$e=`amivet_auth_session`;function et(){try{return JSON.parse(sessionStorage.getItem($e))}catch{return null}}function tt(e){sessionStorage.setItem($e,JSON.stringify(e))}function nt(){sessionStorage.removeItem($e),O=null}function A(e){let t=et()?.access_token||Xe;return Object.assign({apikey:Xe,Authorization:`Bearer ${t}`},e||{})}async function rt(e,t){let n=await fetch(`${Je}token?grant_type=password`,{method:`POST`,headers:{apikey:Xe,"Content-Type":`application/json`},body:JSON.stringify({email:e,password:t})});if(!n.ok){let e=await n.json().catch(()=>({}));throw Error(e.error_description||e.message||`Erreur ${n.status}`)}let r=await n.json();return tt(r),r}async function it(){let e=et();e?.access_token&&await fetch(`${Je}logout`,{method:`POST`,headers:{apikey:Xe,Authorization:`Bearer ${e.access_token}`}}).catch(()=>{}),nt()}async function at(){let e=et();if(!e?.refresh_token)return nt(),null;let t=await fetch(`${Je}token?grant_type=refresh_token`,{method:`POST`,headers:{apikey:Xe,"Content-Type":`application/json`},body:JSON.stringify({refresh_token:e.refresh_token})});if(!t.ok)return nt(),null;let n=await t.json();return tt(n),n}async function ot(e,t){if(!(await fetch(`${Je}user`,{method:`PUT`,headers:{apikey:Xe,Authorization:`Bearer ${e}`,"Content-Type":`application/json`},body:JSON.stringify({password:t})})).ok)throw Error(`Erreur lors de la mise à jour du mot de passe.`)}async function st(e){if(!(await fetch(`${Je}recover`,{method:`POST`,headers:{apikey:Xe,"Content-Type":`application/json`},body:JSON.stringify({email:e,redirectTo:`https://jtechserge.github.io/amivetpulse/`})})).ok)throw Error(`Impossible d'envoyer l'email de réinitialisation.`)}async function ct(){let e=et();if(!e?.access_token)return null;let t=await fetch(`${Je}user`,{headers:{apikey:Xe,Authorization:`Bearer ${e.access_token}`}});if(t.status===401){let e=await at();if(!e)return null;t=await fetch(`${Je}user`,{headers:{apikey:Xe,Authorization:`Bearer ${e.access_token}`}})}if(!t.ok)return null;let n=await t.json(),r=await fetch(`${E}user_profiles?id=eq.${n.id}&select=*`,{headers:A()});if(!r.ok)return null;let i=await r.json();if(!i.length)return null;let a=i[0];return O={id:n.id,email:n.email,role:a.role,person_id:a.person_id,display_name:a.display_name,can_edit_vet_calendar:a.can_edit_vet_calendar,can_edit_all_asv:a.can_edit_all_asv},O}function lt(){return O?O.role===`admin`?Ze===`asv`?`asv`:`vet`:O.role:null}function ut(){let e=lt();return e===`vet`||e===`admin`}function dt(){return O?.role===`admin`||O?.role===`vet`}function j(e){if(!O||n.find(t=>t.id===e)?.archived)return!1;let t=lt();if(t===`vet`)return!0;if(t===`asv`){let t=O.role===`admin`&&Ze===`asv`,n=t?Qe:O.person_id;return P(e)?t?e===n:e===n||O.can_edit_all_asv===!0:t?!1:O.can_edit_vet_calendar===!0}return!1}var M={version:2,slots:{}};function ft(){try{let e=localStorage.getItem(_);if(e){let t=JSON.parse(e);if(t&&t.slots){M=t;return}}}catch(e){console.warn(`Lecture localStorage impossible, ré-initialisation.`,e)}M={version:2,slots:{}}}function N(e=!0){localStorage.setItem(_,JSON.stringify(M)),Dt(),mt(),e&&Qt()}var pt=null;function mt(){clearTimeout(pt),pt=setTimeout(ht,900)}function ht(){fetch(`${E}planning_data?id=eq.singleton`,{method:`PATCH`,headers:A({"Content-Type":`application/json`,Prefer:`return=minimal`}),body:JSON.stringify({data:M.slots,updated_at:new Date().toISOString()})}).catch(e=>console.warn(`Synchronisation Supabase impossible (hors ligne ?), données conservées en local.`,e))}async function gt(){try{let e=await fetch(`${E}planning_data?id=eq.singleton&select=data`,{headers:A()});if(!e.ok)return;let t=await e.json(),n=t[0]&&t[0].data;n&&Object.keys(n).length>0?(M={version:2,slots:n},localStorage.setItem(_,JSON.stringify(M)),z(),Dt()):n!=null&&(M={version:2,slots:{}},localStorage.setItem(_,JSON.stringify(M)),z(),Dt())}catch(e){console.warn(`Supabase inaccessible, données locales conservées.`,e)}}var _t=new Set,vt=null,yt=[];function bt(e,t,n){return`${e}|${t}|${n}`}function xt(e,t,n){return _t.has(bt(e,t,n))}var St=new Map;function Ct(e,t,n){return St.get(bt(e,t,n))||null}async function wt(){try{let e=await fetch(`${E}monthly_signatures?select=*`,{headers:A()});if(!e.ok)return;let t=await e.json();_t.clear(),St.clear(),t.forEach(e=>{let t=bt(e.person_id,e.year,e.month);_t.add(t),St.set(t,{signedName:e.signed_name,signedAt:e.signed_at})}),z()}catch(e){console.warn(`Signatures inaccessibles (hors ligne ?).`,e)}}async function Tt(e,t,n){let r=await fetch(`${E}monthly_signatures?person_id=eq.${encodeURIComponent(e)}&year=eq.${t}&month=eq.${n}`,{method:`DELETE`,headers:A({Prefer:`return=minimal`})});if(!r.ok)throw Error(`HTTP ${r.status}`);await wt()}async function Et(){try{let e=await fetch(`${E}annual_interviews?select=*`,{headers:A()});if(!e.ok)return;yt=await e.json()}catch(e){console.warn(`Entretiens inaccessibles.`,e)}}function Dt(){let e=document.getElementById(`dash-nav-badge`),t=cr();e&&(e.textContent=t>0?String(t):``,e.className=t>0?`nav-badge`:``),`setAppBadge`in navigator&&(t>0?navigator.setAppBadge(t).catch(()=>{}):navigator.clearAppBadge().catch(()=>{}))}function Ot(){return O?.person_id||O?.id||``}async function kt(){if(O)try{let e=new Date().toISOString(),[t,n]=await Promise.all([fetch(`${E}announcements?select=*&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(e)})&order=pinned.desc,created_at.desc`,{headers:A()}),fetch(`${E}announcement_reads?person_id=eq.${encodeURIComponent(Ot())}&select=announcement_id`,{headers:A()})]),r=t.ok?await t.json():[],i=n.ok?await n.json():[];k.list=Array.isArray(r)?r:[],k.reads=new Set((Array.isArray(i)?i:[]).map(e=>e.announcement_id)),k.loaded=!0,jt()}catch(e){console.warn(`Annonces inaccessibles.`,e)}}function At(){let e=O?.role;return k.list.filter(t=>t.target_roles===`all`||t.target_roles===`vet`&&e===`vet`||t.target_roles===`asv`&&e===`asv`?!0:e===`admin`).filter(e=>!k.reads.has(e.id)).length}function jt(){let e=document.getElementById(`annonces-nav-badge`);if(!e)return;let t=At();e.textContent=t>0?String(t):``,e.className=t>0?`nav-badge`:``}async function Mt(e){if(!k.reads.has(e)){k.reads.add(e),jt();try{await fetch(`${E}announcement_reads`,{method:`POST`,headers:A({"Content-Type":`application/json`,Prefer:`return=minimal,resolution=ignore-duplicates`}),body:JSON.stringify({announcement_id:e,person_id:Ot()})})}catch(e){console.warn(`markAnnouncementRead error`,e)}}}async function Nt(){try{let e=new Date().toISOString(),t=await fetch(`${E}announcements?select=*&expires_at=lte.${encodeURIComponent(e)}&order=created_at.desc`,{headers:A()});return t.ok?await t.json():[]}catch{return[]}}function Pt(e,t,n){return`${e}_${t}_${n}`}function Ft(e,t,n){return`${e}_${t}_${n}_label`}function It(e){return`${e}_comment`}function P(e){return n.some(t=>t.id===e)}function Lt(e,t,n){return`${e}_${t}_${n}_decision`}function Rt(e,t,n){return`${e}_${t}_${n}_decision_comment`}function zt(e,t,n){return M.slots[Lt(e,t,n)]||null}function Bt(e,t,n,r){let i=Lt(e,t,n);r?M.slots[i]=r:delete M.slots[i]}function Vt(e,t,n){return M.slots[Rt(e,t,n)]||``}function Ht(e,t,n,r){let i=Rt(e,t,n);r?M.slots[i]=r:delete M.slots[i]}function Ut(e,t){return`${e}_${t}_overtime`}function Wt(e,t){return parseFloat(M.slots[Ut(e,t)])||0}function Gt(e,t,n){let r=Ut(e,t),i=parseFloat(n);!isNaN(i)&&i!==0?M.slots[r]=i:delete M.slots[r]}function F(e,t,n){return M.slots[Pt(e,t,n)]||`empty`}function Kt(e,t,n,r){let i=Pt(e,t,n),a=M.slots[i]===`absent`;r===`empty`?(delete M.slots[i],delete M.slots[Ft(e,t,n)]):(M.slots[i]=r,r!==`absent`&&delete M.slots[Ft(e,t,n)]),P(t)&&(r===`absent`&&!a?(zt(e,t,n)||Bt(e,t,n,`pending`),Gt(e,t,0)):r!==`absent`&&a&&(Bt(e,t,n,null),Ht(e,t,n,``)))}function qt(e,t,n){return M.slots[Ft(e,t,n)]||``}function Jt(e,t,n,r){let i=Ft(e,t,n);r?M.slots[i]=r:delete M.slots[i]}function Yt(e){return M.slots[It(e)]||``}function Xt(e,t){let n=It(e);t?M.slots[n]=t:delete M.slots[n]}function Zt(e){return e===`empty`?`present`:e===`present`?`absent`:`empty`}function I(e,t=`✓`){let n=document.getElementById(`toast-container`),r=document.createElement(`div`);r.className=`toast`,r.innerHTML=`<span>${t}</span><span>${e}</span>`,n.appendChild(r),setTimeout(()=>r.remove(),15e3)}function Qt(){I(`Sauvegardé`)}function $t({title:e,message:t,confirmLabel:n=`Confirmer`,danger:r=!0,onConfirm:i}){let a=document.getElementById(`modal-backdrop`),o=document.getElementById(`modal-box`);o.className=`modal-box`,o.innerHTML=`
    <h3>${e}</h3>
    <p>${t}</p>
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn ${r?`btn-danger`:`btn-primary`}" id="modal-confirm">${n}</button>
    </div>
  `,a.classList.add(`open`);let s=()=>a.classList.remove(`open`);o.querySelector(`#modal-cancel`).onclick=s,o.querySelector(`#modal-confirm`).onclick=()=>{i(),s()},a.onclick=e=>{e.target===a&&s()}}function en(){let e=dt(),t=O?.role===`admin`,n=O?.display_name||O?.email||``;return`
    ${e?`
      <div class="settings-section-label">Personnalisation</div>
      <button id="action-colors" role="menuitem">🎨 Couleurs des associés</button>
      <hr>
      <div class="settings-section-label">Synchronisation</div>
      <button id="action-calendar-sync" role="menuitem">📅 Synchronisation calendrier</button>
      <hr>
      <div class="settings-section-label">Données</div>
      <button id="action-export" role="menuitem">⬇️ Exporter JSON</button>
      <button id="action-import" role="menuitem">⬆️ Importer JSON</button>
      <input type="file" id="import-file-input" accept="application/json" class="hidden" aria-hidden="true">
      <hr>
      <div class="settings-section-label">Collaborateurs</div>
      <button id="action-manage-users" role="menuitem">👥 Gérer les collaborateurs</button>
      <hr>
    `:``}
    ${t?`
      <div class="settings-section-label">Mode d'affichage</div>
      <button id="action-toggle-view" role="menuitem">👁 ${Ze===`asv`?`Passer en vue Vétérinaires`:`Passer en vue ASV`}</button>
      <hr>
    `:``}
    <div class="settings-section-label">Notifications</div>
    <button id="action-notifications" role="menuitem">🔔 Notifications</button>
    <hr>
    <div class="settings-section-label">Mon compte${n?` — ${V(n)}`:``}</div>
    <button id="action-change-password" role="menuitem">🔑 Changer mon mot de passe</button>
    <button id="action-logout" class="danger" role="menuitem">🚪 Se déconnecter</button>
  `}function tn(){let e=document.getElementById(`settings-toggle`),t=document.getElementById(`settings-menu`);if(t.innerHTML=en(),e.addEventListener(`click`,n=>{n.stopPropagation();let r=!t.classList.contains(`open`);t.classList.toggle(`open`,r),e.setAttribute(`aria-expanded`,String(r))}),document.addEventListener(`click`,n=>{!t.contains(n.target)&&n.target!==e&&(t.classList.remove(`open`),e.setAttribute(`aria-expanded`,`false`))}),dt()){document.getElementById(`action-colors`).addEventListener(`click`,()=>{t.classList.remove(`open`),ce()}),document.getElementById(`action-calendar-sync`).addEventListener(`click`,()=>{t.classList.remove(`open`),xe()}),document.getElementById(`action-export`).addEventListener(`click`,()=>{let e=new Blob([JSON.stringify(M,null,2)],{type:`application/json`}),n=URL.createObjectURL(e),r=document.createElement(`a`);r.href=n,r.download=`amivet_planning_${w(new Date)}.json`,document.body.appendChild(r),r.click(),r.remove(),URL.revokeObjectURL(n),t.classList.remove(`open`),I(`Export JSON téléchargé`,`⬇️`)});let e=document.getElementById(`import-file-input`);document.getElementById(`action-import`).addEventListener(`click`,()=>{t.classList.remove(`open`),e.click()}),e.addEventListener(`change`,t=>{let n=t.target.files[0];if(!n)return;let r=new FileReader;r.onload=()=>{try{let e=JSON.parse(r.result);if(!e||typeof e.slots!=`object`)throw Error(`Format invalide`);C(),M=e,N(!1),z(),I(`Import réussi`,`⬆️`)}catch{I(`Fichier JSON invalide`,`⚠️`)}e.value=``},r.readAsText(n)}),document.getElementById(`action-manage-users`).addEventListener(`click`,()=>{t.classList.remove(`open`),ue()})}O?.role===`admin`&&document.getElementById(`action-toggle-view`).addEventListener(`click`,()=>{t.classList.remove(`open`),Ze===`asv`?(Ze=`vet`,Qe=null,di(),tn(),z(),I(`Retour à la vue Vétérinaires`,`👁`)):fi()}),document.getElementById(`action-notifications`).addEventListener(`click`,()=>{t.classList.remove(`open`),Vi()}),document.getElementById(`action-change-password`).addEventListener(`click`,()=>{t.classList.remove(`open`),le()}),document.getElementById(`action-logout`).addEventListener(`click`,async()=>{t.classList.remove(`open`),await it(),gi()})}function nn(e,t){$t({title:`Réinitialiser le ${t?`prévisionnel ${e}`:`année courante ${e}`} ?`,message:`Toutes les présences, absences${t?``:`, commentaires`} et heures saisies pour ${e} seront définitivement supprimées. Cette action est irréversible.`,confirmLabel:`Réinitialiser ${e}`,onConfirm:()=>{C(),Object.keys(M.slots).filter(t=>t.startsWith(`${e}-`)).forEach(e=>delete M.slots[e]),N(),z(),I(`${e} réinitialisé`,`🗑️`)}})}var L=`vets`,rn={};function R(e){L=e,document.querySelectorAll(`.nav-tab`).forEach(t=>{let n=t.dataset.view===e;t.classList.toggle(`active`,n),t.setAttribute(`aria-current`,n?`page`:`false`)}),document.querySelectorAll(`.view-section`).forEach(t=>{t.classList.toggle(`hidden`,t.id!==`view-${e}`)}),z(),fn()}function z(){Ie();let e=L===`vets`&&S.vets===`forecast`||L===`asv`&&S.asv===`forecast`;if(document.body.classList.toggle(`forecast-theme`,e),L===`dashboard`&&!ut()){R(`vets`);return}let t=rn[L];t&&t()}function an(e){let t=Ne[e],n=S[e];n===`calendar`?U(t.calendarViewKey):n===`forecast`?U(t.forecastViewKey):n===`week`&&e===`asv`?B():li(e)}function on(e,t){let n=Ne[e];S[e]=t,document.querySelectorAll(`#${e}-sub-nav .sub-tab`).forEach(e=>{e.classList.toggle(`active`,e.dataset.sub===t)}),document.getElementById(n.calendarContainer).classList.toggle(`hidden`,t!==`calendar`),document.getElementById(n.annualContainer).classList.toggle(`hidden`,t!==`annual`),document.getElementById(n.forecastContainer).classList.toggle(`hidden`,t!==`forecast`);let r=document.getElementById(`asv-sub-week`);r&&r.classList.toggle(`hidden`,!(e===`asv`&&t===`week`)),z(),fn()}function sn(e){let t=new Date(e),n=t.getDay();return t.setDate(t.getDate()+(n===0?-6:1-n)),t.setHours(0,0,0,0),t}function cn(){return O?.role===`admin`&&Ze===`asv`?Qe||n[0]?.id:lt()===`asv`?O?.person_id||n[0]?.id:Z.personId||n[0]?.id}function ln(e,t){let n=Pr[e],r=Y(n.pS),i=Y(n.pE)-r,a=``;for(let e=15;e<i;e+=15){let n=r+e,o=Math.round(e/i*t),s=n%60==0,c=s?`${Math.floor(n/60)}h`:``;a+=`<div style="position:absolute;left:0;right:0;top:${o}px;border-top:${s?`1px solid rgba(100,116,139,0.2)`:`1px solid rgba(100,116,139,0.07)`};pointer-events:none;">${c?`<span style="position:absolute;left:2px;top:-8px;font-size:7.5px;line-height:1;color:rgba(100,116,139,0.5);pointer-events:none;">${c}</span>`:``}</div>`}return a}function un(e,t,n,r,i,a){let o=[`Lu`,`Ma`,`Me`,`Je`,`Ve`,`Sa`],s=new Date().toLocaleDateString(`fr-FR`,{day:`2-digit`,month:`long`,year:`numeric`}),c=``;n.forEach((t,n)=>{let r=w(t);if(T(t))return;let i=We(r)||``,s=F(r,e,`M`),l=F(r,e,`AM`),u=s===`present`||l===`present`,d=s===`absent`&&l===`absent`,f=J(r,e,`ms`),p=J(r,e,`me`),m=J(r,e,`as`),h=J(r,e,`ae`),g=J(r,e,`ls`),_=J(r,e,`le`),ee=Cr(r,e)+Tr(r,e),te=a(t),ne=ee?Math.round((ee-te)*4)/4:null,re=ne===null?``:ne>0?`<span style="color:#16A34A;">+${q(ne)}</span>`:ne<0?`<span style="color:#DC2626;">${q(ne)}</span>`:`=`,ie=i?`<em style="color:#D97706;">${i}</em>`:d?`<span style="color:#DC2626;">Absent</span>`:u?f?`${f}→${p||`?`}&nbsp;|&nbsp;${m}→${h||`?`}${g?`&nbsp;|&nbsp;☕&nbsp;`+g+`→`+(_||`?`):``}`:`Présent`:`—`;c+=`<tr style="border-bottom:1px solid #E5E7EB;">
      <td style="padding:8px 10px;font-weight:600;">${o[n]}&nbsp;${t.getDate()}/${t.getMonth()+1}</td>
      <td style="padding:8px 10px;">${ie}</td>
      <td style="padding:8px 10px;text-align:center;">${ee?q(ee):`—`}</td>
      <td style="padding:8px 10px;text-align:center;">${re}</td>
    </tr>`});let l=n.reduce((t,n)=>T(n)?t:t+Cr(w(n),e)+Tr(w(n),e),0),u=n.reduce((t,n)=>{if(T(n))return t;let r=Cr(w(n),e)+Tr(w(n),e);return r?t+Math.round((r-a(n))*4)/4:t},0),d=Ar?n.map(t=>Ar(w(t),e)).filter(Boolean).join(` · `):``,f=`
    <style>
      #wk-print-tmp *{box-sizing:border-box;font-family:Arial,sans-serif;}
      #wk-print-tmp .ph1{font-size:16px;margin-bottom:2px;font-weight:700;}
      #wk-print-tmp .ph2{font-size:13px;font-weight:normal;color:#555;margin:0 0 18px;}
      #wk-print-tmp table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;}
      #wk-print-tmp th{background:#F3F4F6;padding:8px 10px;text-align:left;font-size:12px;border-bottom:2px solid #D1D5DB;}
      #wk-print-tmp td{padding:8px 10px;border-bottom:1px solid #E5E7EB;}
      #wk-print-tmp .total-row td{background:#F9FAFB;font-weight:700;}
      #wk-print-tmp .sig-box{border:1px solid #9CA3AF;border-radius:6px;padding:18px 24px;margin-top:28px;}
      #wk-print-tmp .sig-line{border-bottom:1px solid #6B7280;height:48px;margin-top:8px;}
      #wk-print-tmp .pfooter{font-size:10px;color:#9CA3AF;margin-top:30px;text-align:right;}
    </style>
    <div style="padding:30px;color:#111;font-size:13px;">
      <div class="ph1">Planning hebdomadaire — ${V(r?.short||e)}</div>
      <div class="ph2">${i}</div>
      <table>
        <thead><tr>
          <th>Jour</th><th>Horaires / Statut</th><th style="text-align:center;">Total</th><th style="text-align:center;">H. supp./Déf.</th>
        </tr></thead>
        <tbody>${c}
        <tr class="total-row">
          <td colspan="2">Total semaine</td>
          <td style="text-align:center;">${l?q(l):`—`}</td>
          <td style="text-align:center;">${u?`<span style="color:${u>0?`#16A34A`:`#DC2626`}">${u>0?`+`:``}${q(Math.abs(u))}</span>`:`—`}</td>
        </tr></tbody>
      </table>
      ${d?`<p style="font-size:12px;color:#6B7280;">Note : ${V(d)}</p>`:``}
      <div class="sig-box">
        <strong>Lu et approuvé</strong>
        <div style="display:flex;gap:40px;margin-top:12px;">
          <div style="flex:1;"><div style="font-size:11px;color:#6B7280;margin-bottom:4px;">Signature ASV</div><div class="sig-line"></div></div>
          <div style="flex:1;"><div style="font-size:11px;color:#6B7280;margin-bottom:4px;">Signature vétérinaire</div><div class="sig-line"></div></div>
        </div>
        <div style="font-size:11px;color:#6B7280;margin-top:10px;">Date de remise : _________________________</div>
      </div>
      <p class="pfooter">Imprimé le ${s} — Amivet PULSE</p>
    </div>`,p=document.createElement(`div`);p.id=`wk-print-tmp`,p.innerHTML=f,document.body.appendChild(p),document.body.classList.add(`is-printing`),window.print();let m=()=>{document.body.classList.remove(`is-printing`),p.parentNode&&p.parentNode.removeChild(p)};window.addEventListener(`afterprint`,m,{once:!0}),setTimeout(m,8e3)}function B(){let e=document.getElementById(`asv-sub-week`);if(!e)return;Z.mondayISO||=w(sn(y));let t=new Date(Z.mondayISO+`T00:00:00`),r=Array.from({length:6},(e,n)=>{let r=new Date(t);return r.setDate(r.getDate()+n),r}),i=cn(),a=H(i),o=lt()!==`asv`,s=o||j(i);function c(e){return s&&!xt(i,e.getFullYear(),e.getMonth())}let l=r.some(e=>c(e)),u=[`Lu`,`Ma`,`Me`,`Je`,`Ve`,`Sa`];function d(e,t){let n=J(e,t,`ms`);return(n?n<=`08:45`?`O`:`F`:re(e,t))===`F`?`19:15`:`19:00`}function f(e,t,n){let r=w(e);if(T(e)||We(r))return`<td class="week-vis-cell" style="height:${n}px;background:#f8fafc;"></td>`;let a=Pr[t],o=J(r,i,a.s),s=J(r,i,a.e),l=c(e),u=l?n-22:n,f=Y(a.pS),p=Y(a.pE)-f,m=``;if(t===`afternoon`){let e=d(r,i),t=Math.round((Y(e)-f)/p*100);m=`background:linear-gradient(to bottom,var(--color-surface) 0%,var(--color-surface) ${t}%,#DCFCE7 ${t}%,#DCFCE7 100%);`}let h=``;if(o&&s){let e=Y(o),n=Y(s),c=Math.max(0,(e-f)/p*u),l=Math.max(2,(n-e)/p*u);if(t===`afternoon`){let t=Y(d(r,i));if(n<t){let e=(n-f)/p*u,r=Math.max(2,(t-n)/p*u),i=r>=16?`<span class="week-block-label" style="font-size:8px;color:#7F1D1D;">-${q((t-n)/60)}</span>`:``;h=`<div class="week-worked" style="top:${c.toFixed(0)}px;height:${Math.max(2,l).toFixed(0)}px;"></div><div class="week-deficit-block" style="top:${e.toFixed(0)}px;height:${r.toFixed(0)}px;">${i}</div>`}else if(n>t){let r=Math.max(2,(t-e)/p*u),i=(t-f)/p*u,a=Math.max(2,(n-t)/p*u),o=a>=16?`<span class="week-block-label" style="font-size:8px;color:#14532D;">+${q((n-t)/60)}</span>`:``;h=`<div class="week-worked" style="top:${c.toFixed(0)}px;height:${r.toFixed(0)}px;"></div><div class="week-ot-block" style="top:${i.toFixed(0)}px;height:${a.toFixed(0)}px;">${o}</div>`}else{let e=l>=22?`<span class="week-block-label">${o} → ${s}</span>`:``;h=`<div class="week-worked" style="top:${c.toFixed(0)}px;height:${Math.max(2,l).toFixed(0)}px;">${e}</div>`}}else{let e=l>=22?`<span class="week-block-label">${o} → ${s}</span>`:``;h=`<div class="week-worked${a.cls}" style="top:${c.toFixed(0)}px;height:${l.toFixed(0)}px;">${e}</div>`}}let g=`data-adj-iso="${r}" data-adj-pid="${i}"`,_=!o&&!s?`color:var(--color-text-muted);`:``,ee=l?`<div class="week-time-row">
      <span class="week-adj-grp">
        <button class="week-adj" ${g} data-adj-f="${a.s}" data-adj-d="-15">▾</button>
        <span class="week-time-disp" style="${_}">${o||`—`}</span>
        <button class="week-adj" ${g} data-adj-f="${a.s}" data-adj-d="+15">▴</button>
      </span>
      <span class="week-time-sep" style="${_}">→</span>
      <span class="week-adj-grp">
        <button class="week-adj" ${g} data-adj-f="${a.e}" data-adj-d="-15">▾</button>
        <span class="week-time-disp" style="${_}">${s||`—`}</span>
        <button class="week-adj" ${g} data-adj-f="${a.e}" data-adj-d="+15">▴</button>
      </span>
    </div>`:``,te=l?`data-open-popup="${r}" data-open-pid="${i}" data-week-sess="${t}"`:``,ne=l&&t===`afternoon`?` data-dbl-iso="${r}" data-dbl-pid="${i}"`:``;return`<td class="week-vis-cell${t===`lunch`?` week-lunch-cell`:``}" style="height:${n}px;">
      <div class="week-cell-inner">
        <div class="week-vis-area${l?``:` no-edit`}" style="height:${u}px;${m}" ${te}${ne}>${ln(t,u)}${h}</div>
        ${ee}
      </div>
    </td>`}function p(e,t,n=``){let r=w(e);return T(e)||We(r)?`<td class="week-footer-cell" style="background:#f8fafc;${n}"></td>`:`<td class="week-footer-cell" style="${n}">${t(r)}</td>`}let m=`<tr><th class="week-time-label" style="width:40px;font-size:9px;text-align:center;">Horaires</th>${r.map((e,t)=>{let n=w(e),r=We(n),i=`week-th${n===w(y)?` is-today`:r?` is-holiday`:``}`,a=String(e.getDate()).padStart(2,`0`),o=String(e.getMonth()+1).padStart(2,`0`);return`<th class="${i}" data-week-col-iso="${n}">${u[t]}<br><strong>${a}/${o}</strong>${r?`<br><span style="font-size:9px;">${V(r)}</span>`:``}`}).join(`</th>`)}</tr>`,g=`<tr><td class="week-time-label">8h30<br>↕<br>13h00</td>${r.map(e=>f(e,`morning`,230)).join(``)}</tr>`,_=`<tr><td class="week-lunch-label">13h–15h<br>☕</td>${r.map(e=>f(e,`lunch`,100)).join(``)}</tr>`,ee=`<tr><td class="week-time-label">15h00<br>↕<br>20h00</td>${r.map(e=>f(e,`afternoon`,240)).join(``)}</tr>`;function te(e){return e.getDay()===6?a?.saturdayOnly?7.25:7:8.5}function ne(e,t){return`${e}_${t}_shift`}function re(e,t){return M.slots[ne(e,t)]||`O`}let ie=`<tr><td class="week-footer-label">Heures</td>${r.map(e=>p(e,t=>{let n=Cr(t,i)+Tr(t,i);if(!n)return`-`;let r=te(e),a=Math.round((n-r)*4)/4,o=a===0?``:` <span style="font-size:9px;color:${a>0?`#16A34A`:`#DC2626`};">${a>0?`+`:``}${q(Math.abs(a))}</span>`;return`<span class="week-total-h">${q(n)}</span>${o}`})).join(``)}</tr>`,ae=`<tr><td class="week-footer-label" style="font-size:10px;color:var(--color-text-muted);">Poste</td>${r.map(e=>{if(e.getDay()===0)return`<td class="week-footer-cell" style="background:#f8fafc;"></td>`;let t=w(e);if(We(t))return`<td class="week-footer-cell" style="background:#f8fafc;"></td>`;let n=c(e),r=J(t,i,`ms`),a=r?r<=`08:45`?`O`:`F`:re(t,i),o=a===`F`;return n?`<td class="week-footer-cell" style="padding:2px;"><button class="week-shift-btn" data-shift-iso="${t}" data-shift-pid="${i}" title="${o?`Fermeture (9h→19h15)`:`Ouverture (8h30→19h)`}" style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;border:1px solid ${o?`#6366F1`:`#16A34A`};background:${o?`#EEF2FF`:`#F0FDF4`};color:${o?`#4F46E5`:`#15803D`};cursor:pointer;">${a}</button></td>`:`<td class="week-footer-cell"><span style="font-size:10px;color:var(--color-text-muted);">${r?a:`—`}</span></td>`}).join(``)}</tr>`,oe=o?`<select class="week-asv-pick" id="week-asv-pick">${n.map(e=>`<option value="${e.id}" ${e.id===i?`selected`:``}>${V(e.short)}</option>`).join(``)}</select>`:`<span style="font-weight:700;color:${a?.color||`inherit`}">${V(a?.short||``)}</span>`,se=r[5],ce=`${t.getDate()} ${v[t.getMonth()].toLowerCase()} – ${se.getDate()} ${v[se.getMonth()].toLowerCase()} ${se.getFullYear()}`;e.innerHTML=`
    <h2 class="section-title">⏱️ Vue hebdomadaire — ${V(a?.short||``)}</h2>
    <p class="section-desc">Clic + glisse : saisir les horaires (15h–20h). Double-clic avant 19h : marquer un départ anticipé (bloc rouge). Zone verte (après 19h) : heures supplémentaires.</p>
    <div class="week-nav">
      <button class="btn-icon" id="week-prev">←</button>
      <span class="week-nav-label">${ce}</span>
      <button class="btn-icon" id="week-next">→</button>
      <button class="btn btn-sm" id="week-today-btn">Aujourd'hui</button>
      ${l?`<button class="btn btn-sm btn-danger" id="week-clear-btn" title="Effacer toutes les heures de la semaine">🗑️ Vider la semaine</button>`:``}
      ${oe}
    </div>
    <div class="week-view-wrap card" style="padding:0;">
      <table class="week-table"><thead>${m}</thead><tbody>${g}${_}${ee}${ae}${ie}</tbody></table>
    </div>
    <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
      <div class="card" style="padding:10px 14px;flex:1;min-width:260px;">
        <div style="font-size:11px;font-weight:700;color:var(--color-text-muted);margin-bottom:6px;">LÉGENDE INTERACTIONS</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px 16px;font-size:11px;">
          <span>🖱️ <b>Clic + glisse</b> — saisie horaires</span>
          <span>🖱️🖱️ <b>Double-clic &lt;19h</b> — départ anticipé</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#FCA5A5;border-radius:2px;vertical-align:middle;"></span> Déficit (heures non travaillées)</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#86EFAC;border-radius:2px;vertical-align:middle;"></span> Zone H.supp. (19h→20h)</span>
          <span>🖱️ <b>Clic simple</b> — popup saisie précise</span>
        </div>
      </div>
      <button class="btn btn-sm" id="week-print-btn" style="align-self:center;" title="Imprimer le planning de la semaine avec cadre de signature">🖨️ Imprimer</button>
    </div>`,e.querySelector(`#week-prev`).onclick=()=>{let e=new Date(Z.mondayISO+`T00:00:00`);e.setDate(e.getDate()-7),Z.mondayISO=w(e),B()},e.querySelector(`#week-next`).onclick=()=>{let e=new Date(Z.mondayISO+`T00:00:00`);e.setDate(e.getDate()+7),Z.mondayISO=w(e),B()},e.querySelector(`#week-today-btn`).onclick=()=>{Z.mondayISO=w(sn(y)),B()},l&&(e.querySelector(`#week-clear-btn`).onclick=()=>{$t({title:`Vider la semaine du ${`${t.getDate()} ${v[t.getMonth()].toLowerCase()} – ${r[5].getDate()} ${v[r[5].getMonth()].toLowerCase()}`} ?`,message:`Toutes les heures saisies, absences, ajustements et notes de la semaine de ${V(a?.short||``)} seront supprimés. Cette action est irréversible.`,confirmLabel:`Vider la semaine`,onConfirm:()=>{C(),r.forEach(e=>{let t=w(e);T(e)||!c(e)||([`ms`,`me`,`as`,`ae`,`ls`,`le`].forEach(e=>{delete M.slots[yr(t,i,e)]}),Gt(t,i,0),jr(t,i,``),h.forEach(e=>{F(t,i,e)!==`empty`&&Kt(t,i,e,`empty`)}))}),N(),I(`Semaine vidée (${V(a?.short||``)})`,`🗑️`),B()}})}),o&&(e.querySelector(`#week-asv-pick`).onchange=e=>{Z.personId=e.target.value,B()});function le(e,t){let n=t.dataset.openPopup,r=t.dataset.openPid,i=t.dataset.weekSess;if(!n||!r||!i)return;let a=t.getBoundingClientRect(),o=Math.max(0,Math.min(1,(e.clientY-a.top)/t.offsetHeight)),{pS:s,pE:c}=Pr[i],l=Math.max(Y(s),Math.min(Y(c)-15,Lr(o,s,c)));X={iso:n,pid:r,session:i,startMin:l,endMin:l+15,el:t,startY:e.clientY,hasDragged:!1},e.preventDefault()}function ue(e){if(!X)return;let{el:t,session:n,startMin:r,startY:i}=X;if(!X.hasDragged&&Math.abs(e.clientY-i)<8)return;X.hasDragged=!0;let{pS:a,pE:o}=Pr[n],s=t.getBoundingClientRect(),c=Math.max(0,Math.min(1,(e.clientY-s.top)/t.offsetHeight)),l=Math.max(r+15,Math.min(Y(o),Lr(c,a,o)));X.endMin=l,fe(t,n,r,l)}function de(){if(!X)return;let{iso:e,pid:t,session:n,startMin:r,endMin:i,el:a,hasDragged:o}=X;if(X=null,!o)return dn(e,t);let{pS:s,pE:c,s:l,e:u}=Pr[n];if(C(),br(e,t,l,Ir(Math.max(Y(s),r))),br(e,t,u,Ir(Math.min(Y(c),i))),Mr(e,t),N(),jn(t,e)){B();return}B()}function fe(e,t,n,r){let{pS:i,pE:a,cls:o}=Pr[t],s=Y(i),c=Y(a)-s,l=e.offsetHeight,u=Math.max(0,(n-s)/c*l),d=Math.max(4,(r-n)/c*l),f=e.querySelector(`.week-worked`);f||(f=document.createElement(`div`),f.className=`week-worked`+o,e.appendChild(f)),f.style.cssText=`top:${u.toFixed(0)}px;height:${d.toFixed(0)}px;`,f.innerHTML=d>=22?`<span class="week-block-label">${Ir(n)} → ${Ir(r)}</span>`:``;let p=e.closest(`td`)?.querySelector(`.week-time-row`);if(p){let e=p.querySelectorAll(`.week-time-disp`);e[0]&&(e[0].textContent=Ir(n)),e[1]&&(e[1].textContent=Ir(r))}}e.querySelectorAll(`.week-vis-area[data-open-popup]`).forEach(e=>{e.addEventListener(`mousedown`,t=>{t.button===0&&le(t,e)}),e.addEventListener(`touchstart`,t=>{le(t.touches[0],e)},{passive:!1}),e.addEventListener(`touchend`,()=>de(),{passive:!0})}),document.addEventListener(`mousemove`,e=>{X&&ue(e)}),document.addEventListener(`mouseup`,()=>{X&&de()}),document.addEventListener(`touchmove`,e=>{X&&(ue(e.touches[0]),e.preventDefault())},{passive:!1}),e.addEventListener(`click`,e=>{let t=e.target.closest(`.week-adj`);if(!t)return;e.stopPropagation();let{adjIso:n,adjPid:r,adjF:i,adjD:a}=t.dataset;if(!n||!r||!i||!a)return;let[o,s]={ms:[`06:00`,`13:00`],me:[`06:00`,`13:00`],ls:[`12:00`,`15:30`],le:[`12:00`,`15:30`],as:[`13:00`,`20:00`],ae:[`13:00`,`20:00`]}[i]||[`00:00`,`23:30`],c=J(n,r,i)||(i.endsWith(`s`)?o:s);if(C(),br(n,r,i,Nr(c,parseInt(a,10),o,s)),Mr(n,r),N(),jn(r,n)){B();return}B()}),e.querySelectorAll(`.week-shift-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.shiftIso,n=e.dataset.shiftPid,r=re(t,n)===`O`?`F`:`O`;M.slots[ne(t,n)]=r,N(!1),B()})}),e.querySelectorAll(`.week-vis-area[data-dbl-iso]`).forEach(e=>{e.addEventListener(`dblclick`,t=>{t.stopPropagation();let n=e.dataset.dblIso,r=e.dataset.dblPid,i=e.getBoundingClientRect(),a=Math.max(0,Math.min(1,(t.clientY-i.top)/e.offsetHeight)),o=Y(Pr.afternoon.pS),s=o+a*(Y(Pr.afternoon.pE)-o),c=Math.round(s/15)*15;c>=Y(d(n,r))||(C(),J(n,r,`as`)||br(n,r,`as`,vr.amStart),br(n,r,`ae`,Ir(c)),Mr(n,r),N(),B())})}),e.querySelector(`#week-print-btn`).addEventListener(`click`,()=>{un(i,t,r,a,ce,te)})}function dn(e,t){let n=document.getElementById(`popover-backdrop`),r=document.getElementById(`popover-box`),i=H(t),a=wr(e,t)||Er(e,t),o=Ar(e,t),s=`padding:5px 7px;border:1px solid var(--color-border);border-radius:6px;font-family:inherit;font-size:13px;width:100%;box-sizing:border-box;background:var(--color-surface);color:var(--color-text);`;function c(n,r){return J(e,t,n)||r}function l(e,t,n,r,i){let a=Y(n),o=Y(r),c=t;if(t){let[e,n]=t.split(`:`).map(Number),r=Math.round((e*60+n)/15)*15;c=`${String(Math.floor(r/60)%24).padStart(2,`0`)}:${String(r%60).padStart(2,`0`)}`}let l=i?`<option value="">—</option>`:``;for(let e=a;e<=o;e+=15){let t=Math.floor(e/60),n=e%60,r=`${String(t).padStart(2,`0`)}:${String(n).padStart(2,`0`)}`;l+=`<option value="${r}"${r===c?` selected`:``}>${r}</option>`}return`<select id="${e}" style="${s}">${l}</select>`}r.innerHTML=`
    <h4 style="margin-bottom:10px;">⏱️ ${V(i?.short||t)} — ${W(e)}</h4>
    <div style="display:grid;grid-template-columns:80px 1fr 16px 1fr;gap:6px 8px;align-items:center;margin-bottom:10px;font-size:13px;">
      <label style="font-weight:600;color:var(--color-text-muted);">Matin :</label>
      ${l(`te-ms`,c(`ms`,vr.mStart),`06:00`,`13:00`,!1)}
      <span style="text-align:center;">→</span>
      ${l(`te-me`,c(`me`,vr.mEnd),`06:00`,`13:00`,!1)}
      <label style="font-weight:600;color:#F59E0B;">13h–15h :</label>
      ${l(`te-ls`,c(`ls`,``),`12:00`,`15:30`,!0)}
      <span style="text-align:center;">→</span>
      ${l(`te-le`,c(`le`,``),`12:00`,`15:30`,!0)}
      <label style="font-weight:600;color:var(--color-text-muted);">A-midi :</label>
      ${l(`te-as`,c(`as`,vr.amStart),`13:00`,`20:00`,!1)}
      <span style="text-align:center;">→</span>
      ${l(`te-ae`,c(`ae`,vr.amEnd),`13:00`,`20:00`,!1)}
    </div>
    <p style="font-size:11px;color:var(--color-text-muted);margin:0 0 10px;">La plage 13h–15h est comptabilisée comme heures supplémentaires.</p>
    <div id="te-preview" style="font-size:12.5px;margin-bottom:10px;font-weight:600;color:var(--color-primary);"></div>
    <input type="text" id="te-note" value="${V(o)}" placeholder="Note / commentaire…" style="width:100%;box-sizing:border-box;${s}margin-bottom:12px;">
    <div class="popover-actions">
      ${a?`<button class="btn btn-sm" id="te-clear" style="color:#B91C1C;border-color:#FCA5A5;">Effacer tout</button>`:`<div></div>`}
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="te-save">Enregistrer</button>
    </div>
  `,n.classList.add(`open`);let u=()=>n.classList.remove(`open`);r.querySelector(`#popover-cancel`).onclick=u,n.onclick=e=>{e.target===n&&u()},a&&(r.querySelector(`#te-clear`).onclick=()=>{C(),[`ms`,`me`,`as`,`ae`,`ls`,`le`].forEach(n=>{delete M.slots[yr(e,t,n)]}),Mr(e,t),jr(e,t,``),N(),u(),B()});let d=()=>{let e=Sr(r.querySelector(`#te-ms`).value,r.querySelector(`#te-me`).value)+Sr(r.querySelector(`#te-ls`).value,r.querySelector(`#te-le`).value)+Sr(r.querySelector(`#te-as`).value,r.querySelector(`#te-ae`).value),n=e>0?Math.round((e-7*zr(t))*10)/10:0;r.querySelector(`#te-preview`).textContent=e>0?`Total : ${q(e)}${n>0?` (+${q(n)} supp.)`:n<0?` (-${q(Math.abs(n))} déficit)`:``}`:``};r.querySelectorAll(`select[id^="te-"]`).forEach(e=>e.addEventListener(`change`,d)),d(),r.querySelector(`#te-save`).onclick=()=>{if(C(),[`ms`,`me`,`as`,`ae`,`ls`,`le`].forEach(n=>{let i=r.querySelector(`#te-${n}`).value;i?M.slots[yr(e,t,n)]=i:delete M.slots[yr(e,t,n)]}),Mr(e,t),jr(e,t,r.querySelector(`#te-note`).value.trim()),N(),u(),jn(t,e)){B();return}B()},r.querySelector(`#te-note`).focus()}function fn(){try{localStorage.setItem(te,JSON.stringify({currentView:L,subNavState:S,annualYearState:Me,dashSubTab:Q===void 0?void 0:Q.tab}))}catch{}}function pn(){try{let e=localStorage.getItem(te);if(!e)return null;let t=JSON.parse(e);return t.subNavState&&Object.assign(S,t.subNavState),t.annualYearState&&Object.assign(Me,t.annualYearState),t.dashSubTab&&Q!==void 0&&(Q.tab=t.dashSubTab),t.currentView||null}catch{return null}}function mn(){document.getElementById(`main-nav`).addEventListener(`click`,e=>{let t=e.target.closest(`.nav-tab`);t&&R(t.dataset.view)}),document.querySelectorAll(`.sub-nav`).forEach(e=>{let t=e.id.replace(`-sub-nav`,``);e.addEventListener(`click`,e=>{let n=e.target.closest(`.sub-tab`);n&&on(t,n.dataset.sub)})})}function hn(){let e=Ne[L];if(!e)return null;let t=S[L];return t===`calendar`?e.calendarViewKey:t===`forecast`?e.forecastViewKey:null}function gn(){document.addEventListener(`keydown`,e=>{if(e.target.matches&&e.target.matches(`input, textarea`))return;if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&e.key.toLowerCase()===`z`){e.preventDefault(),ze();return}let t=hn();t&&(e.key===`ArrowLeft`?vn(t,-1):e.key===`ArrowRight`?vn(t,1):e.key.toLowerCase()===`t`&&x[t].todayNav&&yn(t))})}function V(e){return String(e).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function _n(e,t){return`rgba(${parseInt(e.slice(1,3),16)},${parseInt(e.slice(3,5),16)},${parseInt(e.slice(5,7),16)},${t})`}function H(e){return t.find(t=>t.id===e)||n.find(t=>t.id===e)}function vn(e,t){let n=x[e],r=n.navState.month+t;n.navState.month=(r%12+12)%12,U(e)}function yn(e){let t=x[e];t.navState.month=y.getFullYear()===t.year?y.getMonth():0,U(e)}function bn(e,t,n){let r=H(t),i=F(e,t,n),a=i===`absent`?qt(e,t,n):``,o=i===`absent`&&P(t)?zt(e,t,n)||`pending`:null,s=``,c=``,l=a,u=i;if(i===`present`)s=`background:${r.present.bg};border-color:${r.present.border};color:${r.present.text};`,c=`<span class="cell-mark">✓</span>`;else if(i===`absent`){let r=a.toLowerCase().trim();if(r===`maladie`||r===`arrêt maladie`||r===`arrêt`)u=`sick`,c=`<span class="cell-mark">🤒</span>${a?` `+V(a):``}`,l=`Arrêt maladie${a?` — `+a:``}`;else if(r===`repos`||r===`repos planifié`||r===`non travaillé`)u=`off`,c=a?V(a):`<span class="cell-mark">—</span>`,l=`Repos planifié (hors congé)`;else if(o===`pending`)u=`leave-pending`,c=`${a?V(a)+` `:``}<span class="cell-mark">⏳</span>`,l=`${a?a+` — `:``}En attente de validation`;else if(o===`rejected`){u=`leave-rejected`,c=`<span class="cell-mark">⚠️</span> Voir vétérinaire`;let r=Vt(e,t,n);l=`Congé refusé — merci de vous rapprocher d'un vétérinaire${r?` — `+r:``}`}else o===`approved`&&(u=`leave-approved`),c=a?V(a):`<span class="cell-mark">✈</span>`,o===`approved`&&(c=`<span class="cell-mark">✓</span> ${c}`,l=`${a?a+` — `:``}Congé approuvé`)}else i===`medical`?(u=`medical`,c=`<span class="cell-mark">🏥</span>`,l=`Visite médicale d'entreprise`):s=`border-left:3px solid ${_n(r.color,.4)};`;return{state:i,label:a,decision:o,style:s,html:c,title:l,stateClass:u}}function xn(e,t,n){let r=H(t),{state:i,label:a,decision:o,stateClass:s}=bn(e,t,n),c;return c=i===`present`?`présent`:i===`absent`?s===`sick`?`arrêt maladie${a?` — `+a:``}`:s===`off`?`repos planifié`:o===`pending`?`demande de congé en attente${a?` — `+a:``}`:o===`rejected`?`demande de congé refusée — voir un vétérinaire`:o===`approved`?`congé approuvé${a?` — `+a:``}`:`absent${a?` — `+a:``}`:i===`medical`?`visite médicale d'entreprise`:`non renseigné`,`${r.short}, ${g[n]}, ${c}. Cliquer pour changer.`}function Sn(e){let{date:t,person:n,slot:r}=e.dataset,i=bn(t,n,r),[a,o]=t.split(`-`).map(Number),s=xt(n,a,o-1),c=!j(n),l=s?` cal-wg-half-locked`:c?` cal-wg-half-readonly`:``;e.className=`cal-wg-half${i.stateClass?` cal-wg-half-${i.stateClass}`:``}${l}`,e.style.cssText=i.style||``,e.innerHTML=i.html||(r===`M`?`M`:`A`),e.title=i.title||``,e.setAttribute(`aria-label`,xn(t,n,r))}function Cn(e){let t=x[e],n=`${v[t.navState.month]} ${t.year}`,r=t.todayNav?`<button class="btn btn-sm" id="cal-today-${e}" aria-label="Revenir au mois actuel">📍 Aujourd'hui</button>`:``,i=t.people&&t.people.some(e=>P(e.id))?`
    <div class="cal-paint-bar" id="cal-paint-bar-${e}">
      <span style="font-size:11px;font-weight:600;color:var(--color-text-muted);">Outil :</span>
      <button class="paint-tool${Rr===`present`?` active`:``}" data-paint="present" title="Marquer comme jour travaillé">🟢 Travaillé</button>
      <button class="paint-tool${Rr===`repos`?` active`:``}" data-paint="repos" title="Marquer comme repos planifié">🟠 Repos</button>
      <button class="paint-tool${Rr===`conge`?` active`:``}" data-paint="conge" title="Soumettre une demande de congé">🔵 Congé</button>
    </div>`:``;return`
    <div class="cal-toolbar">
      <div class="cal-month-nav">
        <button class="btn-icon" id="cal-prev-${e}" aria-label="Mois précédent">←</button>
        <div class="cal-month-label">${n}</div>
        <button class="btn-icon" id="cal-next-${e}" aria-label="Mois suivant">→</button>
        ${r}
      </div>
      <div class="cal-toolbar-actions">
        <button class="btn-icon undo-btn" id="cal-undo-${e}" aria-label="Annuler la dernière action" title="Annuler la dernière action (Cmd/Ctrl+Z)" ${Le.length===0?`disabled`:``}>↩️</button>
        <button class="btn btn-sm btn-danger" id="cal-clear-month-${e}" aria-label="Vider le mois affiché">🗑️ Vider le mois</button>
        ${t.printable?`<button class="btn-icon" id="cal-print-${e}" title="Imprimer ce calendrier" aria-label="Imprimer ce calendrier">🖨️</button>`:``}
      </div>
    </div>
    ${i}
  `}function wn(e,t,n){let r=x[e];C();let i=Ge(r.year,t),a=n?r.people.filter(e=>e.id===n):r.people,o=a.filter(e=>P(e.id));for(let e=1;e<=i;e++){let i=w(new Date(r.year,t,e));a.forEach(e=>{h.forEach(t=>Kt(i,e.id,t,`empty`)),Gt(i,e.id,0)}),o.forEach(e=>{[`ms`,`me`,`as`,`ae`,`ls`,`le`].forEach(t=>{delete M.slots[yr(i,e.id,t)]}),jr(i,e.id,``)}),n||Xt(i,``)}N(),U(e),S.asv===`week`&&B();let s=n?H(n).short:r.people.map(e=>e.short).join(` et `);I(`${v[t]} ${r.year} vidé (${s})`,`🗑️`)}function Tn(e,t){let n=x[e],r=`${v[t]} ${n.year}`,i=document.getElementById(`modal-backdrop`),a=document.getElementById(`modal-box`);a.className=`modal-box`;let o=n.people.map(e=>e.short).join(` + `);a.innerHTML=`
    <h3>Vider ${r} ?</h3>
    <p>Choisissez ce qui doit être supprimé définitivement pour ${r}. Cette action est irréversible.</p>
    ${n.people.some(e=>P(e.id))?`<p style="font-size:12px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:8px 10px;color:#92400E;margin:0 0 14px;">⚠️ Les saisies hebdomadaires (heures matin / déjeuner / après-midi) des ASV pour ce mois seront également supprimées.</p>`:``}
    <div class="modal-actions" style="flex-direction:column;align-items:stretch;">
      <button class="btn btn-danger" id="clear-all" style="justify-content:center;">🗑️ Tout le mois (${o})</button>
      ${n.people.map(e=>`<button class="btn btn-danger" data-clear-person="${e.id}" style="justify-content:center;color:${e.color};border-color:${_n(e.color,.4)};">${e.short} uniquement</button>`).join(``)}
      <button class="btn" id="modal-cancel" style="justify-content:center;">Annuler</button>
    </div>
  `,i.classList.add(`open`);let s=()=>i.classList.remove(`open`);a.querySelector(`#modal-cancel`).onclick=s,a.querySelector(`#clear-all`).onclick=()=>{wn(e,t),s()},a.querySelectorAll(`[data-clear-person]`).forEach(n=>{n.onclick=()=>{wn(e,t,n.dataset.clearPerson),s()}}),i.onclick=e=>{e.target===i&&s()}}function En(e,t){let n=new Date(e+`T00:00:00`),r=h.indexOf(t)+1;return r>=h.length&&(r=0,n=new Date(n.getTime()+864e5)),T(n)?(n=new Date(n.getTime()+864e5),{iso:w(n),slot:h[r]}):null}function Dn(e,t){let n=new Date(e+`T00:00:00`),r=h.indexOf(t)-1;return r<0&&(r=h.length-1,n=new Date(n.getTime()-864e5)),T(n)?(n=new Date(n.getTime()-864e5),{iso:w(n),slot:h[r]}):null}function On(e,t,n,r){let i=[],a=new Date(t+`T00:00:00`),o=h.indexOf(n);for(;!T(a);){let t=w(a),n=h[o];if(F(t,e,n)!==`absent`)break;r>0?i.push({iso:t,slot:n}):i.unshift({iso:t,slot:n}),o+=r,o<0?(o=h.length-1,a=new Date(a.getTime()-864e5)):o>=h.length&&(o=0,a=new Date(a.getTime()+864e5))}return i}function kn(e,t,n){if(!t.length)return;let r=t[0],i=t[t.length-1],a=Dn(r.iso,r.slot);a&&F(a.iso,e,a.slot)===`absent`&&On(e,a.iso,a.slot,-1).forEach(({iso:t,slot:r})=>Jt(t,e,r,n));let o=En(i.iso,i.slot);o&&F(o.iso,e,o.slot)===`absent`&&On(e,o.iso,o.slot,1).forEach(({iso:t,slot:r})=>Jt(t,e,r,n))}function An(e,t){let n=0;for(let r=0;r<6;r++){let i=new Date(t);if(i.setDate(i.getDate()+r),T(i))continue;let a=w(i);wr(a,e)?n+=Cr(a,e)+Tr(a,e):(F(a,e,`M`)===`present`&&(n+=hr),F(a,e,`AM`)===`present`&&(n+=hr)),n+=Wt(a,e)}return Math.round(n*100)/100}function jn(e,t){if(H(e)?.saturdayOnly)return!1;let n=An(e,sn(new Date(t+`T00:00:00`)));return n>gr?(Le.length>0&&(M.slots=JSON.parse(Le.pop()),Be()),N(!1),I(`Plafond 42h dépassé (${q(n)}) — saisie annulée`,`🚫`),!0):!1}function Mn(e,t){if(!P(e))return[];let r=H(e);if(!r)return[];let i=new Date(t+`T00:00:00`),a=sn(i),o=0,s=0;for(let t=0;t<6;t++){let n=new Date(a);n.setDate(n.getDate()+t);let r=w(n),i=F(r,e,`M`),c=F(r,e,`AM`);if(i===`present`||c===`present`){o++;continue}let l=i===`absent`?zt(r,e,`M`):null,u=c===`absent`?zt(r,e,`AM`):null;(l===`approved`||u===`approved`)&&s++}let c=[];if(r.saturdayOnly){let t=w(new Date(a.getTime()+5*864e5));F(t,e,`M`)===`present`||F(t,e,`AM`)===`present`||c.push(`Samedi non travaillé`)}else{let e=r.timeFraction>=1?4:3,t=Math.max(0,e-s);o<t&&c.push(`${o}j / ${t}j attendus`)}let l=An(e,a);!r.saturdayOnly&&l>=gr&&c.push(`${q(l)} ≥ 42h`);let u=n.filter(e=>!e.archived&&!e.saturdayOnly),d=n.filter(e=>!e.archived),f=0;for(let e=0;e<6;e++){let t=new Date(a);t.setDate(t.getDate()+e);let n=w(t);We(n)||(t.getDay()===6?d:u).filter(e=>F(n,e.id,`M`)===`present`||F(n,e.id,`AM`)===`present`).length!==2&&f++}f>0&&c.push(`Effectif ≠ 2 ASV (${f}j)`);let p=i.getFullYear(),m=0;for(let t=0;t<12;t++){let n=Ge(p,t);for(let r=1;r<=n;r++){let n=new Date(p,t,r).getDay();if(n===0||n===6)continue;let i=w(new Date(p,t,r));zt(i,e,`M`)===`approved`&&m++,zt(i,e,`AM`)===`approved`&&m++}}let h=m/2;return h>25&&c.push(`CP ${Math.round(h*2)/2}j > 5 sem.`),c}function Nn(e,t,n){let r=Ge(e,t),i=Ke(new Date(e,t,1)),a=w(y),o=n.length>0&&P(n[0].id),s=[],c=Array(i).fill(null);for(let e=1;e<=r;e++)c.push(e),c.length===7&&(s.push(c),c=[]);if(c.length>0){for(;c.length<7;)c.push(null);s.push(c)}let l=`<div class="cal-wg-head"><div class="cal-wg-dh cal-wg-dh-label" aria-hidden="true"></div>${[`L`,`M`,`M`,`J`,`V`,`SA`,o?`Alertes`:`DI`].map((e,t)=>`<div class="cal-wg-dh${t>=5?` cal-wg-dh-we`:``}" ${t===6&&o?`title="Motif d'alerte réglementaire"`:``}>${e}</div>`).join(``)}</div>`,u=`<div class="cal-wg-label-col" aria-hidden="true">
    <div class="cal-wg-label-spacer"></div>
    <div class="cal-wg-label-persons">
      ${n.map(e=>`<div class="cal-wg-plabel${e.archived?` plabel-archived`:``}" style="background:${e.present.bg};color:${e.present.text};" title="${V(e.short)}">${V(e.short)}</div>`).join(``)}
    </div>
  </div>`;return`<div class="cal-wg">${l}${`<div class="cal-wg-person-legend">
    ${n.map(e=>`<span class="cal-wg-person-tag" style="background:${e.present.bg};color:${e.present.text};border-color:${e.present.border};">${e.short}</span>`).join(``)}
    <span class="cal-wg-status-tag cal-wg-status-absent">Congé</span>
    ${o?`<span class="cal-wg-status-tag cal-wg-status-pending">En attente</span>`:``}
  </div>`}${s.map((r,i)=>{let s=r.map((r,i)=>{if(r===null)return`<div class="cal-wg-day cal-wg-day-empty" aria-hidden="true"></div>`;let s=w(new Date(e,t,r)),c=i===5,l=i===6,u=We(s),d=Yt(s),f=`cal-wg-day`;(c||l)&&(f+=` cal-wg-day-we`),c&&(f+=` cal-wg-day-sa`),l&&(f+=` cal-wg-day-su`),u&&(f+=` cal-wg-day-holiday`),s===a&&(f+=` cal-wg-day-today`);let p=l?`<div class="cal-wg-tools"></div>`:`<div class="cal-wg-tools">
        <button class="cal-wg-tool-btn${d?` has-comment`:``}" data-action="comment" data-date="${s}" aria-label="Commentaire du ${r}/${t+1}" title="${d?V(d):`Ajouter un commentaire`}">💬</button>
        <button class="cal-wg-tool-btn" data-action="edit-day" data-date="${s}" aria-label="Édition rapide du ${r}/${t+1}">✏️</button>
      </div>`,m=`<div class="cal-wg-day-head">
        <div class="cal-wg-daynum">${r}</div>
        ${u?`<div class="cal-wg-holiday-name" title="${V(u)}">${V(u)}</div>`:``}
        ${p}
      </div>`;if(l){let e=``;if(o){let t=n.map(e=>{let t=Mn(e.id,s);return t.length===0?`<div class="cal-wg-pstrip" data-person="${e.id}" style="min-height:18px;"></div>`:`<div class="cal-wg-pstrip" data-person="${e.id}" style="padding:2px 3px;min-height:18px;">${t.map(e=>`<div style="font-size:9px;color:#DC2626;font-weight:700;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${V(e)}">${e}</div>`).join(``)}</div>`}).join(``);t&&(e=`<div class="cal-wg-persons" style="pointer-events:none;">${t}</div>`)}return`<div class="${f}" data-date="${s}">${m}${e}</div>`}let g=n.map(n=>{let r=xt(n.id,e,t),i=!j(n.id),a=r||i,o=r?`Feuille de présence signée — verrouillée`:i?`Lecture seule`:``,c=n.archived===!0,l=h.map(e=>{let t=bn(s,n.id,e),c=r?` cal-wg-half-locked`:i?` cal-wg-half-readonly`:``;return`<div class="cal-wg-half${t.stateClass?` cal-wg-half-${t.stateClass}`:``}${c}"
            data-date="${s}" data-person="${n.id}" data-slot="${e}"
            ${a?`data-action="locked"`:``}
            style="${t.style||``}"
            tabindex="${a?`-1`:`0`}" role="button"
            title="${V(a?o:t.title||``)}"
            aria-label="${xn(s,n.id,e)}">${t.html||(e===`M`?`M`:`A`)}</div>`}).join(``);return`<div class="cal-wg-pstrip${c?` pstrip-archived`:``}" data-person="${n.id}">${l}</div>`}).join(``);return`<div class="${f}" data-date="${s}">${m}<div class="cal-wg-persons">${g}</div></div>`}).join(``),c=``;if(o&&r[6]!==null){let a=r.filter(e=>e!==null),o=[];if(i===0){let n=r.find(e=>e!==null),i=new Date(e,t,n);for(let e=Ke(i);e>0;e--){let t=new Date(i.getTime()-e*864e5);T(t)||o.push(t)}}let s=n.map(n=>{let r=a.some(r=>{let i=new Date(e,t,r);return!T(i)&&Cr(w(i),n.id)>0}),i=0;return r&&o.forEach(e=>{i+=Dr(w(e),n.id)}),a.forEach(r=>{let a=new Date(e,t,r);T(a)||(i+=Dr(w(a),n.id))}),{person:n,ot:Or(i)}}),l=s.filter(e=>e.ot!==0),u=r.find(e=>e!==null),d=sn(new Date(e,t,u)),f=n.map(e=>({person:e,h:An(e.id,d)})).map(e=>{if(!e.h)return null;let t=!e.person.saturdayOnly&&e.h>=gr;return`<span class="${t?`ot-neg`:`ot-pos`}" title="${V(e.person.short)} — ${q(e.h)} cette semaine${t?` ⚠️ Plafond 42h`:``}">${V(e.person.short)} ${q(e.h)}${t?` ⚠️`:``}</span>`}).filter(Boolean),p=f.length?`<div class="cal-wg-week-ot" style="opacity:0.85;font-size:11px;"><span style="color:var(--color-text-muted);font-weight:600;margin-right:6px;">Total</span><span class="ot-week-detail">${f.join(`<span class="ot-sep">·</span>`)}</span></div>`:``;if(l.length>0){let e=Or(s.reduce((e,t)=>e+t.ot,0));c=p+`<div class="cal-wg-week-ot"><span class="ot-week-detail">${l.map(e=>`<span class="${e.ot<0?`ot-neg`:`ot-pos`}">${V(e.person.short)} ${ar(e.ot)}</span>`).join(`<span class="ot-sep">·</span>`)}</span><span class="ot-week-sum${e<0?` ot-week-sum-neg`:``}">${ar(e)}</span></div>`}else p&&(c=p)}return`<div class="cal-wg-week-block"><div class="cal-wg-week">${u}${s}</div>${c}</div>`}).join(``)}</div>`}function Pn(e){let t=x[e],n=t.navState.month;return Nn(t.year,n,t.people)}function Fn(e=t){let n=e.some(e=>P(e.id));return`
    <div class="legend-row">
      ${e.map(e=>`
        <div class="legend-item"><span class="legend-swatch" style="background:${e.present.bg};border:1.5px solid ${e.present.border}"></span>${e.short} — présent (✓ = une demi-journée)</div>
      `).join(``)}
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-absent);border:1.5px solid var(--color-absent-border)"></span>${n?`Congé validé 🔴`:`Absent`}</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-medical);border:1.5px solid var(--color-medical-border)"></span>Visite médicale 🏥</div>
      ${n?`
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-leave-pending);border:1.5px solid var(--color-leave-pending-border)"></span>Congé en attente 🔵</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-sick);border:1.5px solid var(--color-sick-border)"></span>Arrêt maladie 🤒</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-off);border:1.5px solid var(--color-off-border)"></span>Repos planifié 🟠</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-leave-rejected);border:1.5px solid var(--color-leave-rejected-border)"></span>Demande refusée</div>
      `:``}
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-holiday);border:1.5px solid var(--color-holiday)"></span>Jour férié</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-sunday);border:1.5px solid var(--color-border)"></span>${n?`Dimanche — Motif d'alerte`:`Dimanche (fermé)`}</div>
    </div>
  `}function In(e=t){let n=e.some(e=>P(e.id));return`
    <div class="legend">
      ${Fn(e)}
      <div class="legend-row">
        <span class="legend-help-item">🖱️ <strong>Clic</strong> sur une case : fait défiler Vide → Présent → ${n?`Demande de congé`:`Absent`}</span>
        <span class="legend-help-item">↔️ <strong>Glisser</strong> le clic sur plusieurs cases : les remplit toutes d'un coup</span>
        <span class="legend-help-item">👆 <strong>Clic droit</strong> (ou appui long) sur une case : ouvre la saisie d'un motif ${n?`de la demande`:`d'absence`}</span>
        ${n?`<span class="legend-help-item">📋 Chaque absence saisie est automatiquement <strong>soumise aux vétérinaires</strong> pour validation (onglet Tableau de bord → Demandes de congé)</span>`:``}
      </div>
    </div>
  `}function Ln(e){let t=x[e];if(e!==`asv-current`)return``;let n=t.navState.month;return`
    <div class="card signature-panel" style="margin-top:16px;">
      <h3 style="font-size:14px;margin-bottom:10px;">✍️ Feuille de présence — ${`${v[n]} ${t.year}`}</h3>
      <div class="signature-panel-rows">
        ${t.people.map(e=>{let r=Ct(e.id,t.year,n),i=r?(()=>{let e=new Date(r.signedAt).toLocaleDateString(`fr-FR`,{day:`numeric`,month:`long`,year:`numeric`});return`<span class="text-muted" style="font-size:12.5px;">✅ Signé par ${V(r.signedName)} le ${e}</span>`})():``,a=O?.person_id===e.id&&O?.role===`asv`,o=O?.role===`admin`||O?.role===`vet`,s=a&&!r?`<button type="button" class="btn" data-sign-person="${e.id}" style="font-size:12.5px;padding:6px 12px;">Signer ma feuille de présence</button>`:``,c=o&&!r?`<button type="button" class="btn" data-admin-request-sign="${e.id}" style="font-size:12.5px;padding:6px 12px;">📧 Demander la signature</button>`:``;return`<div class="signature-row">
            <span style="color:${e.color};font-weight:700;">${V(e.short)}</span>
            ${i}
            ${s}${c}
          </div>`}).join(``)}
      </div>
      <p class="text-muted" style="font-size:11px;margin-top:10px;">Une fois signé, le mois est verrouillé pour la personne concernée. Un vétérinaire peut annuler une signature depuis le Tableau de bord si une correction est nécessaire.</p>
    </div>
  `}function Rn(e){let t=x[e];if(e!==`asv-current`)return``;let n=t.navState.month;return`<p class="print-signature-status">✍️ ${t.people.map(e=>{let r=Ct(e.id,t.year,n);if(!r)return`${V(e.short)} : non signé`;let i=new Date(r.signedAt).toLocaleDateString(`fr-FR`,{day:`numeric`,month:`long`,year:`numeric`});return`${V(e.short)} : signé par ${V(r.signedName)} le ${i}`}).join(`&nbsp;&nbsp;—&nbsp;&nbsp;`)}</p>`}async function zn(e,t){let r=x[e],i=r.navState.month,a=document.querySelector(`[data-admin-request-sign="${t}"]`);a&&(a.disabled=!0,a.textContent=`Envoi…`);try{let a=await(await fetch(`${D}request-signature`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({year:r.year,month:i,person_id:t,time_fraction:n.find(e=>e.id===t)?.timeFraction??1})})).json();if(!a.ok)throw Error(a.error||`Erreur inconnue`);let o=H(t);a.email_sent?(I(`Email de signature envoyé à ${o.short}`,`📧`),U(e)):(Bn(a.signing_link,o.short,a.email_error),U(e))}catch(e){I(`Échec — ${e.message||`erreur réseau`}`,`❌`),a&&(a.disabled=!1,a.textContent=`📧 Demander la signature`)}}function Bn(e,t,n){let r=document.getElementById(`modal-backdrop`),i=document.getElementById(`modal-box`);i.className=`modal-box`,i.innerHTML=`
    <h3>🔗 Lien de signature</h3>
    <p style="font-size:13.5px;color:var(--color-text-muted);margin-bottom:14px;">
      L'email n'a pas pu être envoyé à <strong>${V(t)}</strong>.
      ${n?`<br><small style="color:var(--color-text-muted);word-break:break-all;">${V(n)}</small><br>`:``}
      Copiez ce lien et transmettez-le directement à la personne concernée — il est valable 7 jours et à usage unique.
    </p>
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="text" id="signing-link-input" value="${V(e)}"
        readonly style="flex:1;font-size:11px;padding:8px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface-alt);color:var(--color-text-muted);cursor:text;">
      <button class="btn btn-primary" id="copy-signing-link" style="white-space:nowrap;flex-shrink:0;">📋 Copier</button>
    </div>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn" id="modal-cancel">Fermer</button>
    </div>
  `,r.classList.add(`open`);let a=()=>r.classList.remove(`open`);i.querySelector(`#modal-cancel`).onclick=a,r.onclick=e=>{e.target===r&&a()},i.querySelector(`#copy-signing-link`).onclick=()=>{navigator.clipboard.writeText(e).then(()=>{i.querySelector(`#copy-signing-link`).textContent=`✅ Copié !`,setTimeout(()=>{i.querySelector(`#copy-signing-link`).textContent=`📋 Copier`},2e3)})},i.querySelector(`#signing-link-input`).onclick=e=>e.target.select()}async function Vn(e,t){let r=x[e],i=r.navState.month,a=document.querySelector(`[data-sign-person="${t}"]`);a&&(a.disabled=!0,a.textContent=`Envoi…`);try{let a=await(await fetch(`${D}request-signature`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({year:r.year,month:i,time_fraction:n.find(e=>e.id===t)?.timeFraction??1})})).json();if(!a.ok)throw Error(a.error||`Erreur inconnue`);a.email_sent?(I(`Email de signature envoyé à ${O.email}`,`📧`),U(e)):(Bn(a.signing_link,O.email),U(e))}catch(e){I(`Échec — ${e.message||`erreur réseau`}`,`❌`),a&&(a.disabled=!1,a.textContent=`Signer ma feuille de présence`)}}function Hn(e){let t=document.getElementById(`modal-backdrop`),n=document.getElementById(`modal-box`);n.className=`modal-box`,n.innerHTML=`
    <h3>✍️ Confirmer ma signature</h3>
    <p style="margin-bottom:12px;">Vous allez signer électroniquement votre feuille de présence. Votre identité, email et l'horodatage seront enregistrés de façon permanente.</p>
    <div style="background:#F0FDF9;border:1px solid #99F6E4;border-radius:8px;padding:12px 14px;font-size:13px;color:#0F766E;margin-bottom:14px;line-height:1.6;">
      <strong>Signataire :</strong> ${V(O.display_name||O.email)}<br>
      <strong>Email :</strong> ${V(O.email)}
    </div>
    <p id="sign-confirm-error" style="color:#B91C1C;font-size:12px;display:none;margin:0 0 10px;"></p>
    <div class="modal-actions" style="margin-top:4px;">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn btn-primary" id="sign-do-confirm">✍️ Confirmer ma signature</button>
    </div>
  `,t.classList.add(`open`);let r=()=>t.classList.remove(`open`);n.querySelector(`#modal-cancel`).onclick=r,t.onclick=e=>{e.target===t&&r()},n.querySelector(`#sign-do-confirm`).onclick=async()=>{let t=n.querySelector(`#sign-do-confirm`),i=n.querySelector(`#sign-confirm-error`);t.disabled=!0,t.textContent=`Signature en cours…`;try{let t=await(await fetch(`${D}confirm-signature`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({token_id:e})})).json();if(!t.ok)throw Error(t.error||`Erreur inconnue`);r(),await wt(),U(`asv-current`),I(`Feuille de présence signée — email de confirmation envoyé`,`✅`)}catch(e){i.textContent=e.message||`Échec de la signature.`,i.style.display=`block`,t.disabled=!1,t.textContent=`✍️ Confirmer ma signature`}}}function U(e){let t=x[e],n=document.getElementById(t.containerId);!n||!t||(n.innerHTML=`
    ${t.forecast?`
    <div class="forecast-banner">⚠️ Vue prévisionnelle — données indicatives non confirmées</div>
  `:``}
    ${t.forecast?`<h2 class="section-title">Prévisionnel ${t.year} — ${t.label}</h2>`:`<h2 class="section-title">Calendrier ${t.year} — ${t.label}</h2>`}
    <p class="section-desc">Cliquez sur une cellule pour faire défiler Vide → Présent → Absent. Clic droit (ou appui long) sur une cellule pour saisir un motif d'absence.</p>
    ${Cn(e)}
    ${Pn(e)}
    ${Rn(e)}
    ${In(t.people)}
    ${Ln(e)}
  `,n.querySelectorAll(`[data-sign-person]`).forEach(t=>{t.onclick=()=>Vn(e,t.dataset.signPerson)}),n.querySelectorAll(`[data-admin-request-sign]`).forEach(t=>{t.onclick=()=>zn(e,t.dataset.adminRequestSign)}))}rn.vets=()=>an(`vets`),rn.asv=()=>an(`asv`),rn.annonces=Un;function Un(){let e=document.getElementById(`view-annonces`),t=O?.role===`admin`,n=O?.role;Ot();let i=k.list.filter(e=>!(e.target_roles===`vet`&&n===`asv`||e.target_roles===`asv`&&(n===`vet`||n===`admin`))),o=k.filter,s=o===`all`?i:i.filter(e=>e.category===o);function c(e){return new Date(e).toLocaleDateString(`fr-FR`,{day:`numeric`,month:`short`,year:`numeric`})}function l(e){let t=r().find(t=>t.id===e);return t?t.short||t.name:e}let u=`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
    ${[{id:`all`,label:`Tout`,icon:`📋`},...Object.entries(a).map(([e,t])=>({id:e,label:t.label,icon:t.icon}))].map(e=>`<button class="ann-filter-pill${o===e.id?` active`:``}" data-cat="${e.id}" style="border:1.5px solid ${o===e.id?`var(--color-primary)`:`var(--color-border)`};background:${o===e.id?`var(--color-secondary)`:`var(--color-card)`};color:${o===e.id?`var(--color-primary)`:`var(--color-text)`};padding:5px 12px;border-radius:20px;font-size:13px;cursor:pointer;">${e.icon} ${e.label}</button>`).join(``)}
    ${t?`<button id="ann-new-btn" class="btn btn-sm" style="margin-left:auto;">+ Nouvelle annonce</button>`:``}
  </div>`;function d(e){let n=a[e.category]||a.info,r=!k.reads.has(e.id),i=r?n.bg:`var(--color-card)`;return`<div class="ann-card" data-ann-id="${e.id}" style="position:relative;border:1.5px solid ${e.pinned?n.color:r?n.border:`var(--color-border)`};border-left:${e.pinned?`4px solid ${n.color}`:``};border-radius:10px;padding:14px 16px;margin-bottom:10px;background:${i};cursor:pointer;">
      ${r?`<span style="position:absolute;top:10px;left:10px;width:8px;height:8px;border-radius:50%;background:#3B82F6;"></span>`:``}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
        ${e.pinned?`<span style="font-size:13px;">📌</span>`:``}
        <span style="background:${n.bg};color:${n.color};border:1px solid ${n.border};border-radius:12px;padding:2px 8px;font-size:11.5px;font-weight:700;">${n.icon} ${n.label}</span>
        <span style="font-size:12px;color:var(--color-muted);margin-left:auto;">${l(e.author_id)} · ${c(e.created_at)}</span>
        ${t?`<button class="ann-edit-btn btn btn-sm" data-ann-id="${e.id}" style="font-size:11.5px;padding:3px 8px;">✎</button>`:``}
      </div>
      <div style="font-size:14.5px;font-weight:700;color:var(--color-text);margin-bottom:4px;">${V(e.title)}</div>
      <div style="font-size:13px;color:var(--color-text);line-height:1.55;white-space:pre-wrap;">${V(e.content)}</div>
    </div>`}e.innerHTML=`
    <h2 class="section-title">📣 Tableau d'annonces</h2>
    <div style="margin-bottom:14px;">${u}</div>
    <div id="ann-list">${s.length?s.map(d).join(``):`<p class="text-muted" style="margin-top:16px;">Aucune annonce pour le moment.</p>`}</div>
    <details id="ann-archives" style="margin-top:24px;">
      <summary style="cursor:pointer;font-size:13.5px;color:var(--color-muted);font-weight:600;user-select:none;">📁 Archives (annonces expirées)</summary>
      <div id="ann-archives-list" style="margin-top:10px;opacity:0.6;"></div>
    </details>
  `,e.querySelectorAll(`.ann-filter-pill`).forEach(e=>{e.onclick=()=>{k.filter=e.dataset.cat,Un()}}),e.querySelectorAll(`.ann-card`).forEach(e=>{e.onclick=async t=>{if(t.target.closest(`.ann-edit-btn`))return;let n=e.dataset.annId;await Mt(n),e.style.background=`var(--color-card)`;let r=e.querySelector(`span[style*="#3B82F6"]`);r&&r.remove()}}),e.querySelectorAll(`.ann-edit-btn`).forEach(e=>{e.onclick=t=>{t.stopPropagation(),Wn(e.dataset.annId)}}),t&&(e.querySelector(`#ann-new-btn`).onclick=()=>Wn(null)),e.querySelector(`#ann-archives`).addEventListener(`toggle`,async function(){if(!this.open)return;let e=document.getElementById(`ann-archives-list`);e.textContent=`Chargement…`;let t=await Nt();if(!t.length){e.innerHTML=`<p style="font-size:13px;color:var(--color-muted);">Aucune archive.</p>`;return}e.innerHTML=t.map(e=>{let t=a[e.category]||a.info;return`<div style="border:1px solid var(--color-border);border-radius:8px;padding:10px 14px;margin-bottom:8px;background:var(--color-card);">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
          <span style="background:${t.bg};color:${t.color};border:1px solid ${t.border};border-radius:12px;padding:2px 8px;font-size:11.5px;">${t.icon} ${t.label}</span>
          <span style="font-size:12px;color:var(--color-muted);margin-left:auto;">${l(e.author_id)} · ${c(e.created_at)}</span>
        </div>
        <div style="font-size:13.5px;font-weight:600;">${V(e.title)}</div>
        <div style="font-size:12.5px;color:var(--color-muted);white-space:pre-wrap;">${V(e.content)}</div>
      </div>`}).join(``)})}function Wn(e){if(O?.role!==`admin`)return;let t=e?k.list.find(t=>t.id===e):null,r=document.getElementById(`modal-backdrop`),i=document.getElementById(`modal-box`);i.className=`modal-box`;let o=t?.category||`info`,s=Object.entries(a).map(([e,t])=>{let n=e===o;return`<button type="button" class="ann-cat-btn" data-cat="${e}" style="border:1.5px solid ${t.border};background:${n?t.bg:`var(--color-card)`};color:${t.color};padding:5px 12px;border-radius:20px;font-size:13px;cursor:pointer;font-weight:${n?`700`:`400`};">${t.icon} ${t.label}</button>`}).join(``);i.innerHTML=`
    <h3>${t?`✏️ Modifier l'annonce`:`📣 Nouvelle annonce`}</h3>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Titre <span id="ann-title-count" style="font-weight:400;color:var(--color-muted);">(${t?.title?.length||0}/80)</span></label>
        <input id="ann-title" type="text" maxlength="80" value="${V(t?.title||``)}" placeholder="Titre de l'annonce" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13.5px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Contenu</label>
        <textarea id="ann-content" rows="4" placeholder="Contenu de l'annonce…" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${V(t?.content||``)}</textarea>
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Catégorie</label>
        <div id="ann-cat-btns" style="display:flex;flex-wrap:wrap;gap:6px;">${s}</div>
        <input type="hidden" id="ann-cat-val" value="${t?.category||`info`}">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Destinataires</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${[[`all`,`Tout le monde`],[`vet`,`Vétérinaires uniquement`],[`asv`,`ASV uniquement`]].map(([e,n])=>`<label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="radio" name="ann-roles" value="${e}" ${(t?.target_roles||`all`)===e?`checked`:``}> ${n}</label>`).join(``)}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="font-size:12.5px;font-weight:600;">📌 Épingler en haut</label>
        <input type="checkbox" id="ann-pinned" ${t?.pinned?`checked`:``}>
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Date d'expiration (optionnel)</label>
        <input id="ann-expires" type="date" value="${t?.expires_at?t.expires_at.slice(0,10):``}" style="padding:6px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
    </div>
    <div class="modal-actions" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;">
      ${t?`<button class="btn btn-danger" id="ann-delete-btn" style="margin-right:auto;">🗑️ Supprimer</button>`:``}
      <button class="btn" id="ann-cancel-btn">Annuler</button>
      <button class="btn btn-primary" id="ann-save-btn">${t?`Mettre à jour`:`Publier`}</button>
    </div>
  `,r.classList.add(`open`);let c=()=>r.classList.remove(`open`);i.querySelector(`#ann-cancel-btn`).onclick=c,r.onclick=e=>{e.target===r&&c()};let l=i.querySelector(`#ann-title`),u=i.querySelector(`#ann-title-count`);l.oninput=()=>{u.textContent=`(${l.value.length}/80)`},i.querySelectorAll(`.ann-cat-btn`).forEach(e=>{e.onclick=()=>{i.querySelector(`#ann-cat-val`).value=e.dataset.cat,i.querySelectorAll(`.ann-cat-btn`).forEach(e=>{a[e.dataset.cat],e.style.background=`var(--color-card)`,e.style.fontWeight=`400`});let t=a[e.dataset.cat];e.style.background=t.bg,e.style.fontWeight=`700`}}),t&&(i.querySelector(`#ann-delete-btn`).onclick=async()=>{if(confirm(`Supprimer l'annonce "${t.title}" ?`))try{await fetch(`${E}announcements?id=eq.${t.id}`,{method:`DELETE`,headers:A({Prefer:`return=minimal`})}),k.list=k.list.filter(e=>e.id!==t.id),c(),jt(),Un(),I(`Annonce supprimée`,`🗑️`)}catch(e){I(`Erreur : `+e.message,`⚠️`)}}),i.querySelector(`#ann-save-btn`).onclick=async()=>{let e=i.querySelector(`#ann-title`).value.trim(),r=i.querySelector(`#ann-content`).value.trim(),a=i.querySelector(`#ann-cat-val`).value,o=i.querySelector(`input[name="ann-roles"]:checked`)?.value||`all`,s=i.querySelector(`#ann-pinned`).checked,l=i.querySelector(`#ann-expires`).value,u=l?new Date(l+`T23:59:59`).toISOString():null;if(!e||!r){I(`Titre et contenu requis`,`⚠️`);return}let d=Ot();try{let i;if(t){let n=await fetch(`${E}announcements?id=eq.${t.id}`,{method:`PATCH`,headers:A({"Content-Type":`application/json`,Prefer:`return=representation`}),body:JSON.stringify({title:e,content:r,category:a,target_roles:o,pinned:s,expires_at:u})});[i]=await n.json(),k.list=k.list.map(e=>e.id===i.id?i:e)}else{let t=await fetch(`${E}announcements`,{method:`POST`,headers:A({"Content-Type":`application/json`,Prefer:`return=representation`}),body:JSON.stringify({title:e,content:r,category:a,target_roles:o,pinned:s,expires_at:u,author_id:d})});[i]=await t.json(),s?k.list=[i,...k.list]:k.list=[i,...k.list].sort((e,t)=>!!t.pinned-+!!e.pinned)}if(c(),jt(),Un(),I(t?`Annonce mise à jour`:`Annonce publiée`,`📣`),!t&&typeof $==`function`){let t=o===`vet`?[`david`,`stephane`]:o===`asv`?n.map(e=>e.id):[];$({type:`announcement`,title:`📣 ${e}`,body:r.length>120?r.slice(0,117)+`…`:r,targetUsers:t,data:{type:`announcement`}})}}catch(e){I(`Erreur : `+e.message,`⚠️`)}}}var Gn=[`lundi`,`mardi`,`mercredi`,`jeudi`,`vendredi`,`samedi`,`dimanche`];function W(e){let[t,n,r]=e.split(`-`).map(Number);return`${Gn[Ke(new Date(t,n-1,r))]} ${r} ${v[n-1].toLowerCase()} ${t}`}function Kn(e){let t=e.closest(`[data-cal-view]`);return t?t.dataset.calView:null}function qn(e){C();let{date:t,person:n,slot:r}=e.dataset;Kt(t,n,r,Zt(F(t,n,r))),Sn(e),N()}var G=null;function Jn(e){C();let{date:t,person:n,slot:r}=e.dataset,i=L===`asv`&&P(n),a;a=i&&Rr===`present`?`present`:i&&(Rr===`repos`||Rr===`conge`)?`absent`:Zt(F(t,n,r)),G={startCell:e,paintValue:a,personId:n,moved:!1,cancelled:!1,touched:new Set,viewKey:Kn(e),paintMode:i?Rr:null,longPressTimer:setTimeout(()=>{G&&!G.moved&&(G.cancelled=!0,Qn(e,!0),G=null)},480)}}function Yn(e,t){let{date:n,person:r,slot:i}=e.dataset;G.touched.add(`${n}|${r}|${i}`),G.paintMode===`repos`?(Kt(n,r,i,`absent`),Jt(n,r,i,`Repos planifié`)):Kt(n,r,i,t),Sn(e)}function Xn(e){!G||G.cancelled||(G.moved=!0,clearTimeout(G.longPressTimer),e.dataset.person===G.personId&&Yn(e,G.paintValue))}function Zn(){if(G){if(clearTimeout(G.longPressTimer),!G.cancelled&&(G.moved||Yn(G.startCell,G.paintValue),G.touched.size>0&&(N(),G.viewKey&&U(G.viewKey),G.paintMode===`conge`&&G.touched.size>0))){let e=Array.from(G.touched).map(e=>{let[t,n,r]=e.split(`|`);return{iso:t,slot:r}}),t=G.personId,n=G.viewKey;setTimeout(()=>$n(e,t,n),50)}G=null}}function Qn(e,t){let{date:n,person:r,slot:i}=e.dataset,a=Kn(e),o=H(r);C(),t&&F(n,r,i)!==`absent`&&(Kt(n,r,i,`absent`),Sn(e),N(!1));let s=qt(n,r,i),c=P(r),l=document.getElementById(`popover-backdrop`),u=document.getElementById(`popover-box`);u.innerHTML=`
    <h4>${c?`Demande de congé`:`Motif d'absence`} — ${o.short}, ${g[i]}<br><span class="text-muted" style="font-weight:500;font-size:12px;">${W(n)}</span></h4>
    ${c?`<p class="text-muted" style="font-size:12px;margin:-4px 0 12px;">Sera soumise aux vétérinaires pour validation.</p>`:``}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
      <button type="button" id="popover-sick" style="padding:7px 4px;border:2px solid var(--color-sick-border);background:var(--color-sick);color:var(--color-sick-text);border-radius:var(--radius-btn);font-size:12px;font-weight:700;cursor:pointer;">🤒 Arrêt maladie</button>
      <button type="button" id="popover-off" style="padding:7px 4px;border:2px solid var(--color-off-border);background:var(--color-off);color:var(--color-off-text);border-radius:var(--radius-btn);font-size:12px;font-weight:700;cursor:pointer;">🗓️ Repos planifié</button>
    </div>
    <div class="popover-quicktags">
      ${[`Vacances`,`Formation`,`Congrès`,`Maladie`,`RTT`,`Rendez-vous médical`].map(e=>`<button type="button" class="quicktag" data-tag="${V(e)}">${e}</button>`).join(``)}
    </div>
    <input type="text" id="absence-label-input" placeholder="Motif (ex. SKI TIGNES, GRÈCE...)" value="${V(s)}" maxlength="40">
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">${c?`Soumettre la demande`:`Enregistrer`}</button>
    </div>
  `,l.classList.add(`open`);let d=u.querySelector(`#absence-label-input`);d.focus(),d.select(),u.querySelectorAll(`.quicktag`).forEach(e=>{e.addEventListener(`click`,()=>{d.value=e.dataset.tag,d.focus()})});let f=()=>l.classList.remove(`open`);u.querySelector(`#popover-sick`).onclick=()=>{Jt(n,r,i,`Maladie`),kn(r,[{iso:n,slot:i}],`Maladie`),N(),a&&U(a),f()},u.querySelector(`#popover-off`).onclick=()=>{Jt(n,r,i,`Repos planifié`),kn(r,[{iso:n,slot:i}],`Repos planifié`),N(),a&&U(a),f()},u.querySelector(`#popover-cancel`).onclick=f,u.querySelector(`#popover-save`).onclick=()=>{let e=d.value.trim(),t=Math.ceil((new Date(n+`T00:00:00`)-y)/864e5),s=c&&t>=0&&t<15;s&&I(`Modification à ${t}j — délai réglementaire 15j non respecté`,`⚠️`),Jt(n,r,i,e),kn(r,[{iso:n,slot:i}],e),N(),c&&typeof $==`function`&&$({type:`leave_request`,title:s?`⚠️ Demande de congé hors délai`:`Nouvelle demande de congé`,body:`${o.short} — ${W(n)} (${g[i]})${e?` · `+e:``}${s?` — hors délai 15j`:``}`,targetUsers:[`david`,`stephane`],data:{type:`leave_request`}}),a&&U(a),f()},l.onclick=e=>{e.target===l&&f()}}function $n(e,t,n){let r=H(t),i=P(t),a=qt(e[0].iso,t,e[0].slot),o=document.getElementById(`popover-backdrop`),s=document.getElementById(`popover-box`),c=[`Vacances`,`Formation`,`Congrès`,`Maladie`,`RTT`,`Rendez-vous médical`],l=W(e[0].iso),u=W(e[e.length-1].iso);s.innerHTML=`
    <h4>${i?`Demande de congé`:`Motif d'absence`} — ${r.short}<br><span class="text-muted" style="font-weight:500;font-size:12px;">${l}${e.length>1?` → `+u:``}</span></h4>
    ${i?`<p class="text-muted" style="font-size:12px;margin:-4px 0 12px;">Sera soumise aux vétérinaires pour validation.</p>`:``}
    <div class="popover-quicktags">
      ${c.map(e=>`<button type="button" class="quicktag" data-tag="${V(e)}">${e}</button>`).join(``)}
    </div>
    <input type="text" id="absence-label-input" placeholder="Motif (ex. SKI TIGNES, GRÈCE...)" value="${V(a)}" maxlength="40">
    ${e.length>1?`<button type="button" class="btn btn-sm popover-split-btn" id="popover-split">🔓 Défusionner et vider ces ${e.length} demi-journées</button>`:``}
    <div class="popover-actions">
      <button class="btn btn-danger" id="popover-clear">Effacer</button>
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">${i?`Soumettre la demande`:`Enregistrer`}</button>
    </div>
  `,o.classList.add(`open`);let d=s.querySelector(`#absence-label-input`);d.focus(),d.select(),s.querySelectorAll(`.quicktag`).forEach(e=>{e.addEventListener(`click`,()=>{d.value=e.dataset.tag,d.focus()})});let f=()=>o.classList.remove(`open`);s.querySelector(`#popover-cancel`).onclick=f,s.querySelector(`#popover-clear`).onclick=()=>{C(),e.forEach(({iso:e,slot:n})=>Kt(e,t,n,`empty`)),N(),n&&U(n),f()},s.querySelector(`#popover-save`).onclick=()=>{C();let a=d.value.trim();e.forEach(({iso:e,slot:n})=>Jt(e,t,n,a)),kn(t,e,a),N(),i&&typeof $==`function`&&$({type:`leave_request`,title:`Nouvelle demande de congé`,body:`${r.short} — ${l}${e.length>1?` → `+u:``}${a?` · `+a:``}`,targetUsers:[`david`,`stephane`],data:{type:`leave_request`}}),n&&U(n),f()};let p=s.querySelector(`#popover-split`);p&&(p.onclick=()=>{C(),e.forEach(({iso:e,slot:n})=>Kt(e,t,n,`empty`)),N(),n&&U(n),f()}),o.onclick=e=>{e.target===o&&f()}}function er(e,t){let n=document.getElementById(`popover-backdrop`),r=document.getElementById(`popover-box`),i=Yt(e);r.innerHTML=`
    <h4>💬 Commentaire — ${W(e)}</h4>
    <textarea id="day-comment-input" rows="3" placeholder="Ex. Réunion fournisseur, journée portes ouvertes...">${V(i)}</textarea>
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">Enregistrer</button>
    </div>
  `,n.classList.add(`open`),r.querySelector(`#day-comment-input`).focus();let a=()=>n.classList.remove(`open`);r.querySelector(`#popover-cancel`).onclick=a,r.querySelector(`#popover-save`).onclick=()=>{C(),Xt(e,r.querySelector(`#day-comment-input`).value.trim()),N(),U(t),a()},n.onclick=e=>{e.target===n&&a()}}function tr(e,t,n){let r=document.getElementById(`popover-backdrop`),i=document.getElementById(`popover-box`),[a,o]=e.split(`-`).map(Number);i.innerHTML=`
    <h4>⏱️ Ajustement d'heures<br><span class="text-muted" style="font-weight:500;font-size:12px;">${W(e)} — positif = heures sup, négatif = départ anticipé</span></h4>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
      ${t.map(t=>{let n=xt(t.id,a,o-1),r=!j(t.id),i=n||r,s=n?`Feuille de présence signée — verrouillée`:`Lecture seule`;return`
        <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:700;color:var(--color-text);">
          <span><span class="legend-swatch" style="background:${t.color};width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:middle;"></span>${t.short}${n?` 🔒`:``}</span>
          <input type="number" step="0.5" data-overtime-popover-input data-person="${t.id}" ${i?`disabled title="${s}"`:``}
            value="${Wt(e,t.id)||``}" placeholder="0" style="width:80px;padding:7px 9px;border:1px solid var(--color-border);border-radius:6px;font-family:inherit;font-size:13px;${i?`opacity:0.55;`:``}">
        </label>
      `}).join(``)}
    </div>
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">Enregistrer</button>
    </div>
  `,r.classList.add(`open`);let s=()=>r.classList.remove(`open`);i.querySelector(`#popover-cancel`).onclick=s,i.querySelector(`#popover-save`).onclick=()=>{C(),i.querySelectorAll(`[data-overtime-popover-input]`).forEach(t=>{t.disabled||Gt(e,t.dataset.person,t.value)}),N(),U(n),s()},r.onclick=e=>{e.target===r&&s()}}function nr(e,t){let n=P(t.id),[r,i]=e.split(`-`).map(Number);if(n&&xt(t.id,r,i-1))return`
      <div class="sidebar-person-block">
        <div class="sidebar-person-title"><span class="legend-swatch" style="background:${t.color};width:11px;height:11px;border-radius:50%;display:inline-block;"></span>${t.name}</div>
        <p class="text-muted" style="font-size:12px;margin:8px 0 0;">🔒 Feuille de présence signée pour ce mois — verrouillée. Un vétérinaire peut annuler la signature depuis le Tableau de bord si besoin.</p>
      </div>
    `;if(!j(t.id)){let r=e=>({empty:`Vide`,present:`Présent`,absent:n?`Congé`:`Absent`})[e]||e;return`
      <div class="sidebar-person-block">
        <div class="sidebar-person-title"><span class="legend-swatch" style="background:${t.color};width:11px;height:11px;border-radius:50%;display:inline-block;"></span>${t.name}</div>
        <p class="text-muted" style="font-size:11px;margin:6px 0 8px;">Lecture seule</p>
        ${h.map(n=>{let i=F(e,t.id,n),a=qt(e,t.id,n);return`<p style="font-size:12.5px;margin:4px 0;"><strong>${g[n]} :</strong> ${r(i)}${a?` — ${V(a)}`:``}</p>`}).join(``)}
        ${(()=>{let n=Wt(e,t.id);return n===0?``:`<p class="text-muted" style="font-size:12px;margin:6px 0 0;">Ajustement : ${ar(n)}</p>`})()}
      </div>
    `}return`
    <div class="sidebar-person-block">
      <div class="sidebar-person-title"><span class="legend-swatch" style="background:${t.color};width:11px;height:11px;border-radius:50%;display:inline-block;"></span>${t.name}</div>
      ${h.map(r=>{let i=F(e,t.id,r),a=qt(e,t.id,r),o=i===`absent`&&n?zt(e,t.id,r)||`pending`:null,s=e=>i===e?e===`present`?`background:${t.present.bg};border-color:${t.present.border};color:${t.present.text};`:e===`absent`?`background:var(--color-absent);border-color:var(--color-absent-border);color:var(--color-absent-text);`:`background:var(--color-secondary);border-color:var(--color-text-muted);color:var(--color-text);`:``,c=o===`pending`?`<p class="text-muted" style="font-size:11.5px;margin:6px 0 0;">⏳ En attente de validation</p>`:o===`rejected`?`<p style="font-size:11.5px;margin:6px 0 0;color:var(--color-leave-rejected-text);">⚠️ Refusée${Vt(e,t.id,r)?` — `+V(Vt(e,t.id,r)):``}</p>`:o===`approved`?`<p class="text-muted" style="font-size:11.5px;margin:6px 0 0;">✓ Approuvée</p>`:``;return`
          <p class="text-muted" style="font-size:11.5px;margin:10px 0 5px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">${g[r]}</p>
          <div class="sidebar-state-row">
            ${[`empty`,`present`,`absent`].map(e=>`
              <button type="button" class="sidebar-state-btn ${i===e?`active`:``}" style="${s(e)}"
                data-state-btn data-person="${t.id}" data-slot="${r}" data-state="${e}">
                ${e===`empty`?`Vide`:e===`present`?`Présent`:n?`Congé`:`Absent`}
              </button>
            `).join(``)}
          </div>
          ${i===`absent`?`<input type="text" data-label-input data-person="${t.id}" data-slot="${r}" value="${V(a)}" placeholder="Motif">`:``}
          ${c}
        `}).join(``)}
      ${n&&j(t.id)?`
        <p class="text-muted" style="font-size:11.5px;margin:14px 0 5px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Ajustement d'heures (ce jour)</p>
        <p class="text-muted" style="font-size:11px;margin:0 0 6px;">+ heures supplémentaires &nbsp;/&nbsp; − départ anticipé</p>
        <input type="number" step="0.5" data-overtime-input data-person="${t.id}"
          value="${Wt(e,t.id)||``}" placeholder="Ex. 1.5 ou -1">
      `:n?`
        ${(()=>{let n=Wt(e,t.id);return n===0?``:`<p class="text-muted" style="font-size:12px;margin:10px 0 0;">Ajustement : ${ar(n)} (lecture seule)</p>`})()}
      `:``}
    </div>
  `}function rr(e,t){let n=x[t].people,r=document.getElementById(`sidebar-overlay`),i=document.getElementById(`day-sidebar`),a=()=>{r.classList.remove(`open`),i.classList.remove(`open`)},o=()=>{i.innerHTML=`
      <div class="day-sidebar-head">
        <h3>✏️ ${W(e)}</h3>
        <button class="btn-icon" id="sidebar-close" aria-label="Fermer le panneau">✕</button>
      </div>
      <div class="day-sidebar-body">
        ${n.map(t=>nr(e,t)).join(``)}
        <div class="sidebar-person-block">
          <div class="sidebar-person-title">💬 Commentaire de la journée</div>
          <textarea id="sidebar-comment" rows="3" placeholder="Commentaire...">${V(Yt(e))}</textarea>
        </div>
      </div>
    `,i.querySelector(`#sidebar-close`).onclick=a,i.querySelectorAll(`[data-state-btn]`).forEach(n=>{n.addEventListener(`click`,()=>{C();let{person:r,slot:i,state:a}=n.dataset;Kt(e,r,i,a),a!==`absent`&&Jt(e,r,i,``),N(),o(),U(t)})}),i.querySelectorAll(`[data-label-input]`).forEach(n=>{n.addEventListener(`change`,()=>{C(),Jt(e,n.dataset.person,n.dataset.slot,n.value.trim()),N(),U(t)})}),i.querySelectorAll(`[data-overtime-input]`).forEach(n=>{n.addEventListener(`change`,()=>{C(),Gt(e,n.dataset.person,n.value),N(),U(t)})}),i.querySelector(`#sidebar-comment`).addEventListener(`change`,n=>{C(),Xt(e,n.target.value.trim()),N(),U(t)})};r.onclick=a,o(),r.classList.add(`open`),i.classList.add(`open`)}function ir(){document.addEventListener(`mousedown`,e=>{let t=e.target.closest(`.cal-wg-half`);!t||t.dataset.action||j(t.dataset.person)&&(e.preventDefault(),Jn(t))}),document.addEventListener(`mouseover`,e=>{if(!G)return;let t=e.target.closest(`.cal-wg-half`);t&&!t.dataset.action&&j(t.dataset.person)&&Xn(t)}),document.addEventListener(`mouseup`,Zn),document.addEventListener(`touchstart`,e=>{let t=e.target.closest(`.cal-wg-half`);!t||t.dataset.action||j(t.dataset.person)&&Jn(t)},{passive:!0}),document.addEventListener(`touchmove`,e=>{if(!G)return;let t=e.touches[0],n=document.elementFromPoint(t.clientX,t.clientY),r=n&&n.closest(`.cal-wg-half`);r&&!r.dataset.action&&Xn(r)},{passive:!0}),document.addEventListener(`touchend`,Zn),document.addEventListener(`dblclick`,e=>{let t=e.target.closest(`.cal-wg-day[data-date]`);if(!t||L!==`asv`||S.asv===`week`||t.classList.contains(`cal-wg-day-we`))return;let n=t.dataset.date;n&&(Z.mondayISO=w(sn(new Date(n+`T00:00:00`))),on(`asv`,`week`))}),document.addEventListener(`contextmenu`,e=>{let t=e.target.closest(`.cal-wg-half`);!t||t.dataset.action||j(t.dataset.person)&&(e.preventDefault(),G&&=(clearTimeout(G.longPressTimer),null),Qn(t,!0))}),document.addEventListener(`keydown`,e=>{let t=e.target.closest&&e.target.closest(`.cal-wg-half`);t&&(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t.dataset.action||j(t.dataset.person)&&qn(t))}),document.addEventListener(`click`,e=>{let t=e.target.closest(`.paint-tool`);if(t&&t.dataset.paint){Rr=t.dataset.paint,document.querySelectorAll(`.paint-tool`).forEach(e=>e.classList.toggle(`active`,e.dataset.paint===Rr));return}}),document.addEventListener(`click`,e=>{let t=Kn(e.target);if(!t)return;if(e.target.id===`cal-prev-${t}`)return vn(t,-1);if(e.target.id===`cal-next-${t}`)return vn(t,1);if(e.target.id===`cal-today-${t}`)return yn(t);if(e.target.id===`cal-clear-month-${t}`){Tn(t,x[t].navState.month);return}if(e.target.id===`cal-undo-${t}`)return ze();if(e.target.id===`cal-print-${t}`)return window.print();let n=e.target.closest(`[data-action="comment"]`);if(n){er(n.dataset.date,t);return}let r=e.target.closest(`[data-action="edit-day"]`);if(r){rr(r.dataset.date,t);return}let i=e.target.closest(`[data-action="overtime-day"]`);if(i){tr(i.dataset.date,x[t].people,t);return}})}function K(e){return Number.isInteger(e)?String(e):e.toFixed(1)}function q(e){let t=Math.abs(e),n=Math.floor(t),r=Math.round((t-n)*60);return`${n}h${String(r).padStart(2,`0`)}`}function ar(e){return e===0?`0h00`:`${e>0?`+`:`-`}${q(e)}`}function or(){let e=[],t=[b(),b()+1];return n.forEach(n=>{let r=null;t.forEach(t=>{for(let i=0;i<12;i++){let a=Ge(t,i);for(let o=1;o<=a;o++){let a=w(new Date(t,i,o));h.forEach(t=>{if(F(a,n.id,t)!==`absent`){r=null;return}let i=qt(a,n.id,t),o=zt(a,n.id,t)||`pending`,s=Vt(a,n.id,t);r&&r.label===i&&r.status===o&&r.comment===s?r.slots.push({iso:a,slot:t}):(r={personId:n.id,label:i,status:o,comment:s,slots:[{iso:a,slot:t}]},e.push(r))})}}})}),e}function sr(e){let t={pending:0,approved:1,rejected:2};return e.slice().sort((e,n)=>t[e.status]-t[n.status]||e.slots[0].iso.localeCompare(n.slots[0].iso))}function cr(){return or().filter(e=>e.status===`pending`).length}function lr(e,t,n){C(),e.slots.forEach(({iso:r,slot:i})=>{Bt(r,e.personId,i,t),Ht(r,e.personId,i,n||``)}),N()}function ur(e){let t={},n=r();n.forEach(e=>{t[e.id]={halfDaysByMonth:Array(12).fill(0),absentHalfDaysByMonth:Array(12).fill(0),saturdaysByMonth:Array(12).fill(0),overtimeHoursByMonth:Array(12).fill(0)}});for(let r=0;r<12;r++){let i=Ge(e,r);for(let a=1;a<=i;a++){let i=new Date(e,r,a);if(T(i))continue;let o=w(i),s=qe(i);n.forEach(e=>{let n=!1;h.forEach(i=>{let a=F(o,e.id,i);a===`present`?(t[e.id].halfDaysByMonth[r]++,n=!0):a===`absent`&&t[e.id].absentHalfDaysByMonth[r]++}),s&&n&&t[e.id].saturdaysByMonth[r]++,t[e.id].overtimeHoursByMonth[r]+=P(e.id)?Dr(o,e.id):Wt(o,e.id)})}}return n.forEach(e=>{let n=t[e.id];n.totalHalfDays=n.halfDaysByMonth.reduce((e,t)=>e+t,0),n.totalAbsentHalfDays=n.absentHalfDaysByMonth.reduce((e,t)=>e+t,0),n.totalSaturdays=n.saturdaysByMonth.reduce((e,t)=>e+t,0),n.totalOvertimeHours=Or(n.overtimeHoursByMonth.reduce((e,t)=>e+t,0));let r=0;n.halfDaysByMonth.forEach((e,t)=>{e>n.halfDaysByMonth[r]&&(r=t)}),n.busiestMonth=r}),t}function dr(e,t){let n=H(t),r=ur(e)[t],i=n?.timeFraction??1,a=Math.round(460*i),o=a/2,s=r.totalOvertimeHours/hr,c=Math.round((r.totalHalfDays+s)*10)/10,l=Math.round(c/2*10)/10,u=Math.min(100,a>0?Math.round(c/a*100):0),d=r.totalAbsentHalfDays/2;r.totalOvertimeHours;let f=r.totalOvertimeHours>0?`var(--color-success,#16A34A)`:r.totalOvertimeHours<0?`var(--color-danger,#DC2626)`:`var(--color-text-muted)`;return`
    <div class="card person-card" data-person="${t}" style="border-top-color:${n.color}">
      <div class="person-card-head">
        <div class="person-avatar" style="background:${n.color}">${n.initial}</div>
        <div><h3 style="font-size:16px;">${n.name}</h3><p class="text-muted" style="font-size:12px;">Bilan ${e}${i<1?` — ${Math.round(i*100)}%`:``}</p></div>
      </div>
      <div class="stat-row"><span class="stat-label">Jours travaillés (ajusté)</span><span class="stat-value">${K(l)} / ${K(o)}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${u}%;background:${n.color}"></div></div>
      <div class="stat-row"><span class="stat-label">Demi-journées de présence</span><span class="stat-value">${r.totalHalfDays}</span></div>
      ${r.totalOvertimeHours===0?``:`<div class="stat-row"><span class="stat-label">Heures supp. / en déficit</span><span class="stat-value" style="color:${f}">${ar(r.totalOvertimeHours)}</span></div>`}
      <div class="stat-row"><span class="stat-label">Samedis travaillés</span><span class="stat-value big" style="color:${n.color}">${r.totalSaturdays}</span></div>
      <div class="stat-row"><span class="stat-label">Jours de congés</span><span class="stat-value">${K(d)}</span></div>
      <div class="stat-row"><span class="stat-label">Mois le plus chargé</span><span class="stat-value">${v[r.busiestMonth]}</span></div>
    </div>
  `}function fr(e){let n=ur(e),r=n.david.halfDaysByMonth.map(e=>e/2),i=n.stephane.halfDaysByMonth.map(e=>e/2),a=Math.max(1,...r,...i),o=``;for(let e=0;e<12;e++){let n=e*30+6,s=r[e]/a*330,c=i[e]/a*330;o+=`
      <text x="0" y="${n+10+1}" font-size="11" font-weight="700" fill="#64748B" font-family="Inter,sans-serif">${Se[e]}</text>
      <rect x="56" y="${n}" width="${Math.max(s,1.5)}" height="10" rx="3" fill="${t[0].color}"></rect>
      <text x="${56+Math.max(s,1.5)+6}" y="${n+10-1}" font-size="10" font-weight="700" fill="${t[0].color}" font-family="Inter,sans-serif">${K(r[e])}</text>
      <rect x="56" y="${n+10+3}" width="${Math.max(c,1.5)}" height="10" rx="3" fill="${t[1].color}"></rect>
      <text x="${56+Math.max(c,1.5)+6}" y="${n+20+2}" font-size="10" font-weight="700" fill="${t[1].color}" font-family="Inter,sans-serif">${K(i[e])}</text>
    `}return`<svg viewBox="0 0 470 366" width="100%" height="366" role="img" aria-label="Comparaison des jours travaillés par mois, ${e}">${o}</svg>`}function pr(e){let t=ur(e),n=0,r=0,i=0,a=0,o=``;for(let e=0;e<12;e++){let s=t.david.halfDaysByMonth[e]/2,c=t.stephane.halfDaysByMonth[e]/2,l=t.david.saturdaysByMonth[e],u=t.stephane.saturdaysByMonth[e];n+=s,r+=c,i+=l,a+=u;let d=s-c,f=d>0?`ecart-david`:d<0?`ecart-stephane`:`ecart-equilibre`,p=d===0?`Équilibre`:`+${K(Math.abs(d))} ${d>0?`David`:`Stéphane`}`;o+=`<tr><td>${v[e]}</td><td>${K(s)}</td><td>${K(c)}</td><td>${l}</td><td>${u}</td><td class="${f}">${p}</td></tr>`}let s=n-r,c=s>0?`ecart-david`:s<0?`ecart-stephane`:`ecart-equilibre`,l=s===0?`Équilibre`:`+${K(Math.abs(s))} ${s>0?`David`:`Stéphane`}`;return`
    <div class="recap-table-scroll">
    <table class="recap-table">
      <thead><tr><th>Mois</th><th>David (j)</th><th>Stéphane (j)</th><th>Samedis David</th><th>Samedis Stéphane</th><th>Écart</th></tr></thead>
      <tbody>${o}</tbody>
      <tfoot><tr><td>Total</td><td>${K(n)}</td><td>${K(r)}</td><td>${i}</td><td>${a}</td><td class="${c}">${l}</td></tr></tfoot>
    </table>
    </div>
  `}var mr=1607,hr=3.5,gr=42,_r=7.25,vr={mStart:`08:30`,mEnd:`13:00`,amStart:`15:00`,amEnd:`20:00`};function yr(e,t,n){return`${e}_${t}_te_${n}`}function J(e,t,n){return M.slots[yr(e,t,n)]||``}function br(e,t,n,r){r?M.slots[yr(e,t,n)]=r:delete M.slots[yr(e,t,n)]}function Y(e){if(!e)return 0;let[t,n]=e.split(`:`).map(Number);return t*60+(n||0)}function xr(e){return e/60}function Sr(e,t){if(!e||!t)return 0;let n=Y(t)-Y(e);return n>0?xr(n):0}function Cr(e,t){return Sr(J(e,t,`ms`),J(e,t,`me`))+Sr(J(e,t,`as`),J(e,t,`ae`))}function wr(e,t){return!!(J(e,t,`ms`)||J(e,t,`me`)||J(e,t,`as`)||J(e,t,`ae`))}function Tr(e,t){return Sr(J(e,t,`ls`),J(e,t,`le`))}function Er(e,t){return!!(J(e,t,`ls`)||J(e,t,`le`))}function Dr(e,t){let n=Cr(e,t)+Tr(e,t),r=7*zr(t);return n>0?n-r:0}function Or(e){return Math.round(e*4)/4}function kr(e,t){return`${e}_${t}_day_note`}function Ar(e,t){return M.slots[kr(e,t)]||``}function jr(e,t,n){n?M.slots[kr(e,t)]=n:delete M.slots[kr(e,t)]}function Mr(e,t){if(!P(t))return;let n=!!(J(e,t,`ms`)||J(e,t,`me`)),r=!!(J(e,t,`as`)||J(e,t,`ae`));n&&F(e,t,`M`)!==`absent`&&(M.slots[Pt(e,t,`M`)]=`present`),!n&&F(e,t,`M`)===`present`&&delete M.slots[Pt(e,t,`M`)],r&&F(e,t,`AM`)!==`absent`&&(M.slots[Pt(e,t,`AM`)]=`present`),!r&&F(e,t,`AM`)===`present`&&delete M.slots[Pt(e,t,`AM`)];let i=Dr(e,t),a=Ut(e,t);i===0?M.slots[a]&&M.slots[a]===Wt(e,t)&&delete M.slots[a]:M.slots[a]=i}function Nr(e,t,n,r){let i=Y(e||n)+t,a=Math.max(Y(n),Math.min(Y(r),i)),o=Math.floor(a/60),s=a%60;return`${String(o).padStart(2,`0`)}:${String(s).padStart(2,`0`)}`}var Pr={morning:{s:`ms`,e:`me`,pS:vr.mStart,pE:vr.mEnd,cls:``},lunch:{s:`ls`,e:`le`,pS:`13:00`,pE:`15:00`,cls:` week-worked-lunch`},afternoon:{s:`as`,e:`ae`,pS:vr.amStart,pE:vr.amEnd,cls:``}};function Fr(e){return Math.round(e/15)*15}function Ir(e){let t=Math.floor(e/60),n=e%60;return`${String(t).padStart(2,`0`)}:${String(n).padStart(2,`0`)}`}function Lr(e,t,n){return Fr(Y(t)+e*(Y(n)-Y(t)))}var X=null,Rr=`present`,Z={mondayISO:null,personId:null};function zr(e){return H(e)?.timeFraction??1}function Br(e){let t=H(e),n=zr(e);return t?.saturdayOnly?{annual:null,weekly:_r,monthly:Math.round(_r*52/12*10)/10}:{annual:Math.round(mr*n*10)/10,weekly:Math.round(35*n*100)/100,monthly:Math.round(mr*n/12*10)/10}}function Vr(e,t,n=null){let r=n===null?Array.from({length:12},(e,t)=>t):[n],i=0,a=[`repos planifié`,`repos`,`non travaillé`];for(let n of r){let r=Ge(t,n);for(let o=1;o<=r;o++){let r=new Date(t,n,o);if(r.getDay()===0)continue;let s=w(r);if(wr(s,e))i+=Cr(s,e)+Tr(s,e);else for(let t of[`M`,`AM`]){if(F(s,e,t)!==`present`)continue;let n=qt(s,e,t).toLowerCase().trim();a.includes(n)||(i+=hr)}i+=Wt(s,e)}}return Math.round(i*10)/10}function Hr(e){let t=``;for(let r=0;r<12;r++){let i=n.map(t=>{let n=Ct(t.id,e,r);if(!n)return`<td class="text-muted">—</td>`;let i=new Date(n.signedAt).toLocaleDateString(`fr-FR`,{day:`numeric`,month:`short`});return`<td>
        <span class="signed-pill">
          ✅ ${V(n.signedName)} <span class="signed-pill-date">(${i})</span>
          <button type="button" class="asv-remove-btn" data-revoke-signature="${t.id}|${e}|${r}" title="Annuler cette signature" aria-label="Annuler cette signature">✕</button>
        </span>
      </td>`});t+=`<tr><td>${v[r]}</td>${i.join(``)}</tr>`}return`
    <table class="recap-table">
      <thead><tr><th>Mois</th>${n.map(e=>`<th>${e.short}</th>`).join(``)}</tr></thead>
      <tbody>${t}</tbody>
    </table>
  `}var Q={tab:`stats`};function Ur(){let e=document.getElementById(`view-dashboard`),t=cr();e.innerHTML=`
    <h2 class="section-title">Tableau de bord</h2>
    <p class="section-desc">Statistiques de présence et demandes de congé ASV.</p>
    <div class="sub-nav-row">
      <div class="sub-nav" id="dash-sub-nav">
        <button class="sub-tab ${Q.tab===`stats`?`active`:``}" data-sub="stats">🩺 Suivi vétérinaires</button>
        <button class="sub-tab ${Q.tab===`hours`?`active`:``}" data-sub="hours">🐾 Suivi ASV</button>
        <button class="sub-tab ${Q.tab===`requests`?`active`:``}" data-sub="requests">📋 Demandes de congé et de modification${t>0?` <span class="nav-badge">${t}</span>`:``}</button>
        <button class="sub-tab ${Q.tab===`signatures`?`active`:``}" data-sub="signatures">✍️ Feuilles signées</button>
        <button class="sub-tab ${Q.tab===`interviews`?`active`:``}" data-sub="interviews">📝 Entretiens annuels</button>
      </div>
    </div>
    <div id="dash-sub-stats" class="sub-page ${Q.tab===`stats`?``:`hidden`}"></div>
    <div id="dash-sub-hours" class="sub-page ${Q.tab===`hours`?``:`hidden`}"></div>
    <div id="dash-sub-requests" class="sub-page ${Q.tab===`requests`?``:`hidden`}"></div>
    <div id="dash-sub-signatures" class="sub-page ${Q.tab===`signatures`?``:`hidden`}"></div>
    <div id="dash-sub-interviews" class="sub-page ${Q.tab===`interviews`?``:`hidden`}"></div>
  `,e.querySelector(`#dash-sub-nav`).addEventListener(`click`,e=>{let t=e.target.closest(`.sub-tab`);t&&(Q.tab=t.dataset.sub,Ur(),fn())}),Q.tab===`medical`&&(Q.tab=`stats`),Q.tab===`stats`?Wr():Q.tab===`hours`?Qr():Q.tab===`signatures`?Gr():Q.tab===`interviews`?Kr():$r()}rn.dashboard=Ur;function Wr(){let e=document.getElementById(`dash-sub-stats`),n=je.year,r=b();e.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:0;">
      <div class="year-toggle" id="dash-year-toggle">
        <button data-year="${r}" class="${n===r?`active`:``}">${r}</button>
        <button data-year="${r+1}" class="${n===r+1?`active`:``}">${r+1}</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm btn-danger" id="dash-reset-current" title="Supprimer toutes les données ${r}">🗑️ Réinitialiser ${r}</button>
        <button class="btn btn-sm btn-danger" id="dash-reset-forecast" title="Supprimer toutes les données ${r+1}">🗑️ Réinitialiser ${r+1}</button>
      </div>
    </div>
    <div class="dash-grid" style="margin-top:18px;">
      ${t.map(e=>dr(n,e.id)).join(``)}
    </div>
    <div class="card" style="margin-bottom:24px;">
      <h3 style="font-size:16px;margin-bottom:4px;">Comparaison mensuelle — David vs Stéphane</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Jours travaillés par mois, ${n}</p>
      <div class="chart-legend">
        ${t.map(e=>`<span><span class="legend-swatch" style="background:${e.color};width:11px;height:11px;display:inline-block;border-radius:3px;"></span>${e.short}</span>`).join(``)}
      </div>
      <div class="chart-wrap">${fr(n)}</div>
    </div>
    <div class="card" style="margin-bottom:24px;">
      <h3 style="font-size:16px;margin-bottom:2px;">Récapitulatif mensuel ${n}</h3>
      <p class="text-muted" style="font-size:11.5px;margin-bottom:10px;">Écart = nombre de jours travaillés en plus, pour le vétérinaire concerné</p>
      ${pr(n)}
    </div>
    <div id="dash-vets-cp"></div>
  `,e.querySelector(`#dash-year-toggle`).addEventListener(`click`,e=>{let t=e.target.closest(`button`);t&&(je.year=parseInt(t.dataset.year,10),Wr())}),e.querySelector(`#dash-reset-current`).onclick=()=>nn(r,!1),e.querySelector(`#dash-reset-forecast`).onclick=()=>nn(r+1,!0),ri(`vets`,`dash-vets-cp`)}function Gr(){let e=document.getElementById(`dash-sub-signatures`),t=je.year,n=b();e.innerHTML=`
    <div class="year-toggle" id="dash-sig-year-toggle">
      <button data-year="${n}" class="${t===n?`active`:``}">${n}</button>
      <button data-year="${n+1}" class="${t===n+1?`active`:``}">${n+1}</button>
    </div>
    <div class="card" style="margin-top:18px;">
      <h3 style="font-size:16px;margin-bottom:4px;">Feuilles de présence signées ${t}</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Suivi des signatures électroniques mensuelles des ASV.</p>
      ${Hr(t)}
    </div>
  `,e.querySelectorAll(`[data-revoke-signature]`).forEach(e=>{e.onclick=async()=>{let[t,n,r]=e.dataset.revokeSignature.split(`|`);$t({title:`Annuler cette signature ?`,message:`Le mois redeviendra modifiable pour ${H(t).short}.`,confirmLabel:`Annuler la signature`,onConfirm:async()=>{await Tt(t,parseInt(n,10),parseInt(r,10)),Gr(),I(`Signature annulée`,`🔓`)}})}}),e.querySelector(`#dash-sig-year-toggle`).addEventListener(`click`,e=>{let t=e.target.closest(`button`);t&&(je.year=parseInt(t.dataset.year,10),Gr())})}function Kr(){let e=document.getElementById(`dash-sub-interviews`),t=je.year,r=b();function i(e){return yt.find(n=>n.person_id===e&&n.year===t)}function a(e){if(!e)return``;let[t,n,r]=e.split(`-`);return`${r}/${n}/${t}`}function o(e){return!e||e.status===`pending`?`<span style="color:#DC2626;font-weight:700;font-size:12px;">🔴 À planifier</span>`:e.status===`scheduled`?`<span style="color:#D97706;font-weight:700;font-size:12px;">🟡 Planifié${e.scheduled_date?` — ${a(e.scheduled_date)}`:``}</span>`:`<span style="color:#16A34A;font-weight:700;font-size:12px;">🟢 Réalisé${e.done_date?` — ${a(e.done_date)}`:``}</span>`}function s(e){return e?`<span style="color:#F59E0B;font-size:14px;">${`★`.repeat(e)}${`☆`.repeat(5-e)}</span>`:``}let c=n.length?n.map(e=>{let t=i(e.id),n=!t||t.status===`pending`,r=t?.interviewer_id?H(t.interviewer_id)?.short||t.interviewer_id:null;return`
      <div class="card" style="border-top:4px solid ${e.color};padding:18px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${e.color};display:inline-block;flex-shrink:0;"></span>
          <span style="font-weight:700;font-size:15px;">${V(e.short)}</span>
        </div>
        <div style="margin-bottom:8px;">${o(t)}</div>
        ${r?`<p class="text-muted" style="font-size:12px;margin-bottom:4px;">Responsable : ${V(r)}</p>`:``}
        ${t?.rating?`<div style="margin-bottom:8px;">${s(t.rating)}</div>`:``}
        <button class="btn btn-sm ${n?`btn-primary`:``}" data-itv-open="${e.id}"
          style="${n?``:`border:1px solid var(--color-border);`}margin-top:10px;width:100%;justify-content:center;">
          ${n?`➕ Planifier`:`✏️ Voir / Modifier`}
        </button>
      </div>`}).join(``):`<p class="text-muted">Aucune ASV dans le planning.</p>`;e.innerHTML=`
    <div class="year-toggle" id="dash-itv-year-toggle" style="margin-bottom:20px;">
      <button data-year="${r}" class="${t===r?`active`:``}">${r}</button>
      <button data-year="${r+1}" class="${t===r+1?`active`:``}">${r+1}</button>
    </div>
    <div class="dash-grid" style="--dash-cols:${Math.max(n.length,1)};">${c}</div>
  `,e.querySelector(`#dash-itv-year-toggle`).addEventListener(`click`,e=>{let t=e.target.closest(`button`);t&&(je.year=parseInt(t.dataset.year,10),Kr())}),e.querySelectorAll(`[data-itv-open]`).forEach(e=>{e.onclick=()=>qr(e.dataset.itvOpen,t)})}function qr(e,n){let r=H(e),i=yt.find(t=>t.person_id===e&&t.year===n)||{},a=i.id||null,o=document.getElementById(`modal-backdrop`),s=document.getElementById(`modal-box`);s.className=`modal-box modal-box-wide`;let c=[{v:`pending`,l:`🔴 À planifier`},{v:`scheduled`,l:`🟡 Planifié`},{v:`done`,l:`🟢 Réalisé`}],l=i.status||`pending`,u=i.rating||0;function d(e){return[1,2,3,4,5].map(t=>`<span data-star="${t}" style="font-size:26px;cursor:pointer;color:${e>=t?`#F59E0B`:`#CBD5E1`};">★</span>`).join(``)}s.innerHTML=`
    <h3 style="margin-bottom:14px;">Entretien annuel ${n} — ${V(r?.short||e)}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
      <div>
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Statut</label>
        <select id="itv-status" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;">
          ${c.map(e=>`<option value="${e.v}" ${l===e.v?`selected`:``}>${e.l}</option>`).join(``)}
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Vétérinaire responsable</label>
        <select id="itv-interviewer" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;">
          <option value="">—</option>
          ${t.map(e=>`<option value="${e.id}" ${i.interviewer_id===e.id?`selected`:``}>${V(e.short)}</option>`).join(``)}
        </select>
      </div>
      <div id="itv-scheduled-wrap" style="display:${l===`pending`?`none`:`block`};">
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Date prévue</label>
        <input type="date" id="itv-scheduled-date" value="${i.scheduled_date||``}"
          style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;box-sizing:border-box;">
      </div>
      <div id="itv-done-wrap" style="display:${l===`done`?`block`:`none`};">
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Date de réalisation</label>
        <input type="date" id="itv-done-date" value="${i.done_date||``}"
          style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;box-sizing:border-box;">
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:6px;">Note globale</label>
      <div id="itv-rating-wrap" style="display:flex;gap:4px;">${d(u)}</div>
      <input type="hidden" id="itv-rating-val" value="${u}">
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Bilan objectifs N-1</label>
      <textarea id="itv-obj-prev" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${V(i.objectives_prev||``)}</textarea>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Objectifs N+1</label>
      <textarea id="itv-obj-next" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${V(i.objectives_next||``)}</textarea>
    </div>
    <div style="margin-bottom:18px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Commentaires libres</label>
      <textarea id="itv-comments" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${V(i.comments||``)}</textarea>
    </div>
    <p id="itv-error" style="color:#B91C1C;font-size:12px;display:none;margin:0 0 8px;"></p>
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Fermer</button>
      <button class="btn btn-primary" id="itv-save-btn">Enregistrer</button>
    </div>
  `,o.classList.add(`open`);let f=()=>o.classList.remove(`open`);s.querySelector(`#modal-cancel`).onclick=f,o.onclick=e=>{e.target===o&&f()};let p=s.querySelector(`#itv-status`);function m(){let e=p.value;s.querySelector(`#itv-scheduled-wrap`).style.display=e===`pending`?`none`:`block`,s.querySelector(`#itv-done-wrap`).style.display=e===`done`?`block`:`none`}p.addEventListener(`change`,m);let h=u;s.querySelector(`#itv-rating-wrap`).addEventListener(`click`,e=>{let t=e.target.closest(`[data-star]`);t&&(h=parseInt(t.dataset.star),h===parseInt(s.querySelector(`#itv-rating-val`).value)&&(h=0),s.querySelector(`#itv-rating-val`).value=h,s.querySelectorAll(`[data-star]`).forEach((e,t)=>{e.style.color=h>=t+1?`#F59E0B`:`#CBD5E1`}))}),s.querySelector(`#itv-save-btn`).onclick=async()=>{let t={person_id:e,year:n,status:s.querySelector(`#itv-status`).value,scheduled_date:s.querySelector(`#itv-scheduled-date`).value||null,done_date:s.querySelector(`#itv-done-date`).value||null,interviewer_id:s.querySelector(`#itv-interviewer`).value||null,objectives_prev:s.querySelector(`#itv-obj-prev`).value.trim()||null,objectives_next:s.querySelector(`#itv-obj-next`).value.trim()||null,comments:s.querySelector(`#itv-comments`).value.trim()||null,rating:parseInt(s.querySelector(`#itv-rating-val`).value)||null,updated_at:new Date().toISOString()},r=s.querySelector(`#itv-error`);r.style.display=`none`,s.querySelector(`#itv-save-btn`).disabled=!0;try{let r;if(r=a?await fetch(`${E}annual_interviews?id=eq.${a}`,{method:`PATCH`,headers:A({"Content-Type":`application/json`,Prefer:`return=minimal`}),body:JSON.stringify(t)}):await fetch(`${E}annual_interviews`,{method:`POST`,headers:A({"Content-Type":`application/json`,Prefer:`return=minimal`}),body:JSON.stringify(t)}),!r.ok){let e=await r.json().catch(()=>({}));throw Error(e.message||`HTTP ${r.status}`)}await Et(),f(),Kr(),I(`Entretien enregistré`,`✅`),t.scheduled_date&&typeof $==`function`&&$({type:`interview`,title:`Entretien annuel planifié`,body:`Votre entretien annuel ${n} est prévu le ${W(t.scheduled_date)}.`,targetUsers:[e],data:{type:`interview`}})}catch(e){r.textContent=`Erreur : `+e.message,r.style.display=`block`,s.querySelector(`#itv-save-btn`).disabled=!1}}}function Jr(e){let t=b(),r=y.getMonth(),i=n.filter(e=>!e.archived&&!e.saturdayOnly),a=n.filter(e=>!e.archived&&e.saturdayOnly);return`<div class="card" style="margin-bottom:18px;">
    <div style="margin-bottom:16px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">📅 Modulation annuelle — ${e}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Cible : <strong>1 607h</strong> (plein temps) · 5 semaines CP comprises · Plafond : <strong>42h / semaine</strong></p>
    </div>
    ${i.map(n=>{let i=Br(n.id),a=Vr(n.id,e,null),o=i.annual,s=o?Math.min(100,Math.round(a/o*100)):0,c=s>100?`#DC2626`:s>=90?`#F59E0B`:n.color,l=s>100?`🔴`:s>=90?`🟡`:`🟢`,u=n.timeFraction>=1?`plein temps`:`${Math.round(n.timeFraction*100)}% temps partiel`,d=``;if(e===t&&r>0&&a>0&&o){let e=Math.round(a/r*12),t=e-o;d=`<div style="display:flex;justify-content:flex-end;margin-top:3px;"><span style="font-size:11px;color:${Math.abs(t)<20?`#16A34A`:t>0?`#F59E0B`:`#EA580C`};">proj. fin d'année : ${K(e)}h (${t>=0?`+`:``}${K(t)}h vs cible)</span></div>`}let f=a>o&&o>0?`<div style="margin-top:5px;padding:5px 8px;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;font-size:11px;color:#DC2626;display:flex;align-items:center;gap:6px;">
          <span style="flex-shrink:0;">⚠️</span><span>Heures dépassant la modulation — à régulariser sur le bulletin de <strong>décembre / janvier</strong></span>
        </div>`:``;return`<div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="width:8px;height:8px;border-radius:2px;background:${n.color};display:inline-block;flex-shrink:0;"></span>
        <span style="font-weight:700;font-size:14px;">${V(n.short)}</span>
        <span style="font-size:11px;color:var(--color-text-muted);">${u}</span>
        <span style="margin-left:auto;font-size:13px;">${l} <strong>${K(a)}h</strong><span style="color:var(--color-text-muted);"> / ${K(o)}h</span></span>
        <span style="font-size:14px;font-weight:700;color:${c};min-width:38px;text-align:right;">${s}%</span>
      </div>
      <div style="background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${s}%;background:${c};height:100%;border-radius:99px;"></div>
      </div>
      ${d}${f}
    </div>`}).join(``)}${a.map(t=>{let n=Vr(t.id,e,null),r=0;for(let n=0;n<12;n++){let i=Ge(e,n);for(let a=1;a<=i;a++){let i=new Date(e,n,a);if(i.getDay()!==6)continue;let o=w(i);(F(o,t.id,`M`)===`present`||F(o,t.id,`AM`)===`present`)&&r++}}return`<div style="display:flex;align-items:center;gap:10px;padding-top:14px;margin-top:4px;border-top:1px solid var(--color-border);">
      <span style="width:8px;height:8px;border-radius:2px;background:${t.color};display:inline-block;flex-shrink:0;"></span>
      <span style="font-weight:700;font-size:14px;">${V(t.short)}</span>
      <span style="font-size:11px;color:var(--color-text-muted);">— samedi uniquement</span>
      <span style="margin-left:auto;font-size:13px;"><strong>${r} samedis</strong><span style="color:var(--color-text-muted);"> · ${K(n)}h</span></span>
      <span style="font-size:11px;background:#EFF6FF;color:#1D4ED8;border-radius:4px;padding:2px 8px;white-space:nowrap;flex-shrink:0;">Hors modulation</span>
    </div>`}).join(``)}
  </div>`}function Yr(){let e=Z.mondayISO?new Date(Z.mondayISO+`T00:00:00`):sn(y),t=new Date(e);t.setDate(t.getDate()+5);let r=e=>`${e.getDate()}/${e.getMonth()+1}`,i=n.filter(e=>!e.archived),a=!1,o=i.map(t=>{let n=0;for(let r=0;r<6;r++){let i=new Date(e);if(i.setDate(i.getDate()+r),T(i))continue;let a=w(i);wr(a,t.id)?n+=Cr(a,t.id)+Tr(a,t.id):(F(a,t.id,`M`)===`present`&&(n+=hr),F(a,t.id,`AM`)===`present`&&(n+=hr)),n+=Wt(a,t.id)}n=Math.round(n*100)/100;let r=gr,i=!t.saturdayOnly&&n>=r,o=!t.saturdayOnly&&n>=r*.85&&!i;i&&(a=!0);let s=i?`#DC2626`:o?`#F59E0B`:t.color,c=t.saturdayOnly?Math.min(100,Math.round(n/_r*100)):Math.min(100,Math.round(n/r*100)),l=n>0?q(n):`—`,u=t.saturdayOnly?`<span style="font-size:11px;color:var(--color-text-muted);"> (samedi)</span>`:`<span style="font-size:11px;color:var(--color-text-muted);"> / ${r}h</span>${i?` ⚠️`:``}`;return`<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;">
      <span style="width:8px;height:8px;border-radius:2px;background:${t.color};display:inline-block;flex-shrink:0;margin-top:1px;"></span>
      <span style="font-size:13px;font-weight:600;min-width:75px;">${V(t.short)}</span>
      <div style="flex:1;background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${c}%;background:${s};height:100%;border-radius:99px;"></div>
      </div>
      <span style="font-size:13px;font-weight:${i?`700`:`400`};color:${i?`#DC2626`:o?`#F59E0B`:`inherit`};min-width:100px;text-align:right;">${l}${u}</span>
    </div>`}).join(``);return`<div class="card" style="margin-bottom:18px;${a?`border-left:3px solid #DC2626;`:``}">
    <div style="margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">⏱ Semaine du ${r(e)} au ${r(t)}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Plafond légal : <strong>42h</strong> / semaine (art. L3122-4 CT)</p>
    </div>
    ${a?`<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:8px 12px;margin-bottom:14px;color:#DC2626;font-size:13px;font-weight:600;">⚠️ Plafond de 42h atteint cette semaine</div>`:``}
    ${o}
  </div>`}function Xr(e){let t=n.filter(e=>!e.archived&&!e.saturdayOnly);if(!t.length)return``;let r=Object.fromEntries(t.map(e=>[e.id,0]));for(let n=0;n<12;n++){let i=Ge(e,n);for(let a=1;a<=i;a++){let i=new Date(e,n,a);if(i.getDay()!==6)continue;let o=w(i);t.forEach(e=>{(F(o,e.id,`M`)===`present`||F(o,e.id,`AM`)===`present`)&&r[e.id]++})}}let i=t.map(e=>r[e.id]),a=i.length?Math.round(i.reduce((e,t)=>e+t,0)/i.length*10)/10:0,o=Math.max(...i,1);return`<div class="card" style="margin-bottom:18px;">
    <div style="margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">🗓 Équité des samedis — ${e}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Répartition des samedis entre Marie, Johanna et Julie · Moy. : <strong>${a} samedis</strong></p>
    </div>
    ${t.map(e=>{let t=r[e.id],n=Math.round((t-a)*10)/10,i=Math.abs(n)<.6?`équilibre ✅`:`${n>0?`+`:``}${n} vs moy.${Math.abs(n)>2?` ⚠️`:``}`,s=Math.abs(n)<=1?`#16A34A`:`#EA580C`,c=Math.round(t/o*100);return`<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;">
      <span style="width:8px;height:8px;border-radius:2px;background:${e.color};display:inline-block;flex-shrink:0;"></span>
      <span style="font-size:13px;font-weight:600;min-width:75px;">${V(e.short)}</span>
      <div style="flex:1;background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${c}%;background:${e.color};height:100%;border-radius:99px;"></div>
      </div>
      <span style="font-size:14px;font-weight:700;min-width:30px;text-align:right;">${t}</span>
      <span style="font-size:12px;color:${s};min-width:120px;">${i}</span>
    </div>`}).join(``)}
  </div>`}function Zr(e){let t=b(),r=y.getMonth(),i=n.filter(e=>!e.archived&&!e.saturdayOnly);if(!i.length)return``;let a=i.map(e=>`<th style="text-align:right;padding:6px 10px;">${V(e.short)}<br><span style="font-weight:400;font-size:10px;color:var(--color-text-muted);">quota ${K(Br(e.id).monthly)}h/m</span></th>`).join(``),o=``;for(let n=0;n<12;n++){let a=e===t&&n>r,s=e===t&&n===r,c=i.map(t=>{if(a)return`<td style="padding:5px 10px;text-align:right;color:var(--color-text-muted);">—</td>`;let r=Br(t.id),i=Vr(t.id,e,n),o=r.monthly>0?i/r.monthly:0;return`<td style="padding:5px 10px;text-align:right;font-size:13px;">${o>1.05?`🔴`:o>=.9?`🟢`:i>0?`🟡`:``} <strong>${K(i)}</strong><span style="color:var(--color-text-muted);font-size:11px;">h</span></td>`}).join(``);o+=`<tr style="${s?`background:#f0fdf4;font-weight:700;`:``}">
      <td style="padding:5px 10px;font-size:13px;color:${s?`var(--color-primary)`:`inherit`};">${v[n]}${s?` ←`:``}</td>
      ${c}
    </tr>`}let s=i.map(t=>{let n=Br(t.id),r=Vr(t.id,e,null),i=n.annual>0?Math.round(r/n.annual*100):0;return`<td style="padding:8px 10px;text-align:right;font-weight:700;border-top:2px solid var(--color-border);"><span style="color:${i>100?`#DC2626`:i>=90?`#F59E0B`:`#16A34A`};">${K(r)}h</span><span style="font-size:11px;color:var(--color-text-muted);"> / ${K(n.annual)}h (${i}%)</span></td>`}).join(``);return`<div class="card" style="margin-bottom:18px;">
    <div style="margin-bottom:10px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">📊 Heures mensuelles — ${e}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">🟢 Quota atteint · 🟡 &lt; 90% du quota · 🔴 Dépassement</p>
    </div>
    <div style="overflow-x:auto;">
      <table class="recap-table" style="min-width:320px;width:100%;">
        <thead><tr><th style="text-align:left;">Mois</th>${a}</tr></thead>
        <tbody>${o}</tbody>
        <tfoot><tr><td style="font-weight:800;padding:8px 10px;">Total ${e}</td>${s}</tr></tfoot>
      </table>
    </div>
  </div>`}function Qr(){let e=document.getElementById(`dash-sub-hours`),t=je.year,n=b();Z.mondayISO||=w(sn(y)),e.innerHTML=`
    <div class="year-toggle" id="dash-hours-year-toggle" style="margin-bottom:16px;">
      <button data-year="${n}" class="${t===n?`active`:``}">${n}</button>
      <button data-year="${n+1}" class="${t===n+1?`active`:``}">${n+1}</button>
    </div>
    ${Jr(t)}
    ${t===n?Yr():``}
    ${Xr(t)}
    ${Zr(t)}
    <div id="dash-asv-cp"></div>
  `,e.querySelector(`#dash-hours-year-toggle`).addEventListener(`click`,e=>{let t=e.target.closest(`button`);t&&(je.year=parseInt(t.dataset.year,10),Qr())}),ri(`asv`,`dash-asv-cp`)}function $r(){let e=document.getElementById(`dash-sub-requests`),t=sr(or()),n={pending:`En attente`,approved:`Approuvée`,rejected:`Refusée`},r={pending:`leave-pending`,approved:`leave-approved`,rejected:`leave-rejected`},i=t.map((e,t)=>{let i=H(e.personId),a=e.slots[0],o=e.slots[e.slots.length-1],s=a.iso===o.iso?`${W(a.iso)} (${g[a.slot]})`:`du ${W(a.iso)} au ${W(o.iso)}`,c=e.status===`pending`?`
      <div class="flex gap-2" style="margin-top:8px;">
        <button class="btn btn-sm btn-primary" data-approve="${t}">✓ Approuver</button>
        <button class="btn btn-sm btn-danger" data-reject="${t}">✕ Refuser</button>
      </div>
      <div class="hidden" data-reject-form="${t}" style="margin-top:8px;">
        <textarea data-reject-comment="${t}" rows="2" placeholder="Motif du refus (obligatoire, visible par l'équipe)"></textarea>
        <div class="flex gap-2" style="margin-top:6px;">
          <button class="btn btn-sm btn-danger" data-reject-confirm="${t}">Confirmer le refus</button>
          <button class="btn btn-sm" data-reject-cancel="${t}">Annuler</button>
        </div>
      </div>
    `:e.comment?`<p class="text-muted" style="font-size:12.5px;margin-top:6px;">💬 ${V(e.comment)}</p>`:``;return`
      <div class="card" data-leave-group="${t}" style="margin-bottom:12px;border-left:4px solid ${i.color};">
        <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <strong style="color:${i.color};">${i.short}</strong> — ${s}
            ${e.label?`<span class="text-muted"> · ${V(e.label)}</span>`:``}
            <p class="text-muted" style="font-size:12px;margin-top:2px;">${e.slots.length} demi-journée${e.slots.length>1?`s`:``}</p>
          </div>
          <span class="leave-status-badge ${r[e.status]}">${n[e.status]}</span>
        </div>
        ${c}
      </div>
    `}).join(``);e.innerHTML=`
    <p class="section-desc" style="margin-bottom:14px;">Toutes les demandes de congé soumises par les ASV, sur ${b()} et ${b()+1}.</p>
    ${t.length?i:`<p class="text-muted">Aucune demande de congé pour le moment.</p>`}
  `,e.querySelectorAll(`[data-approve]`).forEach(e=>{e.addEventListener(`click`,()=>{let n=t[parseInt(e.dataset.approve,10)];lr(n,`approved`,``),typeof $==`function`&&$({type:`leave_approved`,title:`Demande de congé approuvée`,body:`Votre demande du ${W(n.slots[0].iso)} a été approuvée.`,targetUsers:[n.personId],data:{type:`leave_approved`}}),Ur(),I(`Demande approuvée`,`✓`)})}),e.querySelectorAll(`[data-reject]`).forEach(t=>{t.addEventListener(`click`,()=>{e.querySelector(`[data-reject-form="${t.dataset.reject}"]`).classList.remove(`hidden`)})}),e.querySelectorAll(`[data-reject-cancel]`).forEach(t=>{t.addEventListener(`click`,()=>{e.querySelector(`[data-reject-form="${t.dataset.rejectCancel}"]`).classList.add(`hidden`)})}),e.querySelectorAll(`[data-reject-confirm]`).forEach(n=>{n.addEventListener(`click`,()=>{let r=n.dataset.rejectConfirm,i=e.querySelector(`[data-reject-comment="${r}"]`).value.trim();if(!i){I(`Un commentaire est nécessaire pour refuser`,`⚠️`);return}let a=t[parseInt(r,10)];lr(a,`rejected`,i),typeof $==`function`&&$({type:`leave_rejected`,title:`Demande de congé refusée`,body:`Votre demande du ${W(a.slots[0].iso)} a été refusée — ${i}`,targetUsers:[a.personId],data:{type:`leave_rejected`}}),Ur(),I(`Demande refusée`,`✕`)})})}function ei(e,t,n){let r=0,i=P(e),a=/cp|cong[eé]/i;for(let o of Object.keys(M.slots)){let s=o.match(/^(\d{4}-\d{2}-\d{2})_(.+)_(M|AM)$/);if(!s)continue;let[,c,l]=s;if(l===e&&!(c<t||c>n)&&M.slots[o]===`absent`){if(i){let e=M.slots[o.replace(/_(M|AM)$/,`_$1_label`)]||``;if(!a.test(e))continue}r++}}return Math.round(r/2*100)/100}function ti(e){let t=e;return{start:`${t}-01-01`,end:`${t}-12-31`,label:`1 janv. ${t} → 31 déc. ${t}`}}function ni(e,t){let{start:n,end:r}=ti(t),a=w(y),o=a<r?a:r,s=new Date(n+`T00:00:00`),c=new Date(o+`T00:00:00`);if(c<s)return 0;let l=(c.getFullYear()-s.getFullYear())*12+(c.getMonth()-s.getMonth());return c.getDate()>=1&&l++,l=Math.max(0,Math.min(l,12)),Math.round(l*i*(e.timeFraction??1)*100)/100}function ri(e,r){let a=document.getElementById(r||`${e}-sub-conges`);if(!a)return;let o=O?.role===`admin`,s=b();ri._year||={};let c=typeof ri._year[e]==`number`?ri._year[e]:s;a.innerHTML=`<div style="text-align:center;padding:40px;color:var(--color-muted);">Chargement…</div>`,(async()=>{let s=[];try{let e=await fetch(`${E}cp_adjustments?year=eq.${c}&select=*`,{headers:A()});e.ok&&(s=await e.json())}catch(e){console.warn(`cp_adjustments inaccessibles`,e)}let l={};s.forEach(e=>{l[e.person_id]=e});let u=(e===`vets`?t:n).filter(e=>!e.archived),{label:d,start:f,end:p}=ti(c);function m(e){return e>=10?`#16A34A`:e>=5?`#CA8A04`:`#DC2626`}function h(e){return`<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${e};margin-right:4px;vertical-align:middle;"></span>`}let g=u.map(t=>{let n=l[t.id]||{carried_over:0,extra_days:0,extra_note:``},r=ni(t,c),i=ei(t.id,f,p),a=parseFloat(n.carried_over)||0,s=parseFloat(n.extra_days)||0,u=Math.round((r+a+s-i)*100)/100,d=r+a+s,g=d>0?Math.min(100,Math.round(i/d*100)):0,_=m(u);return`<tr>
        <td style="padding:10px 12px;font-weight:600;">${h(t.color)}${V(t.short||t.name)}</td>
        <td style="padding:10px 12px;text-align:center;">${r}j</td>
        <td style="padding:10px 12px;text-align:center;">${i}j</td>
        <td style="padding:10px 12px;text-align:center;">${a>0?a+`j`:`—`}</td>
        <td style="padding:10px 12px;text-align:center;">${s===0?`—`:(s>0?`+`:``)+s+`j`}</td>
        ${e===`vets`?``:`<td style="padding:10px 12px;text-align:center;font-weight:700;color:${_};">${u}j</td>`}
        <td style="padding:10px 12px;min-width:120px;">
          <div style="background:var(--color-border);border-radius:99px;height:6px;overflow:hidden;">
            <div style="width:${g}%;background:${g>100?`#DC2626`:`var(--color-primary)`};height:100%;border-radius:99px;"></div>
          </div>
          <div style="font-size:11px;color:var(--color-muted);margin-top:2px;">${g}% posés</div>
        </td>
        ${o?`<td style="padding:10px 12px;"><button class="btn btn-sm cp-adjust-btn" data-pid="${t.id}" data-carried="${a}" data-extra="${s}" data-note="${V(n.extra_note||``)}">✎ Ajuster</button></td>`:``}
      </tr>`}).join(``),_=[c-1,c,c+1].map(e=>`<button class="cp-year-btn" data-year="${e}" style="border:1.5px solid ${e===c?`var(--color-primary)`:`var(--color-border)`};background:${e===c?`var(--color-secondary)`:`var(--color-card)`};color:${e===c?`var(--color-primary)`:`var(--color-text)`};padding:5px 14px;border-radius:20px;font-size:13px;cursor:pointer;font-weight:${e===c?`700`:`400`};">${e}</button>`).join(``);a.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <div>
          <div style="font-size:13.5px;font-weight:700;color:var(--color-text);">Période de référence : ${d}</div>
          <div style="font-size:12px;color:var(--color-muted);">${i}j acquis/mois (proratisé selon le taux d'activité)</div>
        </div>
        <div style="display:flex;gap:6px;">${_}</div>
      </div>
      <div class="card" style="overflow-x:auto;">
        <table class="recap-table" style="min-width:600px;">
          <thead><tr>
            <th style="text-align:left;">Personne</th>
            <th style="text-align:center;">Acquis</th>
            <th style="text-align:center;">Posés</th>
            <th style="text-align:center;">Report N-1</th>
            <th style="text-align:center;">Ajust.</th>
            ${e===`vets`?``:`<th style="text-align:center;">Solde</th>`}
            <th>Progression</th>
            ${o?`<th></th>`:``}
          </tr></thead>
          <tbody>${g}</tbody>
        </table>
      </div>
      <div style="font-size:11.5px;color:var(--color-muted);margin-top:8px;">
        🟢 ≥ 10j &nbsp;🟡 5–9j &nbsp;🔴 &lt; 5j · Jours "posés" = absences marquées CP/Congé dans le calendrier.
      </div>
    `,a.querySelectorAll(`.cp-year-btn`).forEach(t=>{t.onclick=()=>{ri._year[e]=parseInt(t.dataset.year,10),ri(e,r)}}),o&&a.querySelectorAll(`.cp-adjust-btn`).forEach(t=>{t.onclick=()=>ii(t.dataset.pid,c,parseFloat(t.dataset.carried)||0,parseFloat(t.dataset.extra)||0,t.dataset.note||``,e,r)})})()}ri._year={};function ii(e,t,n,i,a,o,s){let c=r().find(t=>t.id===e),l=document.getElementById(`modal-backdrop`),u=document.getElementById(`modal-box`);u.className=`modal-box`,u.innerHTML=`
    <h3>✎ Ajuster les CP — ${V(c?.short||e)} (${t})</h3>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Report N-1 (jours)</label>
        <input id="cp-carried" type="number" step="0.5" min="0" value="${n}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13.5px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Ajustement manuel (jours, + ou −)</label>
        <input id="cp-extra" type="number" step="0.5" value="${i}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13.5px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Motif</label>
        <textarea id="cp-note" rows="2" placeholder="Ancienneté, récupération…" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${V(a)}</textarea>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="cp-cancel">Annuler</button>
      <button class="btn btn-primary" id="cp-save">Enregistrer</button>
    </div>
  `,l.classList.add(`open`);let d=()=>l.classList.remove(`open`);u.querySelector(`#cp-cancel`).onclick=d,l.onclick=e=>{e.target===l&&d()},u.querySelector(`#cp-save`).onclick=async()=>{let n=parseFloat(u.querySelector(`#cp-carried`).value)||0,r=parseFloat(u.querySelector(`#cp-extra`).value)||0,i=u.querySelector(`#cp-note`).value.trim();try{let a=await fetch(`${E}cp_adjustments`,{method:`POST`,headers:A({"Content-Type":`application/json`,Prefer:`return=minimal,resolution=merge-duplicates`}),body:JSON.stringify({person_id:e,year:t,carried_over:n,extra_days:r,extra_note:i,updated_at:new Date().toISOString()})});if(!a.ok)throw Error(`HTTP ${a.status}`);d(),ri(o,s),I(`CP ${V(c?.short||e)} mis à jour`,`✅`)}catch(e){I(`Erreur : `+e.message,`⚠️`)}}}function ai(e,t,n){let r=F(e,t,n);if(r===`present`)return`Présent`;if(r===`absent`){let r=qt(e,t,n);if(P(t)){let i=zt(e,t,n)||`pending`;return i===`pending`?`Demande de congé en attente${r?` (`+V(r)+`)`:``}`:i===`rejected`?`Congé refusé — voir un vétérinaire`:`Congé approuvé${r?` (`+V(r)+`)`:``}`}return r?`Absent (${V(r)})`:`Absent`}return`—`}function oi(e,t,n){let r=F(t,e.id,n);if(r===`present`)return e.present.bg;if(r===`absent`){if(P(e.id)){let r=zt(t,e.id,n)||`pending`;if(r===`pending`)return`var(--color-leave-pending)`;if(r===`rejected`)return`var(--color-leave-rejected)`}return`var(--color-absent)`}return`#ffffff`}function si(e,n=t){let r=Array.from({length:31},(e,t)=>`<th>${t+1}</th>`).join(``),i=``;for(let t=0;t<12;t++){let r=Ge(e,t),a=``;for(let n=1;n<=31;n++){if(n>r){a+=`<td class="heatmap-weekday-cell empty-cell"></td>`;continue}let i=Ke(new Date(e,t,n));a+=`<td class="heatmap-weekday-cell${i===6?` is-sunday`:i===5?` is-saturday`:``}">${Ce[i][0]}</td>`}i+=`<tr class="heatmap-weekday-row"><th class="heatmap-month-label" rowspan="${n.length+1}">${Se[t]}</th><th class="heatmap-row-label"></th>${a}</tr>`,n.forEach(n=>{let a=``;for(let i=1;i<=31;i++){if(i>r){a+=`<td><div class="heatmap-cell empty-cell"></div></td>`;continue}let o=new Date(e,t,i),s=w(o);if(T(o)){a+=`<td><div class="heatmap-cell" style="background:var(--color-sunday);cursor:default;" title="${W(s)} — Fermé"></div></td>`;continue}let c=F(s,n.id,`M`),l=F(s,n.id,`AM`),u=oi(n,s,`M`),d=oi(n,s,`AM`),f=c===l?`background:${u};`:`background:linear-gradient(to bottom, ${u} 50%, ${d} 50%);`,p=We(s);p&&(f+=`box-shadow:0 0 0 2px var(--color-holiday) inset;`);let m=Wt(s,n.id),h=`${W(s)}${p?` — `+p:``} — Matin : ${ai(s,n.id,`M`)} · Après-midi : ${ai(s,n.id,`AM`)}${m>0?` · +`+K(m)+`h sup.`:``}`;a+=`<td><div class="heatmap-cell" data-date="${s}" style="${f}" title="${V(h)}" tabindex="0" role="button" aria-label="Détail du ${W(s)}"></div></td>`}i+=`<tr><th class="heatmap-row-label" style="color:${n.color}">${n.short}</th>${a}</tr>`})}return`
    <div class="heatmap-wrap">
      <table class="heatmap-table">
        <colgroup><col class="col-month"><col class="col-label">${`<col>`.repeat(31)}</colgroup>
        <thead><tr><th></th><th></th>${r}</tr></thead>
        <tbody>${i}</tbody>
      </table>
    </div>
  `}function ci(e,t,n){let r=document.getElementById(`popover-backdrop`),i=document.getElementById(`popover-box`),a=We(e),o=Yt(e),s=t.map(t=>`
    <p style="font-size:13px;margin:5px 0;"><strong style="color:${t.color}">${t.short}</strong> — Matin : ${ai(e,t.id,`M`)} · Après-midi : ${ai(e,t.id,`AM`)}</p>
  `).join(``);i.innerHTML=`
    <h4>${W(e)}${a?` <span class="cal-holiday-badge">Férié</span>`:``}</h4>
    ${o?`<p class="text-muted" style="font-size:12.5px;margin:8px 0;">💬 ${V(o)}</p>`:``}
    <div style="margin:10px 0;">${s}</div>
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Fermer</button>
      <button class="btn btn-primary" id="popover-edit">Éditer ce jour</button>
    </div>
  `,r.classList.add(`open`);let c=()=>r.classList.remove(`open`);i.querySelector(`#popover-cancel`).onclick=c,i.querySelector(`#popover-edit`).onclick=()=>{c();let t=parseInt(e.split(`-`)[1],10)-1;x[n].navState.month=t;let r=n.startsWith(`asv`)?`asv`:`vets`;on(r,n.endsWith(`forecast`)?`forecast`:`calendar`),R(r),setTimeout(()=>rr(e,n),50)},r.onclick=e=>{e.target===r&&c()}}function li(e){let t=Ne[e],n=document.getElementById(t.annualContainer),r=Me[e],i=r===`current`?t.calendarViewKey:t.forecastViewKey,a=x[i];n.innerHTML=`
    <h2 class="section-title">Vue Annuelle ${a.year} — ${t.label}</h2>
    <p class="section-desc" style="margin-bottom:12px;">Heatmap de présence — cliquez une cellule pour voir le détail du jour.</p>
    <div class="year-toggle" id="${e}-annual-year-toggle" style="margin-bottom:12px;">
      <button data-mode="current" class="${r===`current`?`active`:``}">${x[t.calendarViewKey].year}</button>
      <button data-mode="forecast" class="${r===`forecast`?`active`:``}">${x[t.forecastViewKey].year}</button>
    </div>
    <div class="card" style="padding:14px;">${si(a.year,a.people)}</div>
    <div class="legend" style="margin-top:12px;padding:10px 16px;">${Fn(a.people)}</div>
  `,n.querySelector(`#${e}-annual-year-toggle`).addEventListener(`click`,t=>{let n=t.target.closest(`button`);n&&(Me[e]=n.dataset.mode,li(e),fn())}),n.querySelectorAll(`.heatmap-cell[data-date]`).forEach(e=>{e.addEventListener(`click`,()=>ci(e.dataset.date,a.people,i)),e.addEventListener(`keydown`,t=>{(t.key===`Enter`||t.key===` `)&&(t.preventDefault(),ci(e.dataset.date,a.people,i))})})}function ui(){let e=document.getElementById(`impersonation-banner`);if(e)if(O?.role===`admin`&&Ze===`asv`&&Qe){let t=H(Qe);e.classList.remove(`hidden`),e.innerHTML=`
      <span>👁 Mode aperçu</span>
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${t?.color||`#fff`};display:inline-block;"></span>
        Vue de <strong>${V(t?.short||Qe)}</strong>
      </span>
      <button class="imp-back" id="imp-back-btn">← Retour à ma vue</button>
    `,document.getElementById(`imp-back-btn`).onclick=()=>{Ze=`vet`,Qe=null,di(),tn(),z(),I(`Retour à la vue Vétérinaires`,`👁`)}}else e.classList.add(`hidden`),e.innerHTML=``}function di(){document.body.classList.toggle(`role-asv`,lt()===`asv`),document.body.classList.toggle(`role-vet`,lt()!==`asv`),ui()}function fi(){let e=document.getElementById(`modal-backdrop`),t=document.getElementById(`modal-box`);t.className=`modal-box`,t.innerHTML=`
    <h3>👁 Vue ASV — choisir</h3>
    <p>Sélectionnez l'ASV dont vous souhaitez voir l'expérience :</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
      ${n.map(e=>`
        <button type="button" class="btn" data-pick-asv="${e.id}"
          style="justify-content:flex-start;gap:10px;border-color:${e.color};">
          <span style="width:10px;height:10px;border-radius:50%;background:${e.color};display:inline-block;"></span>
          ${V(e.short)}
        </button>
      `).join(``)}
    </div>
    <div class="modal-actions"><button class="btn" id="modal-cancel">Annuler</button></div>
  `,e.classList.add(`open`);let r=()=>e.classList.remove(`open`);t.querySelector(`#modal-cancel`).onclick=r,e.onclick=t=>{t.target===e&&r()},t.querySelectorAll(`[data-pick-asv]`).forEach(e=>{e.onclick=()=>{Qe=e.dataset.pickAsv,Ze=`asv`,r(),di(),tn(),L===`dashboard`?R(`vets`):z(),I(`Vue ASV : ${H(Qe)?.short}`,`👁`)}})}function pi(){Z.mondayISO=w(sn(y)),di(),p(),oe(),setInterval(()=>at(),2700*1e3),ft(),mn(),tn(),gn(),ir(),Dt();let e=pn();on(`vets`,S.vets),on(`asv`,S.asv);let t=!ut()&&e===`dashboard`?`vets`:e;if(R(rn[t]?t:`vets`),gt(),wt(),Et(),kt(),document.getElementById(`login-overlay`).classList.add(`hidden`),vt){let e=vt;vt=null,Hn(e)}typeof Pi==`function`&&Pi()}async function mi(){let e=new URLSearchParams(window.location.hash.replace(/^#/,``)),t=new URLSearchParams(window.location.search),n=e.get(`type`)||t.get(`type`),r=e.get(`access_token`)||t.get(`access_token`);if((n===`recovery`||n===`invite`)&&r){vi(r,n===`invite`);return}let i=t.get(`sign`);if(i){vt=i;let e=new URL(window.location.href);e.searchParams.delete(`sign`),history.replaceState({},``,e.toString())}if(!et()){gi();return}if(!await ct()){nt(),gi();return}pi()}document.addEventListener(`DOMContentLoaded`,mi);function hi(e){document.getElementById(`login-content`).innerHTML=e}function gi(e=``){document.getElementById(`login-overlay`).classList.remove(`hidden`),hi(`
    <form class="login-form" id="login-form" novalidate>
      <input type="email" id="login-email" placeholder="Adresse email" required autocomplete="email">
      <input type="password" id="login-password" placeholder="Mot de passe" required autocomplete="current-password">
      ${e?`<p class="login-error">${V(e)}</p>`:``}
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:2px;">Se connecter</button>
    </form>
    <div class="login-footer">
      <button type="button" class="link-button" id="forgot-btn">Mot de passe oublié ?</button>
    </div>
  `),document.getElementById(`login-form`).onsubmit=async e=>{e.preventDefault();let t=document.getElementById(`login-email`).value.trim(),n=document.getElementById(`login-password`).value,r=e.target.querySelector(`button[type=submit]`);r.disabled=!0,r.textContent=`Connexion…`;try{if(await rt(t,n),!await ct())throw Error(`Profil introuvable — contactez un administrateur.`);pi()}catch(e){gi(e.message||`Identifiants incorrects.`)}},document.getElementById(`forgot-btn`).onclick=_i}function _i(){hi(`
    <form class="login-form" id="forgot-form" novalidate>
      <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:14px;text-align:left;">
        Saisissez votre adresse email pour recevoir un lien de réinitialisation.
      </p>
      <input type="email" id="forgot-email" placeholder="Adresse email" required autocomplete="email">
      <p id="forgot-msg" style="font-size:12.5px;display:none;margin-bottom:8px;"></p>
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Envoyer le lien</button>
    </form>
    <div class="login-footer">
      <button type="button" class="link-button" id="back-login">← Retour</button>
    </div>
  `),document.getElementById(`forgot-form`).onsubmit=async e=>{e.preventDefault();let t=document.getElementById(`forgot-email`).value.trim(),n=e.target.querySelector(`button[type=submit]`),r=document.getElementById(`forgot-msg`);n.disabled=!0,n.textContent=`Envoi…`;try{await st(t),r.textContent=`Email envoyé ! Vérifiez votre boîte de réception.`,r.style.color=`var(--color-primary)`,r.style.display=`block`}catch(e){r.textContent=e.message,r.style.color=`#B91C1C`,r.style.display=`block`,n.disabled=!1,n.textContent=`Envoyer le lien`}},document.getElementById(`back-login`).onclick=gi}function vi(e,t=!1){document.getElementById(`login-overlay`).classList.remove(`hidden`),hi(`
    <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:14px;text-align:left;">
      ${t?`Bienvenue ! Choisissez votre mot de passe pour activer votre compte.`:`Choisissez votre nouveau mot de passe.`}
    </p>
    <form class="login-form" id="set-pwd-form" novalidate>
      <input type="password" id="set-pwd-new" placeholder="Nouveau mot de passe (8 car. min.)" autocomplete="new-password">
      <input type="password" id="set-pwd-confirm" placeholder="Confirmer le mot de passe" autocomplete="new-password">
      <p id="set-pwd-error" class="login-error" style="display:none;"></p>
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Définir le mot de passe</button>
    </form>
  `),document.getElementById(`set-pwd-form`).onsubmit=async t=>{t.preventDefault();let n=document.getElementById(`set-pwd-new`).value,r=document.getElementById(`set-pwd-confirm`).value,i=document.getElementById(`set-pwd-error`),a=t.target.querySelector(`button[type=submit]`);if(n.length<8){i.textContent=`Au moins 8 caractères.`,i.style.display=`block`;return}if(n!==r){i.textContent=`Les mots de passe ne correspondent pas.`,i.style.display=`block`;return}a.disabled=!0,a.textContent=`Enregistrement…`;try{await ot(e,n),history.replaceState(null,``,window.location.pathname),await ct()?pi():gi(`Mot de passe défini. Connectez-vous.`)}catch(e){i.textContent=e.message,i.style.display=`block`,a.disabled=!1,a.textContent=`Définir le mot de passe`}}}var yi=`BD8PsjUf5CnogfRdI81PvKKHT9C7OGV7tqPQ29Ic8kkcarkqyFRa-YbUQam_OHI8xZWnz1rzkFhicB_UMb5CMHI`,bi=14,xi=`pwa_ios_prompt_ts`,Si=`pwa_android_prompt_ts`;window.PWA={isIOS(){return/iPad|iPhone|iPod/.test(navigator.userAgent)},isInstalled(){return window.navigator.standalone===!0||window.matchMedia(`(display-mode: standalone)`).matches},supportsPush(){return`PushManager`in window&&`serviceWorker`in navigator}};function Ci(e){let t=(e+`=`.repeat((4-e.length%4)%4)).replace(/-/g,`+`).replace(/_/g,`/`),n=atob(t),r=new Uint8Array(n.length);for(let e=0;e<n.length;e++)r[e]=n.charCodeAt(e);return r}var wi=null;function Ti(){let e=document.getElementById(`pwa-update-banner`);e&&(e.innerHTML=`Mise à jour disponible <button id="pwa-reload-btn">Recharger</button>`,e.style.display=`block`,e.querySelector(`#pwa-reload-btn`).onclick=()=>window.location.reload())}function Ei(){`serviceWorker`in navigator&&(navigator.serviceWorker.register(`./sw.js`,{scope:`./`}).then(e=>{wi=e,e.addEventListener(`updatefound`,()=>{let t=e.installing;t&&t.addEventListener(`statechange`,()=>{t.state===`installed`&&navigator.serviceWorker.controller&&Ti()})})}).catch(e=>console.warn(`Échec enregistrement Service Worker`,e)),navigator.serviceWorker.addEventListener(`message`,e=>{e.data&&e.data.type===`pwa-notification-click`&&Ni(e.data.notificationType)}))}function Di(e){let t=parseInt(localStorage.getItem(e),10);return Number.isFinite(t)?(Date.now()-t)/864e5>=bi:!0}function Oi(e){localStorage.setItem(e,String(Date.now()))}function ki(){if(!PWA.isIOS()||PWA.isInstalled()||!Di(xi))return;let e=document.getElementById(`pwa-ios-install-tip`);e&&(e.innerHTML=`
    <button class="pwa-tip-close" aria-label="Fermer">✕</button>
    <strong>Installez Amivet RH</strong><br>
    Appuyez sur <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong> pour installer l'app et activer les notifications.
  `,e.style.display=`block`,e.querySelector(`.pwa-tip-close`).onclick=()=>{e.style.display=`none`,Oi(xi)})}var Ai=null;window.addEventListener(`beforeinstallprompt`,e=>{if(e.preventDefault(),Ai=e,!Di(Si))return;let t=document.getElementById(`pwa-android-install-banner`);t&&(t.innerHTML=`
    <button class="pwa-tip-close" aria-label="Fermer">✕</button>
    <strong>Installez Amivet RH</strong><br>
    Ajoutez l'app à votre écran d'accueil pour un accès rapide et les notifications.
    <div><button id="pwa-android-install-btn">Installer l'app</button></div>
  `,t.style.display=`block`,t.querySelector(`.pwa-tip-close`).onclick=()=>{t.style.display=`none`,Oi(Si)},t.querySelector(`#pwa-android-install-btn`).onclick=async()=>{t.style.display=`none`,Oi(Si),Ai&&=(Ai.prompt(),await Ai.userChoice,null)})});function ji(){let e=document.getElementById(`pwa-offline-banner`);e&&(e.textContent=`Mode hors-ligne — données du dernier chargement`,e.style.display=navigator.onLine?`none`:`block`)}function Mi(){typeof gt==`function`&&gt(),typeof wt==`function`&&wt(),typeof Et==`function`&&Et(),typeof kt==`function`&&kt()}window.addEventListener(`online`,()=>{ji(),Mi()}),window.addEventListener(`offline`,ji),document.addEventListener(`visibilitychange`,()=>{document.hidden||Mi()});function Ni(e){if(!(O===void 0||!O))switch(e){case`leave_request`:case`leave_approved`:case`leave_rejected`:ut()&&(R(`dashboard`),Q.tab=`requests`,Ur());break;case`medical_visit`:ut()&&(R(`dashboard`),Q.tab=`stats`,Ur());break;case`interview`:ut()&&(R(`dashboard`),Q.tab=`interviews`,Ur());break;case`announcement`:R(`annonces`);break}}function Pi(){let e=new URLSearchParams(window.location.search).get(`action`);if(!e)return;let t=new URL(window.location.href);t.searchParams.delete(`action`),t.searchParams.delete(`source`),history.replaceState({},``,t.toString()),e===`new-leave`?(R(`asv`),on(`asv`,`calendar`)):e===`week-view`?(R(`asv`),on(`asv`,`week`)):Ni({"dashboard-requests":`leave_request`,"dashboard-medical":`medical_visit`,"dashboard-interviews":`interview`,announcements:`announcement`}[e])}function Fi(){return O?.person_id||null}async function Ii(e){let t=Fi();t&&await fetch(`${E}push_subscriptions`,{method:`POST`,headers:A({"Content-Type":`application/json`,Prefer:`resolution=merge-duplicates,return=minimal`}),body:JSON.stringify({user_name:t,subscription_json:e.toJSON(),user_agent:navigator.userAgent,updated_at:new Date().toISOString()})})}async function Li(){let e=Fi();e&&await fetch(`${E}push_subscriptions?user_name=eq.${encodeURIComponent(e)}`,{method:`DELETE`,headers:A()})}async function Ri(){if(!PWA.supportsPush())throw Error(`Notifications non supportées sur cet appareil.`);if(await Notification.requestPermission()!==`granted`)throw Error(`Permission refusée.`);let e=wi||await navigator.serviceWorker.ready,t=await e.pushManager.getSubscription();return t||=await e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:Ci(yi)}),await Ii(t),t}async function zi(){if(!(`serviceWorker`in navigator))return;let e=await(wi||await navigator.serviceWorker.ready).pushManager.getSubscription();e&&await e.unsubscribe(),await Li()}function $({type:e,title:t,body:n,targetUsers:r=[],data:i={},requireInteraction:a=!1}){fetch(`${D}push-server`,{method:`POST`,headers:A({"Content-Type":`application/json`}),body:JSON.stringify({type:e,title:t,body:n,targetUsers:r,data:i,requireInteraction:a})}).catch(e=>console.warn(`Envoi notification push impossible (ignoré)`,e))}function Bi(){return PWA.supportsPush()?PWA.isIOS()&&!PWA.isInstalled()?{text:`Installez l'app pour activer les notifications`,tone:`muted`}:Notification.permission===`granted`?{text:`Activées`,tone:`ok`}:Notification.permission===`denied`?{text:`Bloquées`,tone:`danger`}:{text:`Non configurées`,tone:`muted`}:{text:`Non disponible sur cet appareil`,tone:`muted`}}async function Vi(){let e=document.getElementById(`modal-backdrop`),t=document.getElementById(`modal-box`);t.className=`modal-box`;let n=()=>{let r=Bi(),i=PWA.isIOS()&&!PWA.isInstalled(),a=Notification.permission===`denied`,o=PWA.supportsPush()&&!i&&Notification.permission!==`granted`;t.innerHTML=`
      <h3>🔔 Notifications</h3>
      <p>Statut actuel : <strong>${r.text}</strong></p>
      ${i?`<p class="text-muted" style="font-size:12.5px;">Sur iPhone/iPad, les notifications ne fonctionnent que si l'app est installée : Partager → Sur l'écran d'accueil.</p>`:``}
      ${a?`<p class="text-muted" style="font-size:12.5px;">Les notifications sont bloquées par le navigateur. Autorisez-les dans Réglages &gt; Safari &gt; Amivet RH (ou l'équivalent sur votre navigateur), puis revenez ici.</p>`:``}
      ${o?`<button class="btn btn-primary" id="notif-enable-btn" style="width:100%;justify-content:center;margin-top:10px;">Activer les notifications</button>`:``}
      ${r.tone===`ok`?`<button class="btn" id="notif-disable-btn" style="width:100%;justify-content:center;margin-top:10px;">Désactiver les notifications</button>`:``}
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn" id="modal-cancel">Fermer</button>
      </div>
    `;let s=t.querySelector(`#notif-enable-btn`);s&&(s.onclick=async()=>{s.disabled=!0,s.textContent=`Activation…`;try{await Ri(),I(`Notifications activées`,`🔔`),n()}catch(e){I(e.message||`Impossible d'activer les notifications sur cet appareil`,`⚠️`),n()}});let c=t.querySelector(`#notif-disable-btn`);c&&(c.onclick=async()=>{c.disabled=!0,await zi(),I(`Notifications désactivées`,`🔕`),n()}),t.querySelector(`#modal-cancel`).onclick=()=>e.classList.remove(`open`)};n(),e.classList.add(`open`),e.onclick=t=>{t.target===e&&e.classList.remove(`open`)}}Ei(),setTimeout(ki,4e3),ji(),(function(){function e(e,t){let n;return function(){clearTimeout(n),n=setTimeout(()=>e.apply(this,arguments),t)}}let t=[{view:`dashboard`,icon:`📊`,label:`Tableau de bord`,shortLabel:`Tableau`,badgeId:`dash-nav-badge`},{view:`vets`,icon:`🩺`,label:`Vétérinaires`,shortLabel:`Vétos`,badgeId:null},{view:`asv`,icon:`🐾`,label:`ASV`,shortLabel:`ASV`,badgeId:null},{view:`annonces`,icon:`📣`,label:`Annonces`,shortLabel:`Annonces`,badgeId:`annonces-nav-badge`}],n=null,r=null;function i(){let e=document.createElement(`nav`);return e.id=`mobile-bottom-nav`,e.setAttribute(`aria-label`,`Navigation principale`),t.forEach(t=>{let n=document.createElement(`button`);n.className=`mb-tab`,n.dataset.view=t.view,n.setAttribute(`aria-label`,t.label);let r=document.createElement(`span`);r.className=`mb-icon`,r.textContent=t.icon;let i=document.createElement(`span`);if(i.className=`mb-label`,i.textContent=t.shortLabel,n.appendChild(r),n.appendChild(i),t.badgeId){let e=document.createElement(`span`);e.id=`mb-`+t.badgeId,e.className=`mb-badge`,n.appendChild(e)}n.addEventListener(`click`,()=>{typeof R==`function`&&R(t.view)}),e.appendChild(n)}),e}function a(){if(!n)return;let e=document.querySelector(`.nav-tab.active`)?.dataset.view;n.querySelectorAll(`.mb-tab`).forEach(t=>t.classList.toggle(`active`,t.dataset.view===e)),t.forEach(e=>{if(!e.badgeId)return;let t=document.getElementById(e.badgeId),n=document.getElementById(`mb-`+e.badgeId);t&&n&&(n.innerHTML=t.innerHTML)})}function o(){if(n||window.innerWidth>=768)return;n=i(),document.getElementById(`app`).appendChild(n),a();let e=new MutationObserver(a);document.querySelectorAll(`.nav-tab`).forEach(t=>e.observe(t,{attributes:!0,attributeFilter:[`class`]})),[`dash-nav-badge`,`annonces-nav-badge`].forEach(t=>{let n=document.getElementById(t);n&&e.observe(n,{childList:!0,subtree:!0,characterData:!0})})}function s(){n&&=(n.remove(),null)}function c(){r||window.innerWidth>=768||typeof R!=`function`||typeof on!=`function`||(r=document.createElement(`button`),r.id=`mobile-fab`,r.setAttribute(`aria-label`,`Demander un congé`),r.textContent=`+`,r.addEventListener(`click`,()=>{R(`asv`),on(`asv`,`calendar`)}),document.getElementById(`app`).appendChild(r))}function l(){r&&=(r.remove(),null)}function u(e,t){if(window.innerWidth>=768)return;e.querySelectorAll(`:scope > .mobile-sheet-handle`).forEach(e=>e.remove());let n=document.createElement(`div`);n.className=`mobile-sheet-handle`,e.insertBefore(n,e.firstChild);let r=0,i=0,a=!1;n.addEventListener(`touchstart`,t=>{r=t.touches[0].clientY,i=Date.now(),a=!1,e.style.transition=`none`},{passive:!0}),n.addEventListener(`touchmove`,t=>{let n=t.touches[0].clientY-r;n>0&&(a=!0,e.style.transform=`translateY(${n}px)`)},{passive:!0}),n.addEventListener(`touchend`,n=>{let o=n.changedTouches[0].clientY-r,s=o/Math.max(1,Date.now()-i);e.style.transition=``,e.style.transform=``,a&&o>80&&s>.3&&t()})}(function(){let e=document.getElementById(`day-sidebar`),t=document.getElementById(`sidebar-overlay`);if(!e)return;let n=()=>{e.classList.remove(`open`),t&&t.classList.remove(`open`)};new MutationObserver(()=>{window.innerWidth<768&&u(e,n)}).observe(e,{childList:!0})})(),(function(){let e=document.getElementById(`modal-box`),t=document.getElementById(`modal-backdrop`);if(!e||!t)return;let n=()=>t.classList.remove(`open`);new MutationObserver(()=>{window.innerWidth<768&&u(e,n)}).observe(e,{childList:!0}),new MutationObserver(()=>{t.classList.contains(`open`)&&window.innerWidth<768&&u(e,n)}).observe(t,{attributes:!0,attributeFilter:[`class`]})})(),(function(){let e=document.getElementById(`popover-box`),t=document.getElementById(`popover-backdrop`);if(!e||!t)return;let n=()=>t.classList.remove(`open`);new MutationObserver(()=>{window.innerWidth<768&&u(e,n)}).observe(e,{childList:!0}),new MutationObserver(()=>{t.classList.contains(`open`)&&window.innerWidth<768&&u(e,n)}).observe(t,{attributes:!0,attributeFilter:[`class`]})})();function d(){window.innerWidth<768?(o(),c()):(s(),l())}window.addEventListener(`resize`,e(d,200)),d()})();