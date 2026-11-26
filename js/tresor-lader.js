// Startet die veroeffentlichte Fassung: Service Worker (entschluesselt) -> Geheimwort -> App.
// Das Geheimwort wird einmal eingegeben (oder kommt per Einrichtungs-Link #schluessel=…) und auf diesem iPad gemerkt.
const INFO = window.TRESOR_INFO;
const app = document.getElementById('app');

function karte(html) {
  app.innerHTML = `<div class="vollbild-karte"><div class="inhalt">${html}</div></div>`;
  return app.firstElementChild;
}
const SCHLOSS = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:46px;height:46px;opacity:.85"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
const TEILEN = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;vertical-align:-4px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6.5 10.5H5v10h14v-10h-1.5"/></svg>';

function b64zuPuffer(s) { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function pufferZuB64(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
const normal = (w) => String(w || '').trim().toLowerCase().replace(/\s+/g, '-');
const istStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

// Geheimwort -> Schluessel (PBKDF2) -> pruefen. Gross-/Kleinschreibung egal, Leerzeichen zaehlen wie Bindestriche.
async function ableiten(wort) {
  const basis = await crypto.subtle.importKey('raw', new TextEncoder().encode(normal(wort)), { name: 'PBKDF2' }, false, ['deriveKey']);
  const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64zuPuffer(INFO.salz), iterations: INFO.runden, hash: 'SHA-256' },
    basis, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  const p = b64zuPuffer(INFO.pruefung);
  await crypto.subtle.decrypt({ name: 'AES-GCM', iv: p.slice(0, 12) }, k, p.slice(12));   // wirft bei falschem Wort
  return pufferZuB64(await crypto.subtle.exportKey('raw', k));
}

function anWorker(nachricht) {
  return navigator.serviceWorker.ready.then((reg) => new Promise((ok) => {
    const ziel = navigator.serviceWorker.controller || reg.active;
    const kanal = new MessageChannel();
    kanal.port1.onmessage = (e) => ok(e.data);
    ziel.postMessage(nachricht, [kanal.port2]);
    setTimeout(() => ok(null), 4000);
  }));
}
window.tresorFrage = anWorker;      // fuer die App (Offline-Stand, Vorladen)

let geladen = false;
async function appLaden() {
  if (geladen) return;
  geladen = true;
  try { navigator.storage?.persist?.(); } catch { /* egal */ }
  try {
    const m = await import('./main.js');
    app.innerHTML = '';
    await m.starten(app);
  } catch (e) {
    geladen = false;
    karte(`<h1>Hoppla</h1><p>Da hat etwas nicht geladen. Bitte einmal mit Internet öffnen.</p><button class="knopf startknopf" onclick="location.reload()">Nochmal</button>`);
  }
}

function sperre(fehler) {
  const k = karte(`${SCHLOSS}<h1>Tastenlicht</h1><p>Bitte das Geheimwort eingeben.</p>
    <form id="tresorForm" style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <input id="wort" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false"
        style="min-height:56px;width:min(340px,80vw);padding:0 16px;border-radius:14px;border:1px solid var(--rand-stark);background:rgba(255,255,255,.08);font-size:20px">
      <button class="knopf akzent" style="min-height:56px;padding:0 26px;font-size:18px" id="auf">Öffnen</button>
    </form>
    ${fehler ? '<p style="color:var(--gefahr);font-weight:600">Das war nicht das Geheimwort.</p>' : ''}
    <p class="text-hilfe" style="margin-top:18px">Wird auf diesem Gerät gemerkt – danach öffnet die App direkt.</p>`);
  const feld = k.querySelector('#wort');
  let gesendet = false;
  k.querySelector('#tresorForm').onsubmit = async (e) => {
    e.preventDefault();
    if (gesendet) return;
    gesendet = true;
    k.querySelector('#auf').disabled = true;
    try {
      const roh = await ableiten(feld.value);
      await anWorker({ art: 'schluessel', roh });
      appLaden();
    } catch { sperre(true); }
  };
  setTimeout(() => feld.focus(), 300);
}

// Einrichtung per Link/QR-Code: #schluessel=wort-wort-…  (bleibt in der Adresse, damit "Zum Home-Bildschirm" ihn mitnimmt)
async function einrichtung(wort) {
  try {
    const roh = await ableiten(wort);
    await anWorker({ art: 'schluessel', roh });
  } catch { sperre(true); return; }
  if (istStandalone()) { history.replaceState(null, '', location.pathname + location.search); appLaden(); return; }
  const k = karte(`${SCHLOSS}<h1>Freigeschaltet</h1>
    <p>Jetzt am besten: ${TEILEN} <b>Teilen</b> antippen, dann <b>Zum Home-Bildschirm</b>.<br>Dann liegt Tastenlicht wie eine App auf dem Home-Bildschirm und läuft auch ohne Internet.</p>
    <button class="knopf akzent startknopf" id="hierOeffnen">Gleich hier öffnen</button>`);
  k.querySelector('#hierOeffnen').onclick = () => appLaden();
}

async function start() {
  if (!('serviceWorker' in navigator) || !window.crypto?.subtle) {
    karte('<h1>Oh je</h1><p>Dieses Gerät ist leider zu alt (nötig: iOS bzw. iPadOS 16 oder neuer).</p>');
    return;
  }
  try {
    await navigator.serviceWorker.register('sw.js').catch((f) => { if (navigator.serviceWorker.controller) return null; throw f; });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {          // beim allerersten Besuch einmal neu laden
      if (!sessionStorage.getItem('tl.neu')) { sessionStorage.setItem('tl.neu', '1'); location.reload(); return; }
    }
  } catch (e) {
    karte(`<h1>Hoppla</h1><p>Der Offline-Speicher ließ sich nicht starten.</p>`);
    return;
  }
  const m = /schluessel=([^&]+)/.exec(location.hash);
  if (m) { await einrichtung(decodeURIComponent(m[1])); return; }
  const ok = await anWorker({ art: 'pruefe', pruefung: INFO.pruefung });
  if (ok === true) appLaden(); else sperre(false);
}

start();
