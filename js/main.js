// Tastenlicht – iPad-Fassung: alles zusammenstecken und die Bildschleife starten.
// Alle liedbezogenen Inhalte kommen zur Laufzeit aus daten/ und audio/ (im Netz verschluesselt).
import { ladeSong, zeitAusBeat, beatAusZeit, akkordBei, setzeFassung, baukastenSetzen, abschnittBei } from './song.js';
import { Einstellungen, speicher } from './einstellungen.js';
import { AudioEngine } from './audio.js';
import { notenName, akkordName, akkordTone } from './notennamen.js';
import { Transport } from './transport.js';
import { Buehne, THEMEN } from './buehne.js';
import { Oberflaeche, EBENEN_VORLAGEN } from './ui.js';
import { Uebeweg } from './uebeweg.js';
import { mische } from './effekte.js';
import { zeilenSilben } from './silben.js';
import { symbol, setzeSymbol } from './symbole.js';
import { TEXT_STANDARD } from './text.js';
import { BLATT_STANDARD } from './liedblatt.js';
import { updateEinrichten } from './update.js';
import { StartSeite } from './start.js';

const STANDARD = {
  ansicht: {
    thema: 'nacht', perspektive: 0, sichtSekunden: 3.5, tastaturHoehe: 1, notenNamen: true, nurMelodieNamen: false,
    notenSystem: 'de', vorzeichen: 'b', tastenNamen: 'c', akkordSpur: true, akkordHud: true, akkordSystem: 'en', akkordTasten: false,
    taktLinien: true, schlagLinien: false, oktavLinien: true, vorschau: true, gesangslinie: true, gesangslinieLage: 'oktave',
    notenVerstecken: 'aus', maxDpr: 2, leisteKlein: false,
  },
  effekte: { aufprall: true, bloom: 0.5, funken: false, pulse: false, sterne: false, aurora: false },
  klang: { master: 0.9, klavier: 0.9, spur: 0.85, metronom: 0.7, hall: 0.3, spurQuelle: 'keine', gesangsfuehrung: 0, transposition: 0 },
  spiel: { hand: 'nichts', einzaehlen: 1, metronom: false },
  schichten: { mel: true, harm: true, fill: true, bass: true, acc: true },
  ebenenVorlage: 'voll',
  liedtext: { anzeigen: true, lautschrift: false, position: 'oben', gross: false },
  text: { ...TEXT_STANDARD },                       // Einstellungen der Text-Ansicht (Lautschule)
  blatt: { ...BLATT_STANDARD },                     // Liedblatt: Akkorde ueber dem Text
  uebeweg: { laenge: 2, startTempo: 60, zielTempo: 100, pauseEinzaehlen: true, tagesZiel: 15, nachfragen: true },
  geraet: { wachHalten: true, pedal: 'geklappt', start: 'auto' },   // start: auto | start | klavier | text | liedblatt
  fassung: 'begl3',
  baukasten: baukastenVorschlagWerte(),             // Mein Arrangement: je Liedteil ein Begleit-Stil
  tempo: 1,
  zuletzt: { pos: 0, zeit: 0 },                     // Stelle im Lied beim letzten Mal (weiter, wo du warst)
};

function baukastenVorschlagWerte() {
  // je Liedteil (t0 = Vorspiel, t1 = Strophe 1 … t7 = Ausklang)
  return { t0: 'intim2', t1: 'intim2', t2: 'orig2', t3: 'orig2', t4: 'pop2', t5: 'pop3', t6: 'orig3', t7: 'neo2' };
}

// ---------------------------------------------------------------- Lade- und Startbildschirm
function karte(app, html) {
  const k = document.createElement('div');
  k.className = 'vollbild-karte';
  k.innerHTML = `<div class="inhalt">${html}</div>`;
  app.appendChild(k);
  return k;
}

function ladebildschirm(app) {
  const k = karte(app, '<h1>Tastenlicht</h1><p id="ldText">Lädt …</p><div class="ladebalken"><i id="ldBalken"></i></div>');
  return {
    text(t, anteil) { k.querySelector('#ldText').textContent = t; if (anteil != null) k.querySelector('#ldBalken').style.width = `${Math.round(anteil * 100)}%`; },
    weg() { k.classList.add('weg'); setTimeout(() => k.remove(), 400); },
    fehler(t) { k.querySelector('.inhalt').innerHTML = `<h1>Hoppla</h1><p></p><button class="knopf startknopf" onclick="location.reload()">Nochmal</button>`; k.querySelector('p').textContent = t; },
  };
}

const istStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

// iPhone (kurze Bildschirmseite unter 600 pt): startet direkt im Text-Teil, Klavier laedt still im Hintergrund.
// Zum Pruefen am Rechner: ?geraet=handy bzw. ?geraet=tablet in der Adresse.
function istHandy() {
  const q = /[?&]geraet=(handy|tablet)\b/.exec(location.search);
  if (q) return q[1] === 'handy';
  return Math.min(screen.width || 9999, screen.height || 9999) < 600;
}

export async function starten(app) {
  const lade = ladebildschirm(app);
  try {
    await aufbauen(app, lade);
  } catch (e) {
    console.error(e);
    lade.fehler(`Das Lied ließ sich nicht laden (${e && e.message}). Einmal mit Internet öffnen.`);
  }
}

async function aufbauen(app, lade) {
  try { navigator.storage?.persist?.(); } catch { /* egal */ }
  const handy = istHandy();
  document.documentElement.classList.toggle('handy', handy);
  const einst = new Einstellungen('klavier', STANDARD).laden();
  lade.text('Lied wird geladen …', 0.05);
  const song = await ladeSong('daten/');
  song.zeitAusBeat = (b) => zeitAusBeat(song, b);
  // Silben der Gesangslinie (Geisternoten) aus dem Liedtext zuordnen – an den Grunddaten, damit sie
  // jeden Fassungswechsel und jedes Transponieren ueberstehen
  const basisGesang = song._grund.spuren.find((s) => s.id === 'gesang').noten;
  for (const z of song.zeilen) {
    const silben = zeilenSilben(z.text).map((s) => s.text.replace(/[.,!?;:]/g, ''));
    const basis = basisGesang.filter((n) => n.z === z.nr && n.s).sort((a, b) => a.b - b.b);
    if (silben.length === basis.length) basis.forEach((n, i) => { n.silbe = silben[i]; });
    else if (basis.length) basis[0].silbe = z.text.split(/\s+/)[0];
  }
  baukastenSetzen(song, einst.get('baukasten'));    // "Mein Arrangement" steht immer bereit
  if (!song.fassungen.some((f) => f.id === einst.get('fassung'))) einst.set('fassung', 'begl3', { still: true });
  setzeFassung(song, einst.get('fassung'), einst.get('klang.transposition') || 0);
  const engine = new AudioEngine();
  const tr = new Transport(engine, song);
  // weiter, wo du warst (nicht ganz am Anfang oder am Ende, und nicht aelter als 30 Tage)
  const zl = einst.get('zuletzt') || {};
  const zurueckAn = zl.pos > song.anfang + 4 && zl.pos < song.ende - 6 && Date.now() - (zl.zeit || 0) < 30 * 86400000;
  tr.seek(zurueckAn ? Math.max(song.anfang, zl.pos - 2) : song.anfang, { weiter: false });
  const canvas = document.createElement('canvas');
  canvas.id = 'buehne';
  app.prepend(canvas);
  const buehne = new Buehne(canvas);

  if (handy) {
    // iPhone: erst den Text-Teil (Aufnahmen), die Klaviertoene (nur fuer "Mit Klavier-Melodie") spaeter in Ruhe
    lade.text('Text wird vorbereitet …', 0.6);
    setTimeout(() => engine.sampler.ladeSatz('klavier').catch(() => {}), 8000);
  } else {
    lade.text('Klavier wird geladen …', 0.15);
    await engine.sampler.ladeSatz('klavier', null, (a) => lade.text(`Klavier wird geladen … ${Math.round(a * 100)} %`, 0.15 + 0.8 * a));
  }

  // ------------------------------------------------------------------ Darstellung je Note
  const sichtbar = (n) => n.hand !== 'V' && einst.get(`schichten.${n.l}`) !== false;
  const istMeins = (n) => { const h = einst.get('spiel.hand'); return h === 'beide' || (h !== 'nichts' && n.hand === h); };
  const uw = new Uebeweg({ song, tr, einst, speicher, sichtbar });
  const farbeCache = new Map();
  const farbe = (n) => {
    const a = einst.werte.ansicht;
    const h = einst.get('spiel.hand');
    const gedimmt = h !== 'nichts' && !istMeins(n);
    const key = `${a.thema}|${n.hand}|${n.l}|${gedimmt}`;
    let f = farbeCache.get(key);
    if (f) return f;
    const th = THEMEN[a.thema] || THEMEN.nacht;
    const basis = n.hand === 'L' ? th.lh : th.rh;
    f = (n.l === 'mel' || n.l === 'bass') ? basis : [mische(basis[0], '#000000', 0.12), mische(basis[1], '#000000', 0.05)];
    // nicht deine Hand: zurueckgenommen, damit deine Noten herausleuchten
    if (gedimmt) f = [mische(f[0], '#10131a', 0.55), mische(f[1], '#10131a', 0.5)];
    farbeCache.set(key, f);
    return f;
  };
  const label = (n) => {
    const a = einst.werte.ansicht;
    if (!a.notenNamen) return null;
    if (a.nurMelodieNamen && n.l !== 'mel') return null;
    return notenName(n.p, a.notenSystem, song.transposition && song.kreuzTonart ? '#' : a.vorzeichen);
  };

  // ------------------------------------------------------------------ Anwenden
  const bereichAnwenden = () => buehne.setBereich(Math.min(song.tonumfang.min - 2, 36), Math.max(song.tonumfang.max + 3, 84));
  const filterAnwenden = () => {
    const gf = einst.get('klang.gesangsfuehrung') || 0;
    tr.filter = (n) => (n.hand === 'V' ? gf > 0.01 : sichtbar(n) && !istMeins(n));
    tr.anschlag = (n) => (n.hand === 'V' ? Math.round(28 + 70 * gf) : n.v);
    farbeCache.clear();
  };
  const klangAnwenden = () => {
    const k = einst.werte.klang;
    engine.setPegel('master', k.master);
    const blattStill = liedblatt?.sichtbar && (einst.get('blatt.klang') === 'stumm' || (einst.get('blatt.klang') === 'original' && !song.transposition));
    engine.setPegel('klavier', blattStill ? 0 : k.klavier);
    engine.setPegel('klick', k.metronom);
    engine.setHall(k.hall);
    engine.sampler.verstimmungCent = song.stimmungCent || 0;
    tr.setMediumPegel(k.spur);
  };
  // Aufnahmen: einmal komplett laden (bei der veroeffentlichten Fassung entschluesselt der Service Worker),
  // dann als blob: im Speicher – Safari spielt das zuverlaessig und ohne staendiges Nachladen
  const blobs = new Map();
  const quelle = (name) => {
    if (!blobs.has(name)) {
      blobs.set(name, (async () => {
        const r = await fetch(song.audio[name]);
        if (!r.ok) throw new Error(`Aufnahme fehlt (${r.status})`);
        return URL.createObjectURL(await r.blob());
      })().catch((e) => { blobs.delete(name); throw e; }));
    }
    return blobs.get(name);
  };
  let spurAuftrag = 0;
  const spurAnwenden = async () => {
    const q = einst.get('klang.spurQuelle');
    const auftrag = ++spurAuftrag;
    if (q !== 'keine' && song.transposition) {
      ui?.toast(`Die Aufnahme passt nur zu Des-Dur – in ${song.tonartName} bleibt sie aus`, 3200);
      einst.set('klang.spurQuelle', 'keine');
      return;
    }
    if (q === 'keine') { tr.setMedium(null); return; }
    try {
      ui?.toast('Aufnahme wird geladen …', 1200);
      const url = await quelle(q);
      if (auftrag !== spurAuftrag) return;
      tr.setMedium(engine.medium(q, url));
    } catch (e) { ui?.toast('Aufnahme ließ sich nicht laden', 2600); einst.set('klang.spurQuelle', 'keine'); }
  };
  const fassungWechseln = (id) => {
    const pos = tr.pos;
    tr.alleGeplantenStoppen();
    const uebewegLief = uw.aktiv;
    if (uebewegLief) uw.beenden();
    if (id === 'mix') baukastenSetzen(song, einst.get('baukasten'));
    setzeFassung(song, id, einst.get('klang.transposition') || 0);
    sicht.noten = song.alleNoten; sicht.takte = song.takte; sicht.akkorde = song.akkorde;
    if (!tr.loop.aktiv) tr.loop = { a: song.anfang, b: song.ende, aktiv: false };
    bereichAnwenden(); filterAnwenden();
    tr.seek(Math.max(song.anfang, Math.min(pos, song.ende)), { weiter: tr.spielt });
    ui.zustandSync();
    const stil = (song.stile || []).find((x) => x.id === song.fassung.stil);
    ui.toast(`${song.fassung.name}${song.transposition ? ` · ${song.tonartName}` : ''}${stil ? ` – ${stil.kurz}` : ''}`, stil ? 2600 : 1900);
    if (uebewegLief) uw.starten();
  };

  // ------------------------------------------------------------------ Begleit-Stile: Wahl, Karussell, Muster, Akkord-Modus
  const stilListe = () => ['song', ...(song.stile || []).map((s) => s.id), 'mix'];
  const fassungFuer = (stil, stufe) => {
    if (stil === 'song' || stil === 'mix') return stil;
    const liste = song.fassungen.filter((f) => f.stil === stil).sort((a, b) => a.stufe - b.stufe);
    if (!liste.length) return 'begl3';
    return (liste.find((f) => f.stufe === stufe) || liste[stufe > liste.length ? liste.length - 1 : Math.min(1, liste.length - 1)]).id;
  };
  let gemerkteStufe = song.fassung.stufe || 2;
  const stilWaehlen = (stil) => {
    if (stil === 'weiter') { const l = stilListe(); stil = l[(l.indexOf(song.fassung.stil || (song.fassung.id === 'song' ? 'song' : 'standard')) + 1) % l.length]; }
    if (song.fassung.stufe) gemerkteStufe = song.fassung.stufe;
    einst.set('fassung', fassungFuer(stil, gemerkteStufe));
  };
  const stufeWaehlen = (stufe) => {
    const stil = song.fassung.stil;
    if (!stil || stil === 'mix') return;
    const liste = song.fassungen.filter((f) => f.stil === stil).sort((a, b) => a.stufe - b.stufe);
    if (stufe === 'weiter') stufe = (song.fassung.stufe % liste.length) + 1;
    gemerkteStufe = stufe;
    einst.set('fassung', fassungFuer(stil, stufe));
  };
  let karussell = null;
  const karussellUmschalten = () => {
    if (karussell) { karussell(); karussell = null; ui.toast('Stil-Karussell aus'); return; }
    if (uw.aktiv) uw.beenden();
    const stufe = song.fassung.stufe || gemerkteStufe || 2;
    const reihe = (song.stile || []).map((s) => fassungFuer(s.id, stufe));
    if (!tr.loop.aktiv) { const ab = abschnittBei(song, Math.max(0, tr.pos)); tr.setLoop(ab.t, ab.te, true); }
    let i = Math.max(0, reihe.indexOf(song.fassung.id));
    einst.set('fassung', reihe[i]);
    karussell = tr.on('loop', () => { i = (i + 1) % reihe.length; setTimeout(() => einst.set('fassung', reihe[i]), 0); });
    ui.toast('Stil-Karussell: nach jedem Durchgang der nächste Stil', 2600);
    if (!tr.spielt) { engine.aufwecken(); tr.play({ einzaehlen: 4 }); }
  };
  const musterUeben = () => {
    if (uw.aktiv) uw.beenden();
    const ab = abschnittBei(song, Math.max(song.anfang, tr.pos));
    const b0 = Math.round(beatAusZeit(song, ab.t) / 4) * 4;
    tr.setLoop(zeitAusBeat(song, b0), zeitAusBeat(song, b0 + 8), true);
    tr.seek(zeitAusBeat(song, b0), { weiter: false });
    tr.setSpeed(0.7); einst.set('tempo', 0.7);
    const sb = (song.stile || []).find((x) => x.id === song.fassung.stil)?.steckbrief;
    ui.toast(`Muster üben: ${ab.name}, 2 Takte, 70 %${sb ? ` – ${sb.muster}` : ''}`, 4200);
    ui.zustandSync();
  };
  let akkordVorher = null;
  const akkordModusUmschalten = () => {
    const karte = document.getElementById('musterKarte');
    if (akkordVorher) {
      for (const [k, v] of Object.entries(akkordVorher)) einst.set(k, v);
      akkordVorher = null;
      karte.classList.add('versteckt');
      ui.toast('Noten wieder sichtbar');
      return;
    }
    akkordVorher = { 'ansicht.notenVerstecken': einst.get('ansicht.notenVerstecken'), 'ansicht.akkordTasten': einst.get('ansicht.akkordTasten'), 'ansicht.akkordSpur': einst.get('ansicht.akkordSpur'), 'ansicht.akkordHud': einst.get('ansicht.akkordHud') };
    einst.set('ansicht.notenVerstecken', 'ganz'); einst.set('ansicht.akkordTasten', true); einst.set('ansicht.akkordSpur', true); einst.set('ansicht.akkordHud', true);
    const sb = (song.stile || []).find((x) => x.id === song.fassung.stil)?.steckbrief;
    document.getElementById('musterText').textContent = sb ? sb.muster : 'Spiel die Akkorde in deinem eigenen Muster.';
    karte.classList.remove('versteckt');
    ui.toast('Nach Akkorden spielen: Noten aus, Akkordtöne als Punkte', 3200);
  };
  const baukastenVorschlag = () => { einst.set('baukasten', baukastenVorschlagWerte()); if (song.fassung.id === 'mix') fassungWechseln('mix'); ui.toast('Vorschlag geladen'); };

  // ------------------------------------------------------------------ Oberflaeche
  let textAnsicht = null;
  let liedblatt = null;
  let startseite = null;
  let blattVorher = null;                           // Klang-Einstellungen vor dem Liedblatt (werden beim Schliessen zurueckgesetzt)
  const schleifeVerlassen = (t) => {
    if (!tr.loop.aktiv || uw.aktiv) return;
    if (t < tr.loop.a - 0.05 || t >= tr.loop.b) { tr.loopAus(); ui.toast('Schleife aus'); ui.zustandSync(); }
  };
  const aktionen = {
    umschalten: () => { engine.aufwecken(); if (uw.aktiv && uw.wartetAufUrteil) { uw.werten(true); return; } tr.umschalten({ einzaehlen: (einst.get('spiel.einzaehlen') || 0) * 4 }); },
    zumAnfang: () => { const z = tr.loop.aktiv ? tr.loop.a : song.anfang; tr.seek(z, { weiter: tr.spielt }); },
    springen: (t) => { schleifeVerlassen(t); tr.seek(t, { weiter: tr.spielt }); },
    taktSprung: (n) => {
      const b = beatAusZeit(song, tr.pos);
      const ziel = Math.max(Math.round(beatAusZeit(song, song.anfang)), Math.round((Math.floor(b / 4 + 1e-6) + n) * 4));
      const t = zeitAusBeat(song, ziel);
      schleifeVerlassen(t);
      tr.seek(t, { weiter: tr.spielt });
    },
    tempoAendern: (d) => { tr.setSpeed(Math.round((tr.speed + d) * 100) / 100); einst.set('tempo', tr.speed); },
    tempoSetzen: (s) => { tr.setSpeed(s); einst.set('tempo', tr.speed); },
    schleifeUmschalten: () => {
      if (tr.loop.aktiv) { tr.loopAus(); ui.toast('Schleife aus'); }
      else {
        const ab = song.abschnitte.find((a) => a.t <= tr.pos && a.te > tr.pos) || song.abschnitte[0];
        tr.setLoop(ab.t, ab.te, true);
        ui.toast(`Schleife: ${ab.name}`);
      }
      ui.zustandSync();
    },
    schleifeSetzen: (a, b) => { tr.setLoop(a, b, true); if (tr.pos < a || tr.pos > b) tr.seek(a, { weiter: tr.spielt }); ui.zustandSync(); },
    uebewegUmschalten: () => { engine.aufwecken(); if (karussell) karussellUmschalten(); if (uw.aktiv) uw.beenden(); else uw.starten(); ui.zustandSync(); },
    stilWaehlen, stufeWaehlen, karussellUmschalten, karussellAktiv: () => !!karussell, musterUeben, akkordModusUmschalten, baukastenVorschlag,
    textOeffnen: async (nr = null, { modus = null } = {}) => {
      tr.pause();
      const w = document.getElementById('textWurzel');
      try {
        if (!textAnsicht) {
          const { TextAnsicht } = await import('./text.js');
          textAnsicht = new TextAnsicht({
            wurzel: w, song, engine, einst, speicher, quelle, symbol, setzeSymbol, handy,
            offlineInfo: () => aktionen.offlineInfo(),
            toast: (t, ms) => ui.toast(t, ms),
            zurKlavier: () => { textAnsicht.verstecken(); w.classList.add('versteckt'); klavierWecken(); },
            zumLiedblatt: () => aktionen.liedblattOeffnen(),
            zurStartseite: () => { textAnsicht.verstecken(); w.classList.add('versteckt'); aktionen.startOeffnen(); },
          });
          w.classList.remove('versteckt');
          await textAnsicht.start();
        }
        w.classList.remove('versteckt');
        if (modus && einst.get('text.modus') !== modus) { einst.set('text.modus', modus); textAnsicht._modiBauen(); }
        textAnsicht.zeigen(nr);
        if (modus) textAnsicht._modusZeigen();
      } catch (e) { console.error(e); w.classList.add('versteckt'); ui.toast('Der Text-Teil ließ sich nicht öffnen', 2600); }
    },
    liedblattOeffnen: async ({ buehne: aufDieBuehne = false, verdeckt = false } = {}) => {
      const w = document.getElementById('blattWurzel');
      textAnsicht?.stop?.();
      try {
        if (!liedblatt) {
          const { LiedblattAnsicht } = await import('./liedblatt.js');
          liedblatt = new LiedblattAnsicht({
            wurzel: w, song, tr, engine, einst, speicher, symbol, setzeSymbol, handy, aktionen,
            toast: (t, ms) => ui.toast(t, ms),
            schliessen: () => aktionen.liedblattSchliessen(),
          });
        }
        blattVorher = { spurQuelle: einst.get('klang.spurQuelle') };
        await liedblatt.zeigen();
        if (bild.ruht) { bild.ruht = false; letzteBildzeit = performance.now(); requestAnimationFrame(bild); }
        if (aufDieBuehne && !liedblatt.buehne) liedblatt._buehne(true);
        if (verdeckt) liedblatt.verdecken(true);
        aktionen.blattKlang(einst.get('blatt.klang'));
      } catch (e) { console.error(e); w.classList.add('versteckt'); ui.toast('Das Liedblatt ließ sich nicht öffnen', 2600); }
    },
    liedblattSchliessen: () => {
      if (!liedblatt) return;
      liedblatt.verstecken();
      if (blattVorher && einst.get('klang.spurQuelle') !== blattVorher.spurQuelle) einst.set('klang.spurQuelle', blattVorher.spurQuelle);
      blattVorher = null;
      klangAnwenden();
      if (!textOffen()) klavierWecken();
      ui.zustandSync();
    },
    // Was beim Abspielen im Liedblatt klingt: klavier | original (Aufnahme, Klavier still) | gesang (Klavier + Gesangsspur) | stumm
    blattKlang: (art) => {
      if (!liedblatt?.sichtbar) return;
      const aufnahme = !song.transposition;
      const q = aufnahme && art === 'original' ? 'original' : aufnahme && art === 'gesang' ? 'gesang' : 'keine';
      if (einst.get('klang.spurQuelle') !== q) einst.set('klang.spurQuelle', q);
      const still = art === 'stumm' || (art === 'original' && aufnahme);
      engine.setPegel('klavier', still ? 0 : einst.get('klang.klavier'));
      if (!aufnahme && (art === 'original' || art === 'gesang')) ui.toast('Die Aufnahme gibt es nur in Des-Dur – jetzt spielt das Klavier', 2600);
    },
    uebewegAktiv: () => uw.aktiv,
    startOeffnen: () => {
      tr.pause();
      if (!startseite) startseite = new StartSeite({ wurzel: document.getElementById('startWurzel'), song, einst, speicher, engine, aktionen, handy });
      if (liedblatt?.sichtbar) aktionen.liedblattSchliessen();
      startseite.zeigen();
    },
    startZu: () => { if (!textOffen() && !blattOffen()) klavierWecken(); },
    offlineInfo: async () => {
      if (!window.tresorFrage) return 'Entwicklungsfassung (ohne Offline-Speicher).';
      const s = await window.tresorFrage({ art: 'status' });
      if (!s) return 'Offline-Stand unbekannt.';
      return s.da >= s.gesamt ? `Alles da – ${s.da} Dateien sind auf diesem Gerät gespeichert, die App läuft auch ohne Internet.`
        : `${s.da} von ${s.gesamt} Dateien gespeichert. Mit WLAN geöffnet lassen, dann lädt der Rest im Hintergrund.`;
    },
  };
  const ui = new Oberflaeche({ app, song, einst, tr, engine, buehne, uw, aktionen, phon: null });
  ui.bauen();
  updateEinrichten({ toast: (t, ms) => ui.toast(t, ms) });

  // Lautschrift fuer den Liedtext (wird nachgeladen; ohne sie geht alles andere auch)
  import('../daten/phonetik.js').then(async (m) => {
    try { m.setWortschatz?.(await (await fetch('daten/wortschatz.json')).json()); } catch { /* ohne Glossen */ }
    ui.phon = m;
    ui.zustandSync();
  }).catch(() => {});

  bereichAnwenden(); klangAnwenden(); filterAnwenden(); spurAnwenden();
  tr.setSpeed(einst.get('tempo') || 1);
  tr.metronom = einst.get('spiel.metronom');
  einst.beiAenderung((pfad) => {
    const alles = pfad === '*';
    if (alles || pfad.startsWith('ansicht.thema') || pfad === 'spiel.hand') farbeCache.clear();
    if (alles || pfad.startsWith('klang')) klangAnwenden();
    if (alles || pfad === 'klang.spurQuelle') spurAnwenden();
    if (alles || pfad === 'fassung') { if (song.fassung.id !== einst.get('fassung')) fassungWechseln(einst.get('fassung')); }
    if (alles || pfad.startsWith('baukasten')) { if (song.fassung.id === 'mix') fassungWechseln('mix'); else baukastenSetzen(song, einst.get('baukasten')); }
    if (alles || pfad === 'klang.transposition') { if ((einst.get('klang.transposition') || 0) !== song.transposition) { fassungWechseln(song.fassung.id); spurAnwenden(); } }
    if (pfad === 'ebenenVorlage' && EBENEN_VORLAGEN[einst.get('ebenenVorlage')]) einst.set('schichten', { ...EBENEN_VORLAGEN[einst.get('ebenenVorlage')] });
    if (alles || pfad.startsWith('schichten') || pfad === 'spiel.hand' || pfad === 'klang.gesangsfuehrung') filterAnwenden();
    if (alles || pfad === 'spiel.metronom') tr.metronom = einst.get('spiel.metronom');
    if (pfad.startsWith('uebeweg') && uw.aktiv) {
      tr.loopEinzaehlen = einst.get('uebeweg.pauseEinzaehlen') ? 4 : 0;
      if (pfad === 'uebeweg.laenge') { uw.beenden(); uw.starten(); }
    }
    if (alles) tr.setSpeed(einst.get('tempo') || 1);
    ui.zustandSync();
  });

  // ------------------------------------------------------------------ Beruehrung: Tasten spielen, Noten antippen/ziehen
  const finger = new Map();          // pointerId -> {art:'taste', p, stimme} | {art:'buehne', y0, t0, pos0, gezogen, lief}
  const nutzer = new Map();          // p -> {art} fuer die leuchtenden Tasten
  const spieleTaste = (p) => engine.sampler.spiele(p, 84, engine.jetzt + 0.003, null);
  // Gesten auf der Buehne: antippen = Start/Stopp · doppelt links/rechts = 10 s zurueck/vor (weitere Tipps: je 10 s mehr)
  // senkrecht ziehen = spulen · zwei Finger auseinander/zusammen = Notenstrecke zoomen · lange halten = 2-Takt-Schleife
  let tipp = {};
  let zoom = null;                    // { d0, s0 } waehrend zwei Finger auf der Buehne liegen
  const buehnenFinger = () => [...finger.values()].filter((f) => f.art === 'buehne');
  const sprungHinweis = (richtung, sek) => {
    let h = document.getElementById(richtung < 0 ? 'sprungL' : 'sprungR');
    if (!h) {
      h = document.createElement('div');
      h.id = richtung < 0 ? 'sprungL' : 'sprungR';
      h.className = `sprung ${richtung < 0 ? 'links' : 'rechts'}`;
      h.innerHTML = `<div class="sprung-inhalt"><span>${symbol(richtung < 0 ? 'zurueck' : 'weiter')}${symbol(richtung < 0 ? 'zurueck' : 'weiter')}</span><b></b></div>`;
      app.appendChild(h);
    }
    h.querySelector('b').textContent = `${sek} Sekunden`;
    h.classList.remove('an');
    void h.offsetWidth;
    h.classList.add('an');
    clearTimeout(h._t);
    h._t = setTimeout(() => h.classList.remove('an'), 650);
  };
  const springenUm = (sek) => {
    const t = Math.max(song.anfang, Math.min(song.ende - 0.5, tr.pos + sek));
    aktionen.springen(t);
  };
  const tippen = (x) => {
    const W = canvas.clientWidth || window.innerWidth;
    const zone = x < W * 0.3 ? -1 : x > W * 0.7 ? 1 : 0;
    const jetzt = performance.now();
    if (tipp.zone === zone && zone !== 0 && jetzt - tipp.zeit < 340) {
      clearTimeout(tipp.timer);
      tipp.timer = null;
      tipp.serie = (tipp.serie || 0) + 1;
      tipp.zeit = jetzt;
      springenUm(zone * 10);
      sprungHinweis(zone, tipp.serie * 10);
      return;
    }
    clearTimeout(tipp.timer);
    if (zone === 0) { tipp = {}; aktionen.umschalten(); return; }
    // erster Tipp am Rand: kurz warten, ob ein zweiter kommt (dann springen statt Start/Stopp)
    tipp = { zone, zeit: jetzt, serie: 0, timer: setTimeout(() => { tipp.timer = null; aktionen.umschalten(); }, 300) };
  };
  canvas.addEventListener('pointerdown', (ev) => {
    engine.aufwecken();
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* ohne Erfassung geht es auch */ }
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    const p = buehne.tasteBei(x, y);
    if (p != null) {
      finger.set(ev.pointerId, { art: 'taste', p, stimme: spieleTaste(p) });
      nutzer.set(p, { art: 'nutzer' });
      return;
    }
    if (y >= buehne.hitY) return;
    const f = { art: 'buehne', x0: x, y0: y, x, y, zeit0: performance.now(), pos0: tr.pos, gezogen: false, lief: tr.spielt };
    finger.set(ev.pointerId, f);
    const bf = buehnenFinger();
    if (bf.length === 2) {
      // zweiter Finger: Zoom statt Tippen/Ziehen
      for (const g of bf) { g.zoom = true; clearTimeout(g.halten); }
      clearTimeout(tipp.timer); tipp = {};
      zoom = { d0: Math.max(30, Math.hypot(bf[0].x - bf[1].x, bf[0].y - bf[1].y)), s0: einst.get('ansicht.sichtSekunden') || 3.5 };
      return;
    }
    // lange halten (ohne Bewegung): 2 Takte ab hier als Schleife – nochmal lange halten hebt sie auf
    f.halten = setTimeout(() => {
      if (f.gezogen || f.zoom || !finger.has(ev.pointerId)) return;
      f.lang = true;
      clearTimeout(tipp.timer); tipp = {};
      if (tr.loop.aktiv) { tr.loopAus(); ui.toast('Schleife aus'); }
      else {
        const b0 = Math.floor(beatAusZeit(song, tr.pos) / 4) * 4;
        tr.setLoop(zeitAusBeat(song, b0), zeitAusBeat(song, b0 + 8), true);
        ui.toast('Schleife: diese 2 Takte – nochmal lange halten hebt sie auf', 2600);
      }
      try { navigator.vibrate?.(15); } catch { /* egal */ }
      ui.zustandSync();
    }, 650);
  });
  canvas.addEventListener('pointermove', (ev) => {
    const f = finger.get(ev.pointerId);
    if (!f) return;
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (f.art === 'taste') {
      const p = buehne.tasteBei(x, y);
      if (p === f.p) return;
      engine.sampler.stoppe(f.stimme); nutzer.delete(f.p);
      if (p != null) { f.p = p; f.stimme = spieleTaste(p); nutzer.set(p, { art: 'nutzer' }); } else finger.delete(ev.pointerId);
      return;
    }
    f.x = x; f.y = y;
    if (f.zoom) {
      const bf = buehnenFinger();
      if (bf.length === 2 && zoom) {
        const d = Math.max(30, Math.hypot(bf[0].x - bf[1].x, bf[0].y - bf[1].y));
        const sek = Math.max(1.5, Math.min(8, Math.round(zoom.s0 * (zoom.d0 / d) * 10) / 10));
        if (sek !== einst.get('ansicht.sichtSekunden')) einst.set('ansicht.sichtSekunden', sek);
      }
      return;
    }
    const dy = y - f.y0;
    if (!f.gezogen && Math.abs(dy) > 10) { f.gezogen = true; clearTimeout(f.halten); clearTimeout(tipp.timer); tipp = {}; if (tr.spielt) tr.pause(); }
    if (f.gezogen) {
      const pps = buehne.hitY / Math.max(0.8, einst.get('ansicht.sichtSekunden') || 3.5);
      tr.seek(Math.max(song.anfang, Math.min(song.ende, f.pos0 + dy / pps)), { weiter: false });   // nach unten ziehen = vorwaerts
    }
  });
  const fingerWeg = (ev) => {
    const f = finger.get(ev.pointerId);
    finger.delete(ev.pointerId);
    if (!f) return;
    if (f.art === 'taste') { engine.sampler.stoppe(f.stimme); nutzer.delete(f.p); return; }
    clearTimeout(f.halten);
    if (f.zoom) {
      if (!buehnenFinger().some((g) => g.zoom)) { zoom = null; ui.toast(`Notenstrecke: ${einst.get('ansicht.sichtSekunden')} Sekunden`, 1200); }
      return;
    }
    if (f.lang) return;
    if (f.gezogen) { if (f.lief) aktionen.umschalten(); return; }
    if (ev.type === 'pointerup' && performance.now() - f.zeit0 < 450) tippen(f.x0);
  };
  canvas.addEventListener('pointerup', fingerWeg);
  canvas.addEventListener('pointercancel', fingerWeg);

  // ------------------------------------------------------------------ Bluetooth-Pedal / Tastatur
  window.addEventListener('keydown', (ev) => {
    if (!document.getElementById('textWurzel').classList.contains('versteckt')) return;   // Text-Ansicht hat eigene Tasten
    if (liedblatt?.sichtbar) return;                                                       // Liedblatt ebenso
    const z = ev.target;
    if (z && (z.tagName === 'TEXTAREA' || (z.tagName === 'INPUT' && /^(text|search|number|password|email)$/.test(z.type)))) return;
    const geklappt = einst.get('geraet.pedal') === 'geklappt' && uw.aktiv;
    switch (ev.code) {
      case 'Space': ev.preventDefault(); aktionen.umschalten(); break;
      case 'Enter': case 'NumpadEnter': if (uw.aktiv) { ev.preventDefault(); uw.werten(true); } break;
      case 'ArrowRight': case 'PageDown': ev.preventDefault(); if (ev.shiftKey) { springenUm(10); sprungHinweis(1, 10); } else if (geklappt) uw.werten(true); else aktionen.taktSprung(1); break;
      case 'ArrowLeft': case 'PageUp': ev.preventDefault(); if (ev.shiftKey) { springenUm(-10); sprungHinweis(-1, 10); } else if (geklappt) uw.werten(false); else aktionen.taktSprung(-1); break;
      case 'ArrowUp': ev.preventDefault(); aktionen.tempoAendern(0.05); break;
      case 'ArrowDown': ev.preventDefault(); aktionen.tempoAendern(-0.05); break;
      case 'KeyU': aktionen.uebewegUmschalten(); break;
      case 'KeyL': aktionen.schleifeUmschalten(); break;
      case 'KeyM': einst.set('spiel.metronom', !einst.get('spiel.metronom')); break;
      case 'KeyK': if (ev.shiftKey) stufeWaehlen('weiter'); else stilWaehlen('weiter'); break;
      case 'KeyJ': akkordModusUmschalten(); break;
      case 'Escape': ui.blattZu(); break;
      case 'KeyB': aktionen.liedblattOeffnen(); break;
      default: break;
    }
  });

  // ------------------------------------------------------------------ Bildschirm wach halten, Hintergrund
  let wach = null, wachWunsch = false, letzteAktivitaet = performance.now();
  const wachHalten = async (an) => {
    an = an && einst.get('geraet.wachHalten') && 'wakeLock' in navigator && document.visibilityState === 'visible';
    try {
      if (an && !wach) { wach = await navigator.wakeLock.request('screen'); wach.addEventListener('release', () => { wach = null; }); }
      else if (!an && wach) { const w = wach; wach = null; await w.release(); }
    } catch { wach = null; }
  };
  window.addEventListener('pointerdown', () => { letzteAktivitaet = performance.now(); }, true);
  // Hintergrund: Klavier anhalten. Der Text-Teil bleibt offen und kuemmert sich selbst um seine Wiedergabe
  // (die Unterwegs-Spur darf bei gesperrtem Bildschirm weiterlaufen).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      tr.pause();
      einst.speichernJetzt(); if (uw.etappen.length) uw.speichernJetzt();
    } else if (wachWunsch) { wach = null; wachHalten(true); }
  });
  window.addEventListener('pagehide', () => { stelleMerken(); einst.speichernJetzt(); if (uw.etappen.length) uw.speichernJetzt(); });
  // Stelle im Lied merken (alle 5 Sekunden, wenn sie sich bewegt hat)
  let gemerkt = -1;
  function stelleMerken() {
    if (Math.abs(tr.pos - gemerkt) < 1) return;
    gemerkt = tr.pos;
    einst.set('zuletzt', { pos: Math.round(tr.pos * 10) / 10, zeit: Date.now() }, { still: true });
  }
  setInterval(stelleMerken, 5000);
  tr.on('ende', () => ui.toast('Ende – antippen spielt von vorn'));

  // ------------------------------------------------------------------ Bildschleife
  const sicht = {
    noten: song.alleNoten, takte: song.takte, akkorde: song.akkorde, zeitAusBeat: song.zeitAusBeat,
    sichtbar, farbe, label, zustand: () => null,
    akkordText: (a) => akkordName(a.sym, einst.get('ansicht.akkordSystem')),
    geistText: (n) => n.silbe || null,
  };
  const steuerung = document.getElementById('steuerung');
  const textWurzel = document.getElementById('textWurzel');
  const textOffen = () => !textWurzel.classList.contains('versteckt');
  const blattOffen = () => !!liedblatt?.sichtbar;
  const startOffen = () => !!startseite?.sichtbar;
  const wachPruefen = (jetztMs) => {
    const wunsch = tr.spielt || uw.aktiv || !!textAnsicht?.aktiv?.() || !!liedblatt?.aktiv?.() || jetztMs - letzteAktivitaet < 5 * 60000;
    if (wunsch !== wachWunsch) { wachWunsch = wunsch; wachHalten(wunsch); }
  };
  // Solange der Text-Teil offen ist, ruht die Klavier-Buehne (spart Akku); nur "Bildschirm wach" laeuft weiter
  setInterval(() => { if (textOffen() || startOffen()) wachPruefen(performance.now()); }, 2000);
  const klavierWecken = () => {
    if (!bild.ruht || blattOffen()) return;
    bild.ruht = false;
    bild.sh = null;
    letzteBildzeit = performance.now();
    requestAnimationFrame(bild);
  };
  let letzteBildzeit = performance.now();
  function bild() {
    const jetztMs = performance.now();
    if (blattOffen()) {                              // Liedblatt: Klavier-Buehne ruht, Transport und Mitlaufen laufen
      const t = tr.update();
      liedblatt.tick(t);
      wachPruefen(jetztMs);
      requestAnimationFrame(bild);
      return;
    }
    if (textOffen() || startOffen()) { bild.ruht = true; wachPruefen(jetztMs); return; }
    uw.tick((jetztMs - letzteBildzeit) / 1000);
    letzteBildzeit = jetztMs;
    const sh = steuerung.offsetHeight;
    buehne.setReserve(sh + 20);
    if (sh !== bild.sh) { bild.sh = sh; document.documentElement.style.setProperty('--steuerH', `${sh}px`); }
    const t = tr.update();
    buehne.setOptionen({ ...einst.werte.ansicht, vorzeichen: song.transposition && song.kreuzTonart ? '#' : einst.werte.ansicht.vorzeichen, tonika: song.transposition, effekte: einst.werte.effekte });
    sicht.t = t;
    sicht.speed = tr.speed;
    sicht.geisterSichtbar = einst.get('ansicht.gesangslinie') && song.fassung.art === 'begleitung';
    sicht.geistVersatz = einst.get('ansicht.gesangslinieLage') === 'original' ? 0 : 12;
    sicht.nutzer = nutzer;
    sicht.vorschau = null;
    if (einst.get('ansicht.vorschau')) {
      const v = new Set();
      const bis = t + 0.45 * Math.max(0.5, tr.speed);
      const meins = einst.get('spiel.hand') !== 'nichts';
      for (const n of song.alleNoten) {
        if (n.t <= t + 0.01) continue;
        if (n.t > bis) break;
        if (!sichtbar(n) || (meins && !istMeins(n))) continue;
        v.add(n.p);
      }
      sicht.vorschau = v;
    }
    const ak = akkordBei(song, t + 0.03).akkord;
    sicht.akkordTone = ak ? akkordTone(ak.sym) : null;
    buehne.zeichnen(sicht);
    ui.update(t);
    wachPruefen(jetztMs);
    requestAnimationFrame(bild);
  }
  requestAnimationFrame(bild);

  // Womit die App startet: Startseite (iPad), Text (iPhone) oder was unter Einstellungen gewaehlt ist
  let ziel = einst.get('geraet.start') || 'auto';
  if (ziel === 'auto') ziel = handy ? 'text' : 'start';
  if (ziel === 'text') await aktionen.textOeffnen();
  else if (ziel === 'liedblatt') await aktionen.liedblattOeffnen();
  else if (ziel === 'start') aktionen.startOeffnen();
  lade.text('Fertig', 1);
  lade.weg();
  if (handy && !istStandalone()) setTimeout(() => ui.toast('Tipp: Teilen › „Zum Home-Bildschirm“ – dann ist es eine App, die auch ohne Internet läuft.', 5200), 1500);

  // iOS gibt Ton erst nach einer Beruehrung frei: freundliche Startkarte (und Hinweis zum Home-Bildschirm).
  // Startseite, Text und Liedblatt geben den Ton mit dem ersten Tipp selbst frei.
  if (ziel === 'klavier' && engine.ctx.state !== 'running') {
    const hinweis = istStandalone() ? '' : `<p class="text-hilfe" style="margin-top:22px">Tipp: Über ${symbol('teilen')} „Teilen“ und dann „Zum Home-Bildschirm“ wird daraus eine App, die auch ohne Internet läuft.</p>`;
    const k = karte(app, `<h1></h1><p></p><button class="knopf akzent startknopf" id="startLos">${symbol('play')}<span>Los geht’s</span></button>${hinweis}`);
    k.querySelector('h1').textContent = song.titel || 'Tastenlicht';
    k.querySelector('p').textContent = [song.kuenstlerin, song.fassung.name].filter(Boolean).join(' · ');
    k.querySelector('#startLos').onclick = async () => { await engine.aufwecken(); k.classList.add('weg'); setTimeout(() => k.remove(), 400); };
  }
  // alles fuer offline in den Speicher holen (der Service Worker laedt die verschluesselten Dateien nacheinander)
  if (window.tresorFrage) setTimeout(() => window.tresorFrage({ art: 'vorladen' }), 4000);
  window.__tl = { song, tr, engine, einst, buehne, ui, uw, get text() { return textAnsicht; }, get blatt() { return liedblatt; }, get start() { return startseite; } };   // fuer Pruefungen
}

if (!window.TRESOR_INFO) starten(document.getElementById('app'));
