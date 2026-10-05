/* Service Worker der veroeffentlichten Fassung ("Tresor").
   Alles unter daten/ und audio/ liegt im Netz nur VERSCHLUESSELT (…​.enc). Dieser Worker holt die verschluesselte
   Datei, entschluesselt sie auf dem iPad und reicht sie an die App weiter. Verschluesselte Dateien bleiben im
   Speicher (offline); dank Inhaltskennung (?h=…) wird nach einem Update nur Geaendertes neu geladen.
   Wird von Werkzeuge/ipad_veroeffentlichen.py als sw.js veroeffentlicht (20261005-220343 und {"audio/gesang.m4a": "c6f2a7051832", "audio/karaoke.m4a": "dd9c13326e27", "audio/klavier/manifest.json": "9b70d1f747d8", "audio/klavier/p102_v1.mp3": "6df0a754d612", "audio/klavier/p102_v2.mp3": "2db136374b1c", "audio/klavier/p102_v3.mp3": "f4cc16aca62f", "audio/klavier/p105_v1.mp3": "89aa70d1c5fe", "audio/klavier/p105_v2.mp3": "946e59ea1cca", "audio/klavier/p105_v3.mp3": "836575112c6a", "audio/klavier/p108_v1.mp3": "b84e22f1a5bd", "audio/klavier/p108_v2.mp3": "572db5a1f78d", "audio/klavier/p108_v3.mp3": "17b6fd27c8f4", "audio/klavier/p21_v1.mp3": "24b3e0b01a02", "audio/klavier/p21_v2.mp3": "6bae8e6b0c14", "audio/klavier/p21_v3.mp3": "8464a77b3f75", "audio/klavier/p24_v1.mp3": "31ce1fda91fe", "audio/klavier/p24_v2.mp3": "46371a56bc81", "audio/klavier/p24_v3.mp3": "2a7af20c0346", "audio/klavier/p27_v1.mp3": "f348aab4f051", "audio/klavier/p27_v2.mp3": "4b85b313c2f5", "audio/klavier/p27_v3.mp3": "f077489100ca", "audio/klavier/p30_v1.mp3": "f51cecb08e07", "audio/klavier/p30_v2.mp3": "fdb241e0d1f2", "audio/klavier/p30_v3.mp3": "c640fb2b7bb3", "audio/klavier/p33_v1.mp3": "0cefae2eb093", "audio/klavier/p33_v2.mp3": "0d8268584fcb", "audio/klavier/p33_v3.mp3": "129b58c2d392", "audio/klavier/p36_v1.mp3": "05b104a117a0", "audio/klavier/p36_v2.mp3": "f927f14675cd", "audio/klavier/p36_v3.mp3": "7b92c825ee41", "audio/klavier/p39_v1.mp3": "b63484d84c68", "audio/klavier/p39_v2.mp3": "2f9e8a015ae6", "audio/klavier/p39_v3.mp3": "fdde0ad9c26a", "audio/klavier/p42_v1.mp3": "4bc43eefd447", "audio/klavier/p42_v2.mp3": "0596b041ff6e", "audio/klavier/p42_v3.mp3": "1921902e6963", "audio/klavier/p45_v1.mp3": "6751cba52b2f", "audio/klavier/p45_v2.mp3": "ba43b565402b", "audio/klavier/p45_v3.mp3": "4138977e8210", "audio/klavier/p48_v1.mp3": "695c8f7fa5db", "audio/klavier/p48_v2.mp3": "9ad542adfaa9", "audio/klavier/p48_v3.mp3": "70365d72131b", "audio/klavier/p51_v1.mp3": "967e6ca6ea46", "audio/klavier/p51_v2.mp3": "5bec7bb43d76", "audio/klavier/p51_v3.mp3": "846ba00b7333", "audio/klavier/p54_v1.mp3": "00f4ded8a73f", "audio/klavier/p54_v2.mp3": "0a0eedff6068", "audio/klavier/p54_v3.mp3": "c620b3882a89", "audio/klavier/p57_v1.mp3": "b90dd676a7fb", "audio/klavier/p57_v2.mp3": "c95c046b70c5", "audio/klavier/p57_v3.mp3": "c7ced18695d6", "audio/klavier/p60_v1.mp3": "b5f42436d47e", "audio/klavier/p60_v2.mp3": "8afde26fd1ed", "audio/klavier/p60_v3.mp3": "14c252601cd6", "audio/klavier/p63_v1.mp3": "e79f986c3210", "audio/klavier/p63_v2.mp3": "c2ad8d0645d2", "audio/klavier/p63_v3.mp3": "cd0772cd0520", "audio/klavier/p66_v1.mp3": "e62bf35f7a60", "audio/klavier/p66_v2.mp3": "4f46e9d38e60", "audio/klavier/p66_v3.mp3": "74e4f286498a", "audio/klavier/p69_v1.mp3": "a60a1eabe9e2", "audio/klavier/p69_v2.mp3": "90155c85c367", "audio/klavier/p69_v3.mp3": "9dbaf649bc9b", "audio/klavier/p72_v1.mp3": "187120a61c2a", "audio/klavier/p72_v2.mp3": "3831aeb24ffd", "audio/klavier/p72_v3.mp3": "d22202c77f2a", "audio/klavier/p75_v1.mp3": "dfb61807a1df", "audio/klavier/p75_v2.mp3": "bc39fc9d675c", "audio/klavier/p75_v3.mp3": "a4894d7d4726", "audio/klavier/p78_v1.mp3": "0055a4d16db6", "audio/klavier/p78_v2.mp3": "9843e3837cbb", "audio/klavier/p78_v3.mp3": "75b00456cec1", "audio/klavier/p81_v1.mp3": "63e55f8352b4", "audio/klavier/p81_v2.mp3": "a770e1188ab4", "audio/klavier/p81_v3.mp3": "0107e1c8d96c", "audio/klavier/p84_v1.mp3": "15077325c017", "audio/klavier/p84_v2.mp3": "9cde26ea21f1", "audio/klavier/p84_v3.mp3": "13d3891df058", "audio/klavier/p87_v1.mp3": "815cacf02ab0", "audio/klavier/p87_v2.mp3": "d3f403186594", "audio/klavier/p87_v3.mp3": "38e4a807e95c", "audio/klavier/p90_v1.mp3": "3b68eb74ccb6", "audio/klavier/p90_v2.mp3": "e5cb562fd2c7", "audio/klavier/p90_v3.mp3": "680ab9589648", "audio/klavier/p93_v1.mp3": "27d9c16cac0b", "audio/klavier/p93_v2.mp3": "8c2261ecee17", "audio/klavier/p93_v3.mp3": "a9119d2b066d", "audio/klavier/p96_v1.mp3": "877d7694e2fd", "audio/klavier/p96_v2.mp3": "dd9b8f3f1048", "audio/klavier/p96_v3.mp3": "eff3e6d222d6", "audio/klavier/p99_v1.mp3": "29977b25d786", "audio/klavier/p99_v2.mp3": "cf44018a0cdd", "audio/klavier/p99_v3.mp3": "6b12e272da13", "audio/original.m4a": "cfac262bd14a", "daten/lautlehre.json": "5a4f6f364bab", "daten/liedtext.txt": "658aa34db62e", "daten/phonetik.js": "2d6b167f61d7", "daten/song.json": "b86e9b40937a", "daten/wortschatz.json": "6cc05ca1772b", "daten/worum.json": "5dd3c764887f"} ersetzt). */
const VERSION = 'tl-20261005-220343';
const PROGRAMM = 'tl-programm-' + VERSION;
const DATEN = 'tl-daten';
const DATEIEN = {"audio/gesang.m4a": "c6f2a7051832", "audio/karaoke.m4a": "dd9c13326e27", "audio/klavier/manifest.json": "9b70d1f747d8", "audio/klavier/p102_v1.mp3": "6df0a754d612", "audio/klavier/p102_v2.mp3": "2db136374b1c", "audio/klavier/p102_v3.mp3": "f4cc16aca62f", "audio/klavier/p105_v1.mp3": "89aa70d1c5fe", "audio/klavier/p105_v2.mp3": "946e59ea1cca", "audio/klavier/p105_v3.mp3": "836575112c6a", "audio/klavier/p108_v1.mp3": "b84e22f1a5bd", "audio/klavier/p108_v2.mp3": "572db5a1f78d", "audio/klavier/p108_v3.mp3": "17b6fd27c8f4", "audio/klavier/p21_v1.mp3": "24b3e0b01a02", "audio/klavier/p21_v2.mp3": "6bae8e6b0c14", "audio/klavier/p21_v3.mp3": "8464a77b3f75", "audio/klavier/p24_v1.mp3": "31ce1fda91fe", "audio/klavier/p24_v2.mp3": "46371a56bc81", "audio/klavier/p24_v3.mp3": "2a7af20c0346", "audio/klavier/p27_v1.mp3": "f348aab4f051", "audio/klavier/p27_v2.mp3": "4b85b313c2f5", "audio/klavier/p27_v3.mp3": "f077489100ca", "audio/klavier/p30_v1.mp3": "f51cecb08e07", "audio/klavier/p30_v2.mp3": "fdb241e0d1f2", "audio/klavier/p30_v3.mp3": "c640fb2b7bb3", "audio/klavier/p33_v1.mp3": "0cefae2eb093", "audio/klavier/p33_v2.mp3": "0d8268584fcb", "audio/klavier/p33_v3.mp3": "129b58c2d392", "audio/klavier/p36_v1.mp3": "05b104a117a0", "audio/klavier/p36_v2.mp3": "f927f14675cd", "audio/klavier/p36_v3.mp3": "7b92c825ee41", "audio/klavier/p39_v1.mp3": "b63484d84c68", "audio/klavier/p39_v2.mp3": "2f9e8a015ae6", "audio/klavier/p39_v3.mp3": "fdde0ad9c26a", "audio/klavier/p42_v1.mp3": "4bc43eefd447", "audio/klavier/p42_v2.mp3": "0596b041ff6e", "audio/klavier/p42_v3.mp3": "1921902e6963", "audio/klavier/p45_v1.mp3": "6751cba52b2f", "audio/klavier/p45_v2.mp3": "ba43b565402b", "audio/klavier/p45_v3.mp3": "4138977e8210", "audio/klavier/p48_v1.mp3": "695c8f7fa5db", "audio/klavier/p48_v2.mp3": "9ad542adfaa9", "audio/klavier/p48_v3.mp3": "70365d72131b", "audio/klavier/p51_v1.mp3": "967e6ca6ea46", "audio/klavier/p51_v2.mp3": "5bec7bb43d76", "audio/klavier/p51_v3.mp3": "846ba00b7333", "audio/klavier/p54_v1.mp3": "00f4ded8a73f", "audio/klavier/p54_v2.mp3": "0a0eedff6068", "audio/klavier/p54_v3.mp3": "c620b3882a89", "audio/klavier/p57_v1.mp3": "b90dd676a7fb", "audio/klavier/p57_v2.mp3": "c95c046b70c5", "audio/klavier/p57_v3.mp3": "c7ced18695d6", "audio/klavier/p60_v1.mp3": "b5f42436d47e", "audio/klavier/p60_v2.mp3": "8afde26fd1ed", "audio/klavier/p60_v3.mp3": "14c252601cd6", "audio/klavier/p63_v1.mp3": "e79f986c3210", "audio/klavier/p63_v2.mp3": "c2ad8d0645d2", "audio/klavier/p63_v3.mp3": "cd0772cd0520", "audio/klavier/p66_v1.mp3": "e62bf35f7a60", "audio/klavier/p66_v2.mp3": "4f46e9d38e60", "audio/klavier/p66_v3.mp3": "74e4f286498a", "audio/klavier/p69_v1.mp3": "a60a1eabe9e2", "audio/klavier/p69_v2.mp3": "90155c85c367", "audio/klavier/p69_v3.mp3": "9dbaf649bc9b", "audio/klavier/p72_v1.mp3": "187120a61c2a", "audio/klavier/p72_v2.mp3": "3831aeb24ffd", "audio/klavier/p72_v3.mp3": "d22202c77f2a", "audio/klavier/p75_v1.mp3": "dfb61807a1df", "audio/klavier/p75_v2.mp3": "bc39fc9d675c", "audio/klavier/p75_v3.mp3": "a4894d7d4726", "audio/klavier/p78_v1.mp3": "0055a4d16db6", "audio/klavier/p78_v2.mp3": "9843e3837cbb", "audio/klavier/p78_v3.mp3": "75b00456cec1", "audio/klavier/p81_v1.mp3": "63e55f8352b4", "audio/klavier/p81_v2.mp3": "a770e1188ab4", "audio/klavier/p81_v3.mp3": "0107e1c8d96c", "audio/klavier/p84_v1.mp3": "15077325c017", "audio/klavier/p84_v2.mp3": "9cde26ea21f1", "audio/klavier/p84_v3.mp3": "13d3891df058", "audio/klavier/p87_v1.mp3": "815cacf02ab0", "audio/klavier/p87_v2.mp3": "d3f403186594", "audio/klavier/p87_v3.mp3": "38e4a807e95c", "audio/klavier/p90_v1.mp3": "3b68eb74ccb6", "audio/klavier/p90_v2.mp3": "e5cb562fd2c7", "audio/klavier/p90_v3.mp3": "680ab9589648", "audio/klavier/p93_v1.mp3": "27d9c16cac0b", "audio/klavier/p93_v2.mp3": "8c2261ecee17", "audio/klavier/p93_v3.mp3": "a9119d2b066d", "audio/klavier/p96_v1.mp3": "877d7694e2fd", "audio/klavier/p96_v2.mp3": "dd9b8f3f1048", "audio/klavier/p96_v3.mp3": "eff3e6d222d6", "audio/klavier/p99_v1.mp3": "29977b25d786", "audio/klavier/p99_v2.mp3": "cf44018a0cdd", "audio/klavier/p99_v3.mp3": "6b12e272da13", "audio/original.m4a": "cfac262bd14a", "daten/lautlehre.json": "5a4f6f364bab", "daten/liedtext.txt": "658aa34db62e", "daten/phonetik.js": "2d6b167f61d7", "daten/song.json": "b86e9b40937a", "daten/wortschatz.json": "6cc05ca1772b", "daten/worum.json": "5dd3c764887f"};               // { "daten/song.json": "a1b2c3…", … }
const GESCHUETZT = /^(daten|audio)\//;
const TYPEN = { js: 'application/javascript; charset=utf-8', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', png: 'image/png', jpg: 'image/jpeg', css: 'text/css; charset=utf-8' };
const BASIS = new URL('./', self.location).href;
let schluesselVersprechen = null;
const klar = new Map();                     // kleiner Zwischenspeicher fuer zuletzt entschluesselte Dateien

// ---------- Schluessel im Geraet (IndexedDB, uebersteht Neustarts des Workers) ----------
function db() {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open('tl-tresor', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('s');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}
async function merke(roh) {
  const d = await db();
  await new Promise((ok) => { const t = d.transaction('s', 'readwrite'); if (roh) t.objectStore('s').put(roh, 'schluessel'); else t.objectStore('s').delete('schluessel'); t.oncomplete = ok; t.onerror = ok; });
}
async function lies() {
  const d = await db();
  return new Promise((ok) => { const r = d.transaction('s').objectStore('s').get('schluessel'); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
}
function b64(s) { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; }
function schluessel() {
  if (!schluesselVersprechen) {
    schluesselVersprechen = lies().then((roh) => {
      if (!roh) { schluesselVersprechen = null; return null; }
      return crypto.subtle.importKey('raw', b64(roh), { name: 'AES-GCM' }, false, ['decrypt']);
    });
  }
  return schluesselVersprechen;
}
async function entschluesseln(k, buf) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, k, buf.slice(12)); }

// ---------- Lebenszyklus ----------
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const n of await caches.keys()) if (n.startsWith('tl-programm-') && n !== PROGRAMM) await caches.delete(n);
    // alte verschluesselte Fassungen (andere Inhaltskennung) wegraeumen
    const c = await caches.open(DATEN);
    const gueltig = new Set(Object.keys(DATEIEN).map(encUrl));
    for (const anfrage of await c.keys()) if (!gueltig.has(anfrage.url)) await c.delete(anfrage);
    await self.clients.claim();
  })());
});

function encUrl(rel) { return BASIS + rel + '.enc?h=' + DATEIEN[rel]; }

async function holeVerschluesselt(rel) {
  const url = encUrl(rel);
  const c = await caches.open(DATEN);
  const treffer = await c.match(url);
  if (treffer) return treffer;
  const antwort = await fetch(url, { cache: 'no-cache' });
  if (antwort.ok) await c.put(url, antwort.clone());
  return antwort;
}

// ---------- Nachrichten der Seite ----------
self.addEventListener('message', (e) => {
  const d = e.data || {};
  const antworte = (x) => { if (e.ports && e.ports[0]) e.ports[0].postMessage(x); };
  if (d.art === 'schluessel') { schluesselVersprechen = null; klar.clear(); merke(d.roh).then(() => antworte('ok')); return; }
  if (d.art === 'pruefe') {
    schluessel().then(async (k) => {
      if (!k) return antworte(false);
      try { await entschluesseln(k, b64(d.pruefung)); antworte(true); } catch { antworte(false); }
    });
    return;
  }
  if (d.art === 'status') {
    caches.open(DATEN).then(async (c) => {
      let da = 0;
      for (const rel of Object.keys(DATEIEN)) if (await c.match(encUrl(rel))) da++;
      antworte({ da, gesamt: Object.keys(DATEIEN).length });
    });
    return;
  }
  if (d.art === 'vorladen') {
    e.waitUntil((async () => {
      for (const rel of Object.keys(DATEIEN)) { try { await holeVerschluesselt(rel); } catch { /* offline: spaeter */ } }
      antworte('fertig');
    })());
  }
});

// ---------- Abrufe ----------
async function entschluesselt(anfrage, rel) {
  try {
    const k = await schluessel();
    if (!k) return new Response('gesperrt', { status: 403 });
    let daten = klar.get(rel);
    if (!daten) {
      const antwort = await holeVerschluesselt(rel);
      if (!antwort.ok) return new Response('nicht da', { status: 404 });
      try { daten = await entschluesseln(k, await antwort.arrayBuffer()); }
      catch {                                   // passt nicht (mehr) – einmal frisch aus dem Netz
        const c = await caches.open(DATEN);
        await c.delete(encUrl(rel));
        const neu = await holeVerschluesselt(rel);
        daten = await entschluesseln(k, await neu.arrayBuffer());
      }
      klar.set(rel, daten);
      if (klar.size > 6) klar.delete(klar.keys().next().value);
    }
    const endung = (rel.split('.').pop() || '').toLowerCase();
    const typ = TYPEN[endung] || 'application/octet-stream', ganz = daten.byteLength;
    const m = /^bytes=(\d*)-(\d*)$/.exec(anfrage.headers.get('range') || '');
    if (m && (m[1] || m[2])) {                 // Safari spielt Ton nur mit Teilstuecken (206) zuverlaessig
      const von = m[1] ? parseInt(m[1], 10) : Math.max(0, ganz - parseInt(m[2], 10));
      const bis = m[1] && m[2] ? Math.min(parseInt(m[2], 10), ganz - 1) : ganz - 1;
      if (von > bis || von >= ganz) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + ganz } });
      return new Response(daten.slice(von, bis + 1), { status: 206, headers: { 'Content-Type': typ, 'Content-Range': `bytes ${von}-${bis}/${ganz}`, 'Content-Length': String(bis - von + 1), 'Accept-Ranges': 'bytes' } });
    }
    return new Response(daten, { status: 200, headers: { 'Content-Type': typ, 'Content-Length': String(ganz), 'Accept-Ranges': 'bytes' } });
  } catch (e) {
    return new Response('Fehler', { status: 500 });
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (!url.href.startsWith(BASIS)) return;
  const rel = decodeURIComponent(url.pathname.slice(new URL(BASIS).pathname.length));
  if (GESCHUETZT.test(rel) && DATEIEN[rel]) { e.respondWith(entschluesselt(e.request, rel)); return; }
  if (/\.enc$/.test(url.pathname)) return;
  // Programm: Netz zuerst (damit Aenderungen ankommen), sonst Speicher; hoechstens 4 s aufs Netz warten
  e.respondWith((async () => {
    const c = await caches.open(PROGRAMM);
    const gespeichert = await c.match(e.request, { ignoreSearch: true });
    const netz = fetch(e.request).then((a) => { if (a && a.ok) c.put(e.request, a.clone()); return a; });
    if (!gespeichert) return netz.catch(() => caches.match(e.request, { ignoreSearch: true }));
    return Promise.race([
      netz.then((a) => (a && a.ok ? a : gespeichert), () => gespeichert),
      new Promise((ok) => setTimeout(() => ok(gespeichert), 4000)),
    ]);
  })());
});
