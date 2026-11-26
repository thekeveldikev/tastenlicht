// Aktualisieren wie eine App: schaut nach, ob es online einen neueren Stand gibt (version.json), zeigt dann oben ein
// Banner "Neue Version" und holt sie mit einem Tipp. Danach einmal "Das ist neu".
// Ablauf beim Aktualisieren: Service Worker neu holen (sw.js traegt den neuen Stand), warten bis er uebernimmt
// (er raeumt den alten Programm-Speicher weg), neu laden. Verschluesselte Inhalte laedt er nur, wenn sie sich geaendert haben.
// Lernstaende und Einstellungen bleiben unberuehrt (sie liegen im Geraet, nicht im Programm-Speicher).
// Leck-Schutz: oeffentliche Datei – keine Liedinhalte.
import { symbol } from './symbole.js';

const PRUEF_ABSTAND = 30 * 60000;          // im Hintergrund alle 30 Minuten
const STAND = () => (window.TRESOR_INFO && window.TRESOR_INFO.stand) || null;

let letztePruefung = 0;
let banner = null;
let neu = null;                             // { stand, neu: [...] } vom Server
let laeuft = false;
let toast = () => {};

export function standText(stand = STAND()) {
  const m = /^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)/.exec(stand || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]} Uhr` : (stand || 'Entwicklungsfassung');
}

async function holeVersion() {
  const r = await fetch(`version.json?x=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// manuell = true: auch "Du bist aktuell" bzw. "Kein Internet" melden
export async function pruefen(manuell = false) {
  if (!STAND()) { if (manuell) toast('Entwicklungsfassung – Aktualisieren gibt es nur in der veröffentlichten App.', 3000); return false; }
  letztePruefung = Date.now();
  let v;
  try { v = await holeVersion(); } catch {
    if (manuell) toast(navigator.onLine === false ? 'Kein Internet – bitte später nochmal.' : 'Die neue Version ließ sich gerade nicht abfragen.', 2800);
    return false;
  }
  if (v && v.stand && v.stand !== STAND() && v.stand > STAND()) {
    neu = v;
    bannerZeigen();
    return true;
  }
  if (manuell) toast(`Du hast die neueste Version (Stand ${standText()}).`, 2600);
  return false;
}

function bannerZeigen() {
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'update-banner glas';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `<span class="ub-punkt"></span><div class="ub-text"><b>Neue Version da</b><small></small></div>
      <button type="button" class="knopf ub-neu">Was ist neu?</button>
      <button type="button" class="knopf akzent ub-los">${symbol('wiederholen')}<span>Aktualisieren</span></button>
      <button type="button" class="knopf rund ub-zu" aria-label="Später">${symbol('kreuz')}</button>`;
    document.body.appendChild(banner);
    banner.querySelector('.ub-los').onclick = () => aktualisieren();
    banner.querySelector('.ub-neu').onclick = () => neuigkeitenZeigen(neu, 'Das kommt mit der neuen Version');
    banner.querySelector('.ub-zu').onclick = () => { banner.classList.remove('zeigen'); };
  }
  banner.querySelector('small').textContent = `Stand ${standText(neu.stand)} · deine Lernstände bleiben`;
  banner.querySelector('.ub-neu').classList.toggle('versteckt', !(neu.neu && neu.neu.length));
  requestAnimationFrame(() => banner.classList.add('zeigen'));
}

export async function aktualisieren() {
  if (laeuft) return;
  laeuft = true;
  const los = banner && banner.querySelector('.ub-los span');
  if (los) los.textContent = 'Wird geladen …';
  try {
    sessionStorage.setItem('tl.aktualisiert', JSON.stringify(neu || { stand: null }));
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      const wechsel = new Promise((ok) => {
        navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true });
        setTimeout(ok, 9000);
      });
      await reg.update();
      if (reg.installing || reg.waiting) await wechsel;
    }
  } catch (e) { console.warn('Aktualisieren', e); }
  location.reload();
}

// Kleines Blatt mit den Neuigkeiten
export function neuigkeitenZeigen(v, titel = 'Das ist neu') {
  const punkte = (v && v.neu) || [];
  const k = document.createElement('div');
  k.className = 'update-karte-hinter';
  k.innerHTML = `<div class="update-karte glas" role="dialog" aria-modal="true"><h2></h2><p class="text-hilfe"></p><ul></ul>
    <button type="button" class="knopf akzent ub-ok">Schön!</button></div>`;
  k.querySelector('h2').textContent = titel;
  k.querySelector('p').textContent = v && v.stand ? `Stand ${standText(v.stand)}` : '';
  const ul = k.querySelector('ul');
  for (const p of punkte) { const li = document.createElement('li'); li.textContent = p; ul.appendChild(li); }
  if (!punkte.length) ul.outerHTML = '<p>Kleine Verbesserungen und Fehlerbehebungen.</p>';
  const zu = () => { k.classList.remove('zeigen'); setTimeout(() => k.remove(), 250); };
  k.querySelector('.ub-ok').onclick = zu;
  k.onclick = (e) => { if (e.target === k) zu(); };
  document.body.appendChild(k);
  requestAnimationFrame(() => k.classList.add('zeigen'));
}

export function updateEinrichten({ toast: t } = {}) {
  if (t) toast = t;
  // gerade aktualisiert? Dann einmal zeigen, was neu ist
  let gerade = null;
  try { gerade = JSON.parse(sessionStorage.getItem('tl.aktualisiert') || 'null'); sessionStorage.removeItem('tl.aktualisiert'); } catch { gerade = null; }
  if (gerade) {
    if (gerade.stand && gerade.stand !== STAND()) {
      setTimeout(() => toast('Noch nicht ganz – bitte mit gutem Internet noch einmal „Aktualisieren“.', 4200), 1500);
    } else setTimeout(() => neuigkeitenZeigen(gerade, 'Aktualisiert – das ist neu'), 1200);
  }
  if (!STAND()) return;
  setTimeout(() => pruefen(false), 6000);
  setInterval(() => { if (!document.hidden && Date.now() - letztePruefung > PRUEF_ABSTAND) pruefen(false); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - letztePruefung > 10 * 60000) pruefen(false);
  });
  window.tlUpdate = { pruefen, aktualisieren, standText };
}

// Baustein fuer Einstellungsblaetter: Stand + Knopf "Nach Updates suchen"
export function updateBaustein() {
  const box = document.createElement('div');
  box.className = 'update-baustein';
  box.innerHTML = `<div><b>App-Version</b><small></small></div><button type="button" class="knopf">${symbol('wiederholen')}<span>Nach Updates suchen</span></button>`;
  box.querySelector('small').textContent = `Stand ${standText()}`;
  box.querySelector('button').onclick = async () => {
    const sp = box.querySelector('button span');
    sp.textContent = 'Suche …';
    const ja = await pruefen(true);
    sp.textContent = ja ? 'Neue Version – oben tippen' : 'Nach Updates suchen';
  };
  return box;
}
