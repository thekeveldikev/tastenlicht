// Liedblatt: der ganze Text am Stueck, die Akkorde ueber der Silbe, auf der sie wechseln – wie das Akkordblatt fuers
// iPad (werkzeuge/akkordblatt_ipad.mjs), aber in der App: anpassbar und mitlaufend.
//   * Tonart (gilt fuer die ganze App), einfache Dreiklaenge oder volle Akkorde der Begleitung, Namen englisch/deutsch
//   * Schrift gleich breit (wie das Notenblatt) oder als Fliesstext, vier Groessen, hell (Notenpult) oder dunkel
//   * Lautschrift darunter, Griffe oben, Akkord antippen = hoeren, Zeile antippen = von dort spielen
//   * Mitlaufen mit Klavier oder Aufnahme: Zeile, Silbe und Akkord leuchten, das Blatt scrollt mit
//   * Buehne: nur Text und Akkorde, gross, scrollt von selbst (auch stumm) – Bluetooth-Pedal blaettert
//   * Anpassen: Akkorde ersetzen, verschieben, entfernen, hinzufuegen und Notizen je Zeile (bleiben auf dem Geraet)
// Leck-Schutz: Diese Datei liegt OEFFENTLICH. Liedtext, Titel und Lautschrift kommen erst zur Laufzeit aus daten/.
import { zeilenSilben } from './silben.js';
import { akkordName, transponiereAkkord, akkordTone, tonartNach } from './notennamen.js';
import { zeitAusBeat, beatAusZeit } from './song.js';
import { updateBaustein } from './update.js';

export const BLATT_STANDARD = {
  voll: false,            // false = einfache Dreiklaenge (wie das PDF), true = Akkorde der Begleitung (maj7, add9, /Bass)
  system: 'en',           // 'en' = Db, Bbm · 'de' = Des, b
  art: 'mono',            // 'mono' = gleich breit wie das Notenblatt · 'text' = Fliesstext
  schrift: 'm', laut: true, griffe: true, hell: false, mitlauf: true, notizen: true,
  klang: 'original',      // was beim Abspielen klingt: klavier | original | gesang | stumm
  verdeckt: false,        // Akkorde auswendig: Namen verdeckt, antippen oder Mitlaufen deckt auf
};

// Vereinfachung auf Dreiklaenge (wie im Akkordblatt-Werkzeug): Zusaetze und Basstoene fallen weg,
// sus-Akkorde werden zum Dreiklang der Tonart. Unbekanntes faellt auf Grundton (+ moll) zurueck.
const EINFACH = {
  'Db': 'Db', 'Db(add9)': 'Db', 'Db/C': 'Db', 'Db7/Cb': 'Db', 'Db/Ab': 'Db', 'Dbmaj7/Ab': 'Db', 'Db/F': 'Db', 'Db6/F': 'Db',
  'Absus4/F': 'Db',
  'Gb': 'Gb', 'Gb(add9)': 'Gb', 'Gbsus2': 'Gb', 'Gbmaj7': 'Gb', 'Gbmaj9': 'Gb', 'Gb6': 'Gb', 'Gbmaj9(#11)': 'Gb', 'Gbmaj7(#11)': 'Gb', 'Db/Gb': 'Gb',
  'Gbm(add9)': 'Gbm', 'Gbm(add9)/Bb': 'Gbm',
  'Ab': 'Ab', 'Ab/Eb': 'Ab', 'Absus4': 'Ab', 'Absus2': 'Ab', 'Absus4/Eb': 'Ab',
  'Bbm7': 'Bbm', 'Bbm7/F': 'Bbm', 'Bbm9': 'Bbm', 'Bbm7/Ab': 'Bbm',
  'Ebm': 'Ebm', 'Ebm11': 'Ebm', 'Ebsus4': 'Ebm',
  'Fsus4': 'Fm',
};
function einfach(sym) {
  if (EINFACH[sym]) return EINFACH[sym];
  const m = /^([A-G][b#]?)(m(?!aj))?/.exec(sym || '');
  return m ? m[1] + (m[2] || '') : sym;
}

// Lautschrift zum direkten Ablesen: ohne Sonderzeichen und Silbenstriche (wie im PDF)
const LAUT_OPT = { chZeichen: 'ch', anlautKch: false, offenesAe: false, vollvokale: false, trenner: '', grossBetont: false };
const DE_TON = ['C', 'Des', 'D', 'Es', 'E', 'F', 'Ges', 'G', 'As', 'A', 'B', 'H'];
const SCHRIFT_FAKTOR = { s: 0.84, m: 1, l: 1.2, xl: 1.45 };
const AKK_RE = /^[A-G][b#]?(m(?!aj)|maj|sus|add|dim|aug|[0-9]|\(|\/|#|b|\))*[^\s]*$/;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const schluessel = (b) => Number(b).toFixed(2);
function mach(tag, klasse = '', html = '') {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (html) e.innerHTML = html;
  if (tag === 'button') e.type = 'button';
  return e;
}
function helmholtz(p) {
  const n = DE_TON[((p % 12) + 12) % 12];
  const okt = Math.floor(p / 12) - 1;
  if (okt >= 4) return n.toLowerCase() + '′'.repeat(okt - 3);
  if (okt === 3) return n.toLowerCase();
  return n;
}
// Vorzeichen als kleine Grafik statt Schriftzeichen (iOS malt manche Zeichen bunt) – je 1 Zeichen breit
const VZ_B = '<svg class="lb-vz" viewBox="0 0 10 20" aria-hidden="true"><path d="M3 2v14.5c2.6-1.2 5-2.6 5-5.2 0-1.8-1.5-2.6-3-2.2-.8.2-1.4.6-2 1.1"/></svg>';
const VZ_K = '<svg class="lb-vz" viewBox="0 0 10 20" aria-hidden="true"><path d="M3.5 3v15M6.5 2v15M1.5 8.5l7-2M1.5 14l7-2"/></svg>';
function nameHtml(name) {
  return esc(name).replace(/([A-G])b/g, `$1${VZ_B}`).replace(/#/g, VZ_K);
}

// Kleine Klaviatur (2 Oktaven ab C) mit hervorgehobenen Toenen; grund = Grundton (orange), bass = Basston (blau)
function klaviatur(toene, grund, bass = null) {
  const W = [0, 2, 4, 5, 7, 9, 11], S = [1, 3, 6, 8, 10], SX = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
  const an = new Set(toene);
  let h = '<svg class="lb-tasten" viewBox="0 0 141 46" aria-hidden="true">';
  for (let o = 0; o < 2; o++) {
    W.forEach((pc, i) => {
      const p = o * 12 + pc, x = (o * 7 + i) * 10 + 0.5;
      const k = p === bass ? ' bass' : an.has(p) ? (p === grund ? ' an grund' : ' an') : '';
      h += `<rect class="w${k}" x="${x}" y="0.5" width="10" height="45" rx="1.5"/>`;
    });
  }
  for (let o = 0; o < 2; o++) {
    S.forEach((pc) => {
      const p = o * 12 + pc, x = (o * 7 + SX[pc]) * 10 - 3;
      const k = p === bass ? ' bass' : an.has(p) ? (p === grund ? ' an grund' : ' an') : '';
      h += `<rect class="s${k}" x="${x}" y="0.5" width="6.4" height="28" rx="1"/>`;
    });
  }
  return h + '</svg>';
}

// Griff in Grundstellung: Toene ab dem Grundton aufwaerts (innerhalb von 2 Oktaven ab C), Basston extra
function griff(sym) {
  const pcs = akkordTone(sym);
  const m = /^([A-G][b#]?)[^/]*(?:\/([A-G][b#]?))?$/.exec(sym || '');
  if (!pcs.length || !m) return null;
  const pc = (n) => ({ C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 }[n]);
  const g = pc(m[1]);
  const bass = m[2] != null ? pc(m[2]) : null;
  const oben = pcs.filter((x) => x !== bass || x === g).map((x) => (x - g + 12) % 12).sort((a, b) => a - b).map((iv) => g + iv);
  return { grund: g, toene: oben, bass, noten: oben.map((p) => DE_TON[p % 12]) };
}

// ====================================================================================================== Modell
// Akkorde den Silben zuordnen (gleiche Regeln wie das Akkordblatt-Werkzeug). Arbeitet in der Grundtonart (Des-Dur).
export function liedblattModell(song, { voll = false, eigen = {} } = {}) {
  const begl = song.fassungen.find((f) => f.id === 'begl1') || {};
  const teile = (begl.abschnitte || song._grund.abschnitte).map((a) => ({ ...a }));
  const gesangSpur = song._grund.spuren.find((s) => s.id === 'gesang');
  const gesang = gesangSpur ? gesangSpur.noten : [];
  const roh = (begl.akkorde || song._grund.akkorde || []).slice().sort((a, b) => a.b - b.b);

  let akkorde = [];
  for (const a of roh) {
    const sym = voll ? a.sym : einfach(a.sym);
    const letzte = akkorde[akkorde.length - 1];
    if (letzte && letzte.sym === sym) { letzte.d = a.b + a.d - letzte.b; continue; }
    akkorde.push({ b: a.b, d: a.d, sym, orig: sym });
  }
  // eigene Anpassungen: ersetzen, entfernen, verschieben (Schluessel = Schlag des Akkordwechsels)
  const E = eigen || {};
  for (const a of akkorde) {
    a.id = schluessel(a.b);
    const e = E.akk && E.akk[a.id];
    if (!e) continue;
    if (e.weg) a.weg = true;
    if (e.sym) { a.sym = e.sym; a.eigen = true; }
    if (e.schritt) { a.schritt = e.schritt; a.eigen = true; }
  }
  akkorde = akkorde.filter((a) => !a.weg);
  for (const n of E.neu || []) {
    if (!n || n.b == null || !n.sym) continue;
    const id = 'n' + schluessel(n.b);
    const e = E.akk && E.akk[id];
    if (e && e.weg) continue;
    akkorde.push({ b: n.b, d: 0, sym: (e && e.sym) || n.sym, orig: null, id, eigen: true, neu: true, schritt: e && e.schritt });
  }
  akkorde.sort((a, b) => a.b - b.b);
  akkorde.forEach((a, i) => { const n = akkorde[i + 1]; if (n) a.d = Math.max(a.d, n.b - a.b); a.t = zeitAusBeat(song, a.b); a.index = i; });

  const zeilen = [];
  for (const z0 of song.zeilen || []) {
    const noten = gesang.filter((n) => n.z === z0.nr).sort((a, b) => a.b - b.b);
    const onsets = noten.filter((n) => n.s).map((n) => n.b);
    const silben = zeilenSilben(z0.text).map((s) => ({ ...s }));
    if (!silben.length) continue;
    if (onsets.length === silben.length) silben.forEach((s, i) => { s.b = onsets[i]; });
    else {
      const a = noten.length ? noten[0].b : 0, e = noten.length ? Math.max(...noten.map((n) => n.b + n.d)) : a + 4;
      silben.forEach((s, i) => { s.b = a + (i / silben.length) * (e - a); });
    }
    zeilen.push({
      nr: z0.nr, text: z0.text, summen: !!z0.summen, silben,
      anfang: silben[0].b, ende: noten.length ? Math.max(...noten.map((n) => n.b + n.d)) : silben[0].b + 2,
      ch: silben.map(() => []), zwischen: silben.map(() => []), vorne: [], hinten: [],
    });
  }

  const taktVon = (b) => Math.floor(b / 4) + 1;
  const teilVonTakt = (t) => teile.find((a) => t >= a.von && t <= a.bis) || teile[teile.length - 1];
  for (const z of zeilen) {
    const zaehl = new Map();
    for (const s of z.silben) { const t = teilVonTakt(taktVon(s.b)); zaehl.set(t, (zaehl.get(t) || 0) + 1); }
    let best = null, n = -1;
    for (const [t, k] of zaehl) if (k >= n) { best = t; n = k; }
    z.teil = best;
  }

  const instrumental = new Set();
  if (akkorde.length) {
    const erst = taktVon(akkorde[0].b), letzt = taktVon(akkorde[akkorde.length - 1].b + akkorde[akkorde.length - 1].d - 0.01);
    for (let t = erst; t <= letzt; t++) {
      const a = (t - 1) * 4, e = a + 4;
      if (!zeilen.some((z) => z.anfang < e - 0.75 && z.ende > a + 0.75)) instrumental.add(t);
    }
  }
  const zeileFuer = (b) => zeilen.find((z) => b >= z.anfang - 0.5 && b < z.ende - 0.01);
  for (const ak of akkorde) {
    const b = ak.b;
    const z = zeileFuer(b);
    if (z) {
      let best = -1, abst = 0.351;
      z.silben.forEach((s, i) => { const d = Math.abs(s.b - b); if (d < abst) { abst = d; best = i; } });
      if (best >= 0) z.ch[best].push(ak);
      else if (b < z.anfang) z.ch[0].push(ak);
      else { let i = 0; z.silben.forEach((s, k) => { if (s.b < b) i = k; }); z.zwischen[i].push(ak); }
      ak.zeile = z.nr;
      continue;
    }
    if (instrumental.has(taktVon(b))) { ak.instrumental = true; continue; }
    const vor = [...zeilen].reverse().find((x) => x.ende <= b + 0.01);
    const nach = zeilen.find((x) => x.anfang > b);
    const zumVorigen = vor && (!nach || (b - vor.ende < nach.anfang - b && vor.teil === teilVonTakt(taktVon(b))));
    if (zumVorigen) { vor.hinten.push(ak); ak.zeile = vor.nr; } else if (nach) { nach.vorne.push(ak); ak.zeile = nach.nr; } else ak.instrumental = true;
  }
  // eigene Verschiebung um Silben (innerhalb der Zeile)
  for (const z of zeilen) {
    const alle = [];
    z.ch.forEach((l, i) => l.forEach((a) => alle.push([a, i, 'ch'])));
    z.zwischen.forEach((l, i) => l.forEach((a) => alle.push([a, i + 0.5, 'zw'])));
    for (const [a, pos, art] of alle) {
      if (!a.schritt) continue;
      const ziel = Math.max(0, Math.min(z.silben.length - 1, Math.round(pos + a.schritt - (art === 'zw' ? 0.5 : 0))));
      const liste = art === 'ch' ? z.ch[Math.round(pos)] : z.zwischen[Math.round(pos - 0.5)];
      liste.splice(liste.indexOf(a), 1);
      z.ch[ziel].push(a);
    }
  }

  // Reihen je Liedteil: Textzeilen + Takte ohne Gesang (je hoechstens 4 nebeneinander)
  const reihen = new Map(teile.map((t) => [t, []]));
  for (const z of zeilen) (reihen.get(z.teil) || reihen.get(teile[0])).push({ art: 'zeile', b: z.vorne.length ? z.vorne[0].b : z.anfang, z });
  const freie = [...instrumental].sort((a, b) => a - b);
  let gruppe = [];
  const abschliessen = () => {
    for (let i = 0; i < gruppe.length; i += 4) {
      const st = gruppe.slice(i, i + 4);
      reihen.get(teilVonTakt(st[0])).push({ art: 'takte', b: (st[0] - 1) * 4, takte: st });
    }
    gruppe = [];
  };
  for (const t of freie) {
    if (gruppe.length && (t !== gruppe[gruppe.length - 1] + 1 || teilVonTakt(t) !== teilVonTakt(gruppe[0]))) abschliessen();
    gruppe.push(t);
  }
  abschliessen();
  const abschnitte = teile.map((t) => ({ teil: t, name: String(t.name || '').replace(/\s*–.*$/, '').replace(/\s*\(.*\)$/, ''), reihen: reihen.get(t).sort((a, b) => a.b - b.b) }))
    .filter((x) => x.reihen.length);
  // Ende jeder Reihe = Anfang der naechsten (fuers Mitlaufen)
  const flach = abschnitte.flatMap((x) => x.reihen);
  flach.forEach((r, i) => {
    r.bEnde = flach[i + 1] ? flach[i + 1].b : r.b + 16;
    r.t = zeitAusBeat(song, r.b);
  });
  const einsatz = gesang.slice().sort((a, b) => a.b - b.b)[0];
  return { akkorde, zeilen, abschnitte, reihen: flach, einsatz, namen: [...new Set(akkorde.map((a) => a.sym))] };
}

// ====================================================================================================== Ansicht
export class LiedblattAnsicht {
  constructor({ wurzel, song, tr, engine, einst, speicher, symbol, setzeSymbol, toast, aktionen, handy = false, schliessen }) {
    Object.assign(this, { wurzel, song, tr, engine, einst, speicher, symbol, setzeSymbol, aktionen, handy });
    this.toast = toast || (() => {});
    this.schliessen = schliessen || (() => {});
    this.sichtbar = false;
    this.gebaut = false;
    this.phon = null;
    this.modell = null;
    this.chips = new Map();          // Akkord-Index -> [Elemente]
    this.reihenEl = [];              // [{ r, el }]
    this.aktivReihe = -1;
    this.aktivAkkord = -1;
    this.aktivSilbe = null;
    this.bearbeiten = false;
    this.buehne = false;
    this._scrollZeit = 0;
    this._autoScroll = false;
    this.eigen = this._eigenLesen();
    this.aufgedeckt = new Set();       // Akkorde auswendig: schon aufgedeckte Akkorde (Index)
    this.quiz = { getippt: 0 };
  }

  wert(p) {
    const v = this.einst.get('blatt.' + p);
    return v === undefined || v === null ? BLATT_STANDARD[p] : v;
  }
  setze(p, v) { this.einst.set('blatt.' + p, v); }

  _eigenLesen() {
    const e = this.speicher.lesen('blatt_eigen', null);
    return e && typeof e === 'object' ? { akk: e.akk || {}, neu: Array.isArray(e.neu) ? e.neu : [], notiz: e.notiz || {} } : { akk: {}, neu: [], notiz: {} };
  }
  _eigenSpeichern() { this.speicher.schreiben('blatt_eigen', this.eigen); }
  _eigenAnzahl() {
    return Object.keys(this.eigen.akk).length + this.eigen.neu.length + Object.values(this.eigen.notiz).filter(Boolean).length;
  }

  // ------------------------------------------------------------------------------------ Start / Zeigen
  async start() {
    if (this.gebaut) return;
    this.wurzel.innerHTML = '<div class="lb-laden">Liedblatt wird gesetzt …</div>';
    try {
      const phon = await import('../daten/phonetik.js');
      try { phon.setWortschatz?.(await (await fetch('daten/wortschatz.json')).json()); } catch { /* ohne Wortschatz */ }
      this.phon = phon;
    } catch (e) { console.warn('Liedblatt: ohne Lautschrift', e); }
    this._bauen();
    this.gebaut = true;
    this.einst.beiAenderung((p) => this._einstGeaendert(p));
    window.addEventListener('resize', () => { if (this.sichtbar) this._entzerrenSpaeter(); });
    window.addEventListener('keydown', (e) => this._taste(e));
  }

  async zeigen() {
    this.sichtbar = true;
    this.wurzel.classList.remove('versteckt');
    await this.start();
    this._setzen();
    this._kopfSync();
    this._leisteSync();
    this.aktivReihe = -1;
    this.tick(this.tr.pos, true);
  }

  verstecken() {
    this.sichtbar = false;
    this._popZu();
    this._einstZu();
    if (this.buehne) this._buehne(false);
    this.wurzel.classList.add('versteckt');
  }

  // ------------------------------------------------------------------------------------ Geruest
  _bauen() {
    this.wurzel.innerHTML = `
<div class="lb-app">
  <header class="lb-kopf">
    <button class="knopf rund" data-a="zurueck" aria-label="Zurück"></button>
    <div class="lb-marke"><div class="lb-titel"></div><div class="lb-unter"></div></div>
    <span class="lb-frei"></span>
    <div class="lb-tonart" aria-label="Tonart">
      <button class="knopf rund" data-a="tiefer" aria-label="Einen Halbton tiefer"></button>
      <button class="lb-ton" data-a="tonart"></button>
      <button class="knopf rund" data-a="hoeher" aria-label="Einen Halbton höher"></button>
    </div>
    <button class="knopf lb-k-text" data-a="verdecken"></button>
    <button class="knopf lb-k-text" data-a="bearbeiten"></button>
    <button class="knopf lb-k-text" data-a="buehne"></button>
    <button class="knopf rund" data-a="einst" aria-label="Darstellung"></button>
  </header>
  <div class="lb-griffe"></div>
  <main class="lb-blatt"><div class="lb-druckkopf"></div><div class="lb-inhalt"></div><div class="lb-ende"></div></main>
  <footer class="lb-leiste glas">
    <button class="knopf gross akzent rund lb-play" data-a="play" aria-label="Abspielen"></button>
    <div class="lb-jetzt"><span class="lb-jetzt-ak"></span><span class="lb-dann"><small>dann</small> <b></b></span><span class="lb-punkte"><i></i><i></i><i></i><i></i></span></div>
    <div class="lb-info"><span class="lb-teilname"></span><span class="lb-zeit"></span></div>
    <span class="lb-frei"></span>
    <div class="segmente lb-klang" aria-label="Klang"></div>
    <button class="knopf lb-tempo" data-a="tempo"></button>
    <button class="knopf rund" data-a="mitlauf" aria-label="Mitlaufen"></button>
  </footer>
  <div class="lb-buehne-knoepfe">
    <button class="knopf rund gross" data-a="play" aria-label="Abspielen"></button>
    <button class="knopf rund" data-a="kleiner" aria-label="Kleiner"></button>
    <button class="knopf rund" data-a="groesser" aria-label="Größer"></button>
    <button class="knopf rund" data-a="buehne" aria-label="Bühne beenden"></button>
  </div>
  <div class="lb-hinweis versteckt"></div>
  <div class="lb-zaehler"></div>
  <aside class="lb-einst glas" aria-modal="true"><div class="lb-einst-kopf"><h2>Darstellung</h2><button class="knopf rund" data-a="einstZu" aria-label="Schließen"></button></div><div class="lb-einst-inhalt"></div></aside>
  <div class="lb-pop glas versteckt" role="dialog"></div>
</div>`;
    const q = (s) => this.wurzel.querySelector(s);
    this.r = {
      app: q('.lb-app'), titel: q('.lb-titel'), unter: q('.lb-unter'), ton: q('.lb-ton'), griffe: q('.lb-griffe'), blatt: q('.lb-blatt'),
      inhalt: q('.lb-inhalt'), druckkopf: q('.lb-druckkopf'), leiste: q('.lb-leiste'), jetzt: q('.lb-jetzt-ak'), dann: q('.lb-dann b'),
      dannBox: q('.lb-dann'), punkte: [...this.wurzel.querySelectorAll('.lb-punkte i')], teilname: q('.lb-teilname'), zeit: q('.lb-zeit'),
      klang: q('.lb-klang'), tempo: q('.lb-tempo'), zaehler: q('.lb-zaehler'), einst: q('.lb-einst'), einstInhalt: q('.lb-einst-inhalt'), pop: q('.lb-pop'), hinweis: q('.lb-hinweis'),
    };
    const S = (sel, name, text) => { for (const b of this.wurzel.querySelectorAll(sel)) this.setzeSymbol(b, name, text); };
    S('[data-a="zurueck"]', 'zurueck');
    S('[data-a="tiefer"]', 'minus');
    S('[data-a="hoeher"]', 'plus');
    S('[data-a="einst"]', 'zahnrad');
    S('[data-a="einstZu"]', 'kreuz');
    S('.lb-buehne-knoepfe [data-a="kleiner"]', 'minus');
    S('.lb-buehne-knoepfe [data-a="groesser"]', 'plus');
    S('.lb-buehne-knoepfe [data-a="buehne"]', 'kreuz');
    for (const [w, n] of [['klavier', 'Klavier'], ['original', 'Aufnahme'], ['gesang', '+ Gesang'], ['stumm', 'Stumm']]) {
      const b = mach('button', '', esc(n));
      b.dataset.wert = w;
      b.onclick = () => this._klang(w);
      this.r.klang.appendChild(b);
    }
    this.r.app.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b && this.r.app.contains(b)) { e.stopPropagation(); this._aktion(b.dataset.a, b); }
    });
    // Nutzer scrollt selbst: Mitlaufen kurz pausieren
    const selbst = () => { this._scrollZeit = performance.now(); };
    this.r.blatt.addEventListener('touchstart', selbst, { passive: true });
    this.r.blatt.addEventListener('wheel', selbst, { passive: true });
    this.r.blatt.addEventListener('scroll', () => { if (!this._autoScroll) this._popZu(); }, { passive: true });
    this.r.app.addEventListener('pointerdown', (e) => {
      if (this.buehne) this._buehnenKnoepfeZeigen();
      if (!this.r.pop.classList.contains('versteckt') && !this.r.pop.contains(e.target) && !e.target.closest('.lb-ak, .lb-s, .lb-notiz-knopf, .lb-griff')) this._popZu();
    }, true);
  }

  _aktion(a, el) {
    switch (a) {
      case 'zurueck': this.tr.pause(); this.schliessen(); break;
      case 'tiefer': this._tonart((this.song.transposition || 0) - 1); break;
      case 'hoeher': this._tonart((this.song.transposition || 0) + 1); break;
      case 'tonart': this._tonartWahl(el); break;
      case 'bearbeiten': this._bearbeiten(!this.bearbeiten); break;
      case 'verdecken': this.verdecken(!this.wert('verdeckt')); break;
      case 'buehne': this._buehne(!this.buehne); break;
      case 'einst': this._einstAuf(); break;
      case 'einstZu': this._einstZu(); break;
      case 'play': this.aktionen.umschalten(); this._leisteSync(); break;
      case 'tempo': this._tempoWahl(el); break;
      case 'mitlauf': this.setze('mitlauf', !this.wert('mitlauf')); this.toast(this.wert('mitlauf') ? 'Mitlaufen an' : 'Mitlaufen aus'); break;
      case 'kleiner': case 'groesser': {
        const reihe = ['s', 'm', 'l', 'xl'];
        const i = Math.max(0, Math.min(3, reihe.indexOf(this.wert('schrift')) + (a === 'groesser' ? 1 : -1)));
        this.setze('schrift', reihe[i]);
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------------------------ Einstellungen
  _einstGeaendert(p) {
    if (!this.gebaut) return;
    if (p === 'klang.transposition' || p === 'fassung' || p === '*') { if (this.sichtbar) { this._setzen(); this._kopfSync(); } else this._veraltet = true; return; }
    if (p === 'tempo' || p.startsWith('klang')) { this._leisteSync(); return; }
    if (!p.startsWith('blatt.')) return;
    const k = p.slice(6);
    if (['voll'].includes(k)) { this.modell = null; }
    if (k === 'verdeckt') { this._setzen(); this._quizStand(); }
    if (['voll', 'system', 'art', 'schrift', 'laut', 'notizen', 'griffe', 'hell'].includes(k)) { if (this.sichtbar) this._setzen(); else this._veraltet = true; }
    this._kopfSync();
    this._leisteSync();
    if (this.r.einst.classList.contains('lb-offen')) this._einstBauen();
  }

  _einstAuf() {
    this._popZu();
    this._einstBauen();
    this.r.einst.classList.add('lb-offen');
  }
  _einstZu() { if (this.r) this.r.einst.classList.remove('lb-offen'); }

  _einstBauen() {
    const box = this.r.einstInhalt;
    const oben = box.scrollTop;
    box.innerHTML = '';
    const titel = (t) => box.appendChild(mach('div', 'abschnittstitel', esc(t)));
    const segment = (liste, akt, fn) => {
      const s = mach('div', 'segmente lb-seg');
      for (const [w, n] of liste) {
        const b = mach('button', String(w) === String(akt) ? 'an' : '', esc(n));
        b.onclick = () => fn(w);
        s.appendChild(b);
      }
      box.appendChild(s);
    };
    const schalter = (titelText, hilfe, pfad) => {
      const f = mach('div', 'feld', '<label></label><label class="schalter"><input type="checkbox"><span></span></label>');
      const lab = f.querySelector('label');
      lab.textContent = titelText;
      if (hilfe) { const h = mach('span', 'hilfe'); h.textContent = hilfe; lab.appendChild(h); }
      const inp = f.querySelector('input');
      inp.checked = !!this.wert(pfad);
      inp.setAttribute('aria-label', titelText);
      inp.onchange = () => this.setze(pfad, inp.checked);
      lab.onclick = () => { inp.checked = !inp.checked; this.setze(pfad, inp.checked); };
      box.appendChild(f);
    };
    // iPhone: die Modi stehen hier statt im (schmalen) Kopf
    const modi = mach('div', 'lb-reihe lb-modi');
    const modus = (text, sym, an, fn) => { const b = mach('button', `knopf${an ? ' an' : ''}`); this.setzeSymbol(b, sym, text); b.onclick = () => { this._einstZu(); fn(); }; modi.appendChild(b); };
    modus(this.wert('verdeckt') ? 'Aufdecken' : 'Auswendig', 'auge', this.wert('verdeckt'), () => this.verdecken(!this.wert('verdeckt')));
    modus(this.bearbeiten ? 'Fertig' : 'Anpassen', 'stift', this.bearbeiten, () => this._bearbeiten(!this.bearbeiten));
    modus('Bühne', 'vollbild', false, () => this._buehne(true));
    box.appendChild(modi);
    titel('Tonart');
    const k = this.song.transposition || 0;
    segment([[0, 'Des-Dur (Aufnahme)'], [-1, 'C-Dur (leichter)']], k, (w) => this._tonart(w));
    box.appendChild(mach('div', 'text-hilfe lb-hilfe', 'Gilt für die ganze App. Die Aufnahme läuft nur in Des-Dur mit – in anderen Tonarten spielt das Klavier.'));
    titel('Beim Abspielen');
    segment([['klavier', 'Klavier'], ['original', 'Aufnahme'], ['gesang', 'Klavier + Gesang'], ['stumm', 'Stumm (nur mitlaufen)']], this.wert('klang'), (w) => this._klang(w));
    titel('Akkorde');
    segment([[false, 'Einfach (Dreiklänge)'], [true, 'Voll (wie gespielt)']], this.wert('voll'), (w) => this.setze('voll', w));
    segment([['en', 'Db, Bbm'], ['de', 'Des, b']], this.wert('system'), (w) => this.setze('system', w));
    titel('Schrift');
    segment([['mono', 'Wie das Notenblatt'], ['text', 'Fließtext']], this.wert('art'), (w) => this.setze('art', w));
    segment([['s', 'Klein'], ['m', 'Mittel'], ['l', 'Groß'], ['xl', 'Sehr groß']], this.wert('schrift'), (w) => this.setze('schrift', w));
    titel('Anzeigen');
    schalter('Lautschrift unter dem Text', 'Grün = so sprichst du es, deutsch gelesen. Unterstrichen = betonte Silbe.', 'laut');
    schalter('Griffe oben', 'Die Akkorde als kleine Klaviatur – antippen zum Hören.', 'griffe');
    schalter('Meine Notizen', '', 'notizen');
    schalter('Helles Blatt', 'Wie Papier – gut auf dem Notenpult bei Tageslicht.', 'hell');
    schalter('Mitlaufen', 'Zeile, Silbe und Akkord leuchten, das Blatt scrollt mit.', 'mitlauf');
    titel('Eigene Akkorde und Notizen');
    const n = this._eigenAnzahl();
    box.appendChild(mach('div', 'text-hilfe lb-hilfe', n ? `${n} eigene Änderung${n === 1 ? '' : 'en'} gespeichert (nur auf diesem Gerät). Ändern über „Anpassen“ oben.` : 'Noch nichts angepasst. Über „Anpassen“ oben kannst du Akkorde ersetzen, verschieben, entfernen, hinzufügen und Notizen schreiben.'));
    const reihe = mach('div', 'lb-reihe');
    const druck = mach('button', 'knopf');
    this.setzeSymbol(druck, 'teilen', 'Drucken / PDF');
    druck.onclick = () => this._drucken();
    reihe.appendChild(druck);
    if (n) {
      const weg = mach('button', 'knopf');
      this.setzeSymbol(weg, 'wiederholen', 'Alles zurücksetzen');
      weg.onclick = () => {
        if (!confirm('Alle eigenen Akkorde und Notizen löschen?')) return;
        this.eigen = { akk: {}, neu: [], notiz: {} };
        this._eigenSpeichern();
        this.modell = null;
        this._setzen();
        this._einstBauen();
        this.toast('Zurückgesetzt – wieder wie das Original');
      };
      reihe.appendChild(weg);
    }
    box.appendChild(reihe);
    box.appendChild(mach('div', 'text-hilfe lb-hilfe', 'Bluetooth-Pedal: rechts/unten blättert weiter, links/oben zurück, Leertaste startet und stoppt.'));
    titel('App');
    box.appendChild(updateBaustein());
    box.scrollTop = oben;
  }

  // ------------------------------------------------------------------------------------ Tonart, Klang, Tempo
  _tonart(k) {
    k = Math.max(-11, Math.min(11, Math.round(k)));
    if (k > 6) k -= 12;
    if (k < -6) k += 12;
    this.einst.set('klang.transposition', k);
  }

  _tonartWahl(anker) {
    const k0 = this.song.transposition || 0;
    const pop = this._popAuf(anker, 'lb-pop-tonart');
    pop.appendChild(mach('div', 'lb-pop-titel', 'Tonart'));
    const gitter = mach('div', 'lb-pop-gitter');
    for (let k = -6; k <= 5; k++) {
      const t = tonartNach(k);
      const b = mach('button', `lb-wahl${k === k0 ? ' an' : ''}`, esc(t.name.replace('-Dur', '')) + (k === 0 ? '<small>Aufnahme</small>' : k === -1 ? '<small>leichter</small>' : `<small>${k > 0 ? '+' : ''}${k}</small>`));
      b.onclick = () => { this._popZu(); this._tonart(k); };
      gitter.appendChild(b);
    }
    pop.appendChild(gitter);
    this._popPlatzieren(anker);
  }

  _klang(art) {
    this.setze('klang', art);
    this.aktionen.blattKlang?.(art);
    this._leisteSync();
  }

  _tempoWahl(anker) {
    const pop = this._popAuf(anker, 'lb-pop-tempo');
    pop.appendChild(mach('div', 'lb-pop-titel', 'Tempo'));
    const gitter = mach('div', 'lb-pop-gitter');
    for (const s of [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1]) {
      const b = mach('button', `lb-wahl${Math.abs(this.tr.speed - s) < 0.01 ? ' an' : ''}`, `${Math.round(s * 100)} %<small>${Math.round(this.song.bpm * s)} BPM</small>`);
      b.onclick = () => { this._popZu(); this.aktionen.tempoSetzen(s); this._leisteSync(); };
      gitter.appendChild(b);
    }
    pop.appendChild(gitter);
    this._popPlatzieren(anker);
  }

  // ------------------------------------------------------------------------------------ Kopf und Leiste
  _kopfSync() {
    if (!this.r) return;
    const s = this.song;
    const k = s.transposition || 0;
    this.r.titel.textContent = s.titel || 'Liedblatt';
    const einsatz = this.modell && this.modell.einsatz ? ` · Einsatz ${helmholtz(this.modell.einsatz.p + k)}` : '';
    this.r.unter.textContent = `${s.tonartName || 'Des-Dur'}${k === 0 ? ' wie die Aufnahme' : k === -1 ? ' – leichter, ½ Ton tiefer' : ''} · ${Math.round(s.bpm)} BPM${einsatz}`;
    this.r.ton.innerHTML = `${esc((s.tonartName || 'Des-Dur').replace('-Dur', ''))}<small>Tonart</small>`;
    const kb = this.wurzel.querySelector('.lb-kopf [data-a="bearbeiten"]');
    this.setzeSymbol(kb, 'stift', this.bearbeiten ? 'Fertig' : 'Anpassen');
    kb.classList.toggle('an', this.bearbeiten);
    this.setzeSymbol(this.wurzel.querySelector('.lb-kopf [data-a="buehne"]'), 'vollbild', 'Bühne');
    const kv = this.wurzel.querySelector('.lb-kopf [data-a="verdecken"]');
    this.setzeSymbol(kv, 'auge', this.wert('verdeckt') ? 'Aufdecken' : 'Auswendig');
    kv.classList.toggle('an', !!this.wert('verdeckt'));
    this.r.app.classList.toggle('lb-hell', !!this.wert('hell'));
    this.r.app.classList.toggle('lb-bearbeiten', this.bearbeiten);
    this.r.app.dataset.art = this.wert('art');
  }

  _leisteSync() {
    if (!this.r) return;
    const spielt = this.tr.spielt;
    for (const b of this.wurzel.querySelectorAll('[data-a="play"]')) {
      if (b.dataset.zustand !== String(spielt)) { b.dataset.zustand = String(spielt); this.setzeSymbol(b, spielt ? 'pause' : 'play'); }
    }
    const k = this.wert('klang');
    for (const b of this.r.klang.children) b.classList.toggle('an', b.dataset.wert === k);
    this.r.tempo.innerHTML = `${this.symbol('schildkroete')}<span>${Math.round(this.tr.speed * 100)} %</span>`;
    const m = this.wurzel.querySelector('[data-a="mitlauf"]');
    this.setzeSymbol(m, this.wert('mitlauf') ? 'pfad' : 'liste');
    m.classList.toggle('an', !!this.wert('mitlauf'));
    m.setAttribute('aria-label', this.wert('mitlauf') ? 'Mitlaufen an' : 'Mitlaufen aus');
  }

  // ------------------------------------------------------------------------------------ Setzen
  _name(sym) {
    const k = this.song.transposition || 0;
    return akkordName(transponiereAkkord(sym, k, !!this.song.kreuzTonart), this.wert('system'));
  }

  _laut(zeile) {
    // Lautschrift je Leerzeichen-Wort (Satzzeichen bleiben am Wort) -> [{ text, betont: [[von, bis]] }]
    if (!this.phon) return null;
    let r;
    try { r = this.phon.respellLine(zeile, LAUT_OPT); } catch { return null; }
    const out = [];
    const re = /\S+/g; let m;
    while ((m = re.exec(zeile))) {
      const a = m.index, e = a + m[0].length;
      let text = '', betont = [];
      for (const w of r.words.filter((x) => x.start >= a && x.end <= e)) {
        if (w.isWord && w.syllables && w.syllables.length >= 2) {
          for (const s of w.syllables) {
            if (s.stressed) betont.push([[...text].length, [...text].length + [...s.de].length]);
            text += s.de;
          }
        } else text += w.de || '';
      }
      if (/^z$/i.test(m[0])) { text = 'ts'; betont = []; }
      out.push({ text: text || m[0], betont });
    }
    return out;
  }

  _setzen() {
    if (!this.r) return;
    this._veraltet = false;
    if (!this.modell) this.modell = liedblattModell(this.song, { voll: this.wert('voll'), eigen: this.eigen });
    const M = this.modell;
    this._kopfSync();
    const box = this.r.inhalt;
    box.innerHTML = '';
    this.chips = new Map();
    this.reihenEl = [];
    this.aktivReihe = -1;
    this.aktivAkkord = -1;
    this.aktivSilbe = null;
    // Schriftgroesse: an die Breite angepasst, dann Stufe
    const breite = Math.max(300, this.r.blatt.clientWidth || window.innerWidth);
    const basis = Math.max(15, Math.min(25, breite / (this.handy ? 22 : 40)));
    this.r.app.style.setProperty('--lb-f', `${(basis * (SCHRIFT_FAKTOR[this.wert('schrift')] || 1)).toFixed(1)}px`);
    this.r.app.dataset.art = this.wert('art');

    // Griffe
    const g = this.r.griffe;
    g.innerHTML = '';
    g.classList.toggle('versteckt', !this.wert('griffe'));
    if (this.wert('griffe')) {
      for (const sym of M.namen) {
        const tsym = transponiereAkkord(sym, this.song.transposition || 0, !!this.song.kreuzTonart);
        const gr = griff(tsym);
        if (!gr) continue;
        const kn = mach('button', 'lb-griff', `<span class="lb-gname">${nameHtml(this._name(sym))}</span>${klaviatur(gr.toene, gr.grund, gr.bass)}<span class="lb-gnoten">${esc(gr.noten.join(' · '))}${gr.bass != null ? ` · Bass ${esc(DE_TON[gr.bass])}` : ''}</span>`);
        kn.onclick = () => this._akkordHoeren(tsym);
        g.appendChild(kn);
      }
    }
    // Spickzettel: Muster des gewaehlten Begleit-Stils
    const sb = (this.song.stile || []).find((x) => x.id === this.song.fassung.stil)?.steckbrief;
    if (sb && this.wert('griffe')) {
      const m = mach('div', 'lb-muster', '<b></b><span></span>');
      m.querySelector('b').textContent = this.song.fassung.name;
      m.querySelector('span').textContent = sb.muster;
      g.appendChild(m);
    }
    // Druckkopf (nur auf Papier sichtbar)
    this.r.druckkopf.innerHTML = `<h1>${esc(this.song.titel || '')} <span>Akkorde</span></h1><p>${esc([this.song.kuenstlerin, this.song.tonartName, `${Math.round(this.song.bpm)} BPM · 4/4`].filter(Boolean).join(' · '))}</p>`;

    const laut = !!this.wert('laut');
    const notizen = !!this.wert('notizen');
    for (const ab of M.abschnitte) {
      const sek = mach('section', 'lb-teil');
      sek.style.setProperty('--farbe', ab.teil.farbe || '#9aa3b2');
      const h = mach('h3', 'lb-teil-kopf');
      h.textContent = ab.name;
      sek.appendChild(h);
      for (const r of ab.reihen) {
        const el = r.art === 'takte' ? this._takteEl(r) : this._zeileEl(r.z, laut, notizen);
        el.dataset.reihe = String(this.reihenEl.length);
        this.reihenEl.push({ r, el });
        sek.appendChild(el);
      }
      box.appendChild(sek);
    }
    if (!M.abschnitte.length) box.innerHTML = '<div class="lb-leer">Kein Liedtext gefunden.</div>';
    this._entzerren();
    this.tick(this.tr.pos, true);
  }

  _chip(a, extra = '') {
    const c = mach('span', `lb-ak${extra}${a.eigen ? ' lb-eigen' : ''}${this.wert('verdeckt') && !this.aufgedeckt.has(a.index) ? ' lb-verdeckt' : ''}`, nameHtml(this._name(a.sym)));
    c.dataset.i = String(a.index);
    let l = this.chips.get(a.index);
    if (!l) this.chips.set(a.index, (l = []));
    l.push(c);
    c.addEventListener('click', (e) => { e.stopPropagation(); this._akkordTipp(a, c); });
    return c;
  }

  _zeileEl(z, mitLaut, mitNotiz) {
    const el = mach('div', `lb-zeile${z.summen ? ' lb-summen' : ''}`);
    el.dataset.nr = String(z.nr);
    // Woerter mit ihren Silben (Kurzwoerter wie "D" haengen am Folgewort, wie in zeilenSilben)
    const woerter = [];
    z.silben.forEach((s, i) => { if (!woerter.length || woerter[woerter.length - 1].nr !== s.wort) woerter.push({ nr: s.wort, idx: [] }); woerter[woerter.length - 1].idx.push(i); });
    let lw = mitLaut && !z.summen ? this._laut(z.text) : null;
    if (lw) {
      let pos = 0;
      for (const w of woerter) {
        const anzahl = w.idx.map((i) => z.silben[i].text).join('').split(/\s+/).filter(Boolean).length;
        w.laut = lw.slice(pos, pos + anzahl);
        pos += anzahl;
      }
      if (pos < lw.length && woerter.length) woerter[woerter.length - 1].laut.push(...lw.slice(pos));
    }
    // vorne: Akkorde vor dem ersten Ton · grau: Akkord, der schon klingt
    const vorBlock = (chips) => {
      const b = mach('span', 'lb-wort lb-nur-ak');
      const lane = mach('span', 'lb-lane');
      for (const c of chips) lane.appendChild(c);
      b.appendChild(lane);
      b.appendChild(mach('span', 'lb-tx', '&#8203;'));
      return b;
    };
    let grau = null;
    if (z.vorne.length) el.appendChild(vorBlock(z.vorne.map((a) => this._chip(a))));
    else if (!z.ch[0].length && !this.wert('verdeckt')) {
      // Akkord, der am Zeilenanfang schon klingt: grau ueber den Anfang (nur wenn dort Platz ist)
      let vorher = null;
      for (const a of this.modell.akkorde) if (a.b <= z.anfang + 1e-6) vorher = a;
      if (vorher) { grau = mach('span', 'lb-ak lb-grau', `(${nameHtml(this._name(vorher.sym))})`); grau.dataset.anker = 'grau'; }
    }
    for (const w of woerter) {
      const b = mach('span', 'lb-wort');
      const lane = mach('span', 'lb-lane');
      const tx = mach('span', 'lb-tx');
      b.appendChild(lane);
      b.appendChild(tx);
      if (grau) { lane.appendChild(grau); grau = null; }
      w.idx.forEach((i, j) => {
        const s = mach('span', 'lb-s');
        s.textContent = z.silben[i].text;
        s.dataset.s = String(i);
        s.dataset.b = String(z.silben[i].b);
        s.addEventListener('click', (e) => { e.stopPropagation(); this._silbeTipp(z, i, s); });
        tx.appendChild(s);
        for (const a of z.ch[i]) { const c = this._chip(a); c.dataset.anker = 's'; c._anker = s; lane.appendChild(c); }
        for (const a of z.zwischen[i]) { const c = this._chip(a); c.dataset.anker = 'nach'; c._anker = s; lane.appendChild(c); b.classList.add('lb-halt'); }
      });
      if (w.laut) {
        const lt = mach('span', 'lb-lt');
        let html = '';
        w.laut.forEach((x, k) => {
          if (k) html += ' ';
          const zeichen = [...x.text];
          let pos = 0;
          for (const [v, e] of x.betont) { html += esc(zeichen.slice(pos, v).join('')) + `<u>${esc(zeichen.slice(v, e).join(''))}</u>`; pos = e; }
          html += esc(zeichen.slice(pos).join(''));
        });
        lt.innerHTML = html;
        b.appendChild(lt);
      }
      el.appendChild(b);
    }
    if (z.hinten.length) {
      const b = vorBlock(z.hinten.map((a) => this._chip(a)));
      b.classList.add('lb-hinten');
      el.appendChild(b);
    }
    // Notiz
    const notiz = this.eigen.notiz[z.nr];
    if (mitNotiz && notiz) {
      const n = mach('div', 'lb-notiz');
      n.innerHTML = `${this.symbol('stift')}<span></span>`;
      n.querySelector('span').textContent = notiz;
      el.appendChild(n);
    }
    const nk = mach('button', 'lb-notiz-knopf');
    this.setzeSymbol(nk, 'stift', notiz ? 'Notiz ändern' : 'Notiz');
    nk.onclick = (e) => { e.stopPropagation(); this._notizBearbeiten(z, nk); };
    el.appendChild(nk);
    el.addEventListener('click', () => this._reiheTipp(z.vorne.length ? z.vorne[0].b : z.anfang));
    return el;
  }

  _takteEl(r) {
    const el = mach('div', 'lb-takte');
    for (const t of r.takte) {
      const a = (t - 1) * 4;
      const zelle = mach('span', 'lb-takt');
      for (const x of this.modell.akkorde.filter((y) => y.b < a + 4 - 1e-6 && y.b + y.d > a + 1e-6)) {
        const c = this._chip(x);
        c.style.left = `${Math.max(0, x.b - a) * 25}%`;
        c.dataset.anker = 'takt';
        zelle.appendChild(c);
      }
      el.appendChild(zelle);
    }
    el.addEventListener('click', () => this._reiheTipp(r.b));
    return el;
  }

  // Akkorde ueber ihre Silbe setzen und Zusammenstoesse aufloesen (von links nach rechts, nur in derselben Bildzeile)
  _entzerren() {
    const lueckeEm = 0.35;
    for (const { el, r } of this.reihenEl) {
      if (r.art !== 'zeile') {
        // Takte: Akkorde in einer Zelle nicht uebereinander
        for (const zelle of el.querySelectorAll('.lb-takt')) {
          let rechts = -Infinity;
          for (const c of zelle.querySelectorAll('.lb-ak')) {
            c.style.marginLeft = '';
            const x = c.offsetLeft;
            if (x < rechts) c.style.marginLeft = `${rechts - x}px`;
            rechts = c.offsetLeft + c.offsetWidth + 6;
          }
        }
        continue;
      }
      const woerter = [...el.querySelectorAll('.lb-wort')];
      for (const w of woerter) { w.style.marginLeft = ''; w.style.paddingRight = ''; }
      const fs = parseFloat(getComputedStyle(el).fontSize) || 18;
      const luecke = lueckeEm * fs;
      // Ankerpositionen innerhalb des Wortes
      for (const w of woerter) {
        let frei = 0;
        const grau = w.querySelector('.lb-lane .lb-ak.lb-grau');
        if (grau) {
          grau.style.display = '';
          grau.style.left = '0px';
          const naechster = [...w.querySelectorAll('.lb-lane .lb-ak:not(.lb-grau)')][0];
          const an = naechster && naechster._anker;
          const platz = !an ? Infinity : naechster.dataset.anker === 'nach' ? an.offsetLeft + an.offsetWidth + luecke * 1.4 : an.offsetLeft;
          if (grau.offsetWidth + luecke > platz) grau.style.display = 'none';
          else frei = grau.offsetWidth + luecke;
        }
        for (const c of w.querySelectorAll('.lb-lane .lb-ak:not(.lb-grau)')) {
          let x = 0;
          if (c._anker) x = c.dataset.anker === 'nach' ? c._anker.offsetLeft + c._anker.offsetWidth + luecke * 1.4 : c._anker.offsetLeft;
          else x = frei;                                   // Akkorde ohne Silbe (vorne/hinten): nebeneinander
          x = Math.max(x, frei);
          c.style.left = `${x}px`;
          frei = x + c.offsetWidth + luecke;
        }
        // Platz fuer Akkorde auf gehaltenen Toenen bzw. ueberstehende Akkorde
        const rechts = Math.max(0, ...[...w.querySelectorAll('.lb-lane .lb-ak:not(.lb-grau)')].map((c) => c.offsetLeft + c.offsetWidth));
        const tb = w.querySelector('.lb-tx').offsetWidth;
        const lt = w.querySelector('.lb-lt');
        const breite = Math.max(tb, lt ? lt.offsetWidth : 0);
        if (rechts > breite) w.style.paddingRight = `${rechts - breite}px`;
      }
      // Zusammenstoesse zwischen Woertern derselben Bildzeile: Wort nach rechts ruecken
      let letzte = null;
      for (const w of woerter) {
        const chips = [...w.querySelectorAll('.lb-lane .lb-ak')].filter((c) => c.style.display !== 'none');
        if (!chips.length) continue;
        const erste = chips[0];
        if (letzte) {
          const a = letzte.getBoundingClientRect(), b = erste.getBoundingClientRect();
          if (Math.abs(a.top - b.top) < 4 && b.left < a.right + luecke) {
            // grauer Akkord (klingt noch) weicht, statt den Text zu verschieben – wie im Akkordblatt
            if (letzte.classList.contains('lb-grau')) letzte.style.display = 'none';
            else w.style.marginLeft = `${a.right + luecke - b.left}px`;
          }
        }
        letzte = chips[chips.length - 1];
      }
    }
  }

  _entzerrenSpaeter() {
    clearTimeout(this._ezTimer);
    this._ezTimer = setTimeout(() => { if (this.sichtbar) { this._setzen(); } }, 180);
  }

  // ------------------------------------------------------------------------------------ Mitlaufen
  tick(t, sofort = false) {
    if (!this.sichtbar || !this.modell) return;
    if (this._veraltet) this._setzen();
    const song = this.song;
    const b = beatAusZeit(song, t);
    const M = this.modell;
    // aktueller Akkord
    let ai = -1;
    for (let lo = 0, hi = M.akkorde.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (M.akkorde[m].b <= b + 0.02) { ai = m; lo = m + 1; } else hi = m - 1; }
    if (ai !== this.aktivAkkord) {
      for (const c of this.chips.get(this.aktivAkkord) || []) c.classList.remove('lb-dran');
      for (const c of this.chips.get(ai) || []) c.classList.add('lb-dran');
      this.aktivAkkord = ai;
      if (this.wert('verdeckt') && this.tr.spielt && ai >= 0) this._aufdecken(ai, false);
    }
    // aktuelle Reihe
    let ri = -1;
    for (let i = 0; i < this.reihenEl.length; i++) { const r = this.reihenEl[i].r; if (r.b - 0.75 <= b) ri = i; else break; }
    if (ri >= 0 && b > this.reihenEl[ri].r.bEnde + 2) ri = -1;
    if (ri !== this.aktivReihe || sofort) {
      if (this.aktivReihe >= 0 && this.reihenEl[this.aktivReihe]) this.reihenEl[this.aktivReihe].el.classList.remove('lb-aktiv');
      if (ri >= 0) this.reihenEl[ri].el.classList.add('lb-aktiv');
      const wechsel = ri !== this.aktivReihe;
      this.aktivReihe = ri;
      if (wechsel && ri >= 0 && this.wert('mitlauf') && (this.tr.spielt || sofort)) this._inSicht(this.reihenEl[ri].el, sofort);
    }
    // gesungene Silben in der aktiven Zeile
    const akt = ri >= 0 ? this.reihenEl[ri] : null;
    if (akt && akt.r.art === 'zeile') {
      const sp = akt.el.querySelectorAll('.lb-s');
      let jetzt = null;
      for (const s of sp) {
        const sb = Number(s.dataset.b);
        const gesungen = this.tr.spielt && sb <= b + 0.05;
        s.classList.toggle('lb-gesungen', gesungen);
        if (gesungen) jetzt = s;
      }
      if (jetzt !== this.aktivSilbe) { if (this.aktivSilbe) this.aktivSilbe.classList.remove('lb-silbe-jetzt'); if (jetzt) jetzt.classList.add('lb-silbe-jetzt'); this.aktivSilbe = jetzt; }
    }
    // Leiste: jetzt / dann / Schlaege bis zum Wechsel
    const a = M.akkorde[ai], n = M.akkorde[ai + 1];
    const jetztHtml = a ? nameHtml(this._name(a.sym)) : '–';
    if (this.r.jetzt._h !== jetztHtml) { this.r.jetzt.innerHTML = jetztHtml; this.r.jetzt._h = jetztHtml; }
    const dannHtml = !n ? '' : this.wert('verdeckt') && !this.aufgedeckt.has(n.index) ? '?' : nameHtml(this._name(n.sym));
    if (this.r.dann._h !== dannHtml) { this.r.dann.innerHTML = dannHtml; this.r.dann._h = dannHtml; }
    const rest = n ? n.b - b : Infinity;
    const voll = rest <= 4 ? Math.max(0, Math.min(4, 4 - Math.ceil(rest - 0.001))) : 0;
    this.r.punkte.forEach((p, i) => p.classList.toggle('an', rest <= 4 && i < voll));
    this.r.dannBox.classList.toggle('lb-bald', rest <= 1.05);
    const teil = this.song.abschnitte.find((x) => x.t <= t + 1e-6 && x.te > t) || null;
    const tn = teil ? teil.name.replace(/\s*–.*$/, '').replace(/\s*\(.*\)$/, '') : '';
    if (this.r.teilname.textContent !== tn) this.r.teilname.textContent = tn;
    const zt = `${Math.max(0, Math.floor(t / 60))}:${String(Math.max(0, Math.floor(t % 60))).padStart(2, '0')}`;
    if (this.r.zeit.textContent !== zt) this.r.zeit.textContent = zt;
    if (this._spielteZuletzt !== this.tr.spielt) { this._spielteZuletzt = this.tr.spielt; this._leisteSync(); }
    // Einzaehlen gross anzeigen
    const zrest = this.tr.einzaehlRest ? this.tr.einzaehlRest() : 0;
    const ztext = zrest > 0 ? String(zrest) : '';
    if (this.r.zaehler.textContent !== ztext) { this.r.zaehler.textContent = ztext; this.r.zaehler.classList.toggle('an', !!ztext); }
  }

  _inSicht(el, sofort) {
    if (performance.now() - this._scrollZeit < 3500 && !sofort) return;   // du scrollst gerade selbst
    const box = this.r.blatt;
    const ziel = Math.max(0, el.offsetTop - box.clientHeight * (this.buehne ? 0.22 : 0.3));
    this._autoScroll = true;
    try { box.scrollTo({ top: ziel, behavior: sofort ? 'auto' : 'smooth' }); } catch { box.scrollTop = ziel; }
    clearTimeout(this._asTimer);
    this._asTimer = setTimeout(() => { this._autoScroll = false; }, 900);
  }

  _reiheTipp(b) {
    if (this.bearbeiten) return;
    const t = zeitAusBeat(this.song, b - 1);
    this.aktionen.springen(Math.max(this.song.anfang, t));
    this.aktivReihe = -1;
    this.tick(this.tr.pos, true);
  }

  // ------------------------------------------------------------------------------------ Akkord hoeren / zeigen
  _akkordHoeren(tsym) {
    const gr = griff(tsym);
    if (!gr) return;
    try { this.engine.aufwecken(); } catch { /* egal */ }
    const s = this.engine.sampler, jetzt = this.engine.jetzt + 0.02;
    // links der Basston tief, rechts der Griff in Grundstellung um das eingestrichene C (leicht gebrochen)
    let bass = 36 + ((gr.bass != null ? gr.bass : gr.grund) % 12);
    if (bass < 40) bass += 12;
    let wurzel = 60 + gr.grund;
    if (wurzel > 66) wurzel -= 12;
    s.spiele(bass, 62, jetzt, 1.9);
    gr.toene.forEach((p, i) => s.spiele(wurzel + (p - gr.grund), 72, jetzt + 0.035 * (i + 1), 1.9));
  }

  _aufdecken(index, selbst = true) {
    if (this.aufgedeckt.has(index)) return;
    this.aufgedeckt.add(index);
    for (const c of this.chips.get(index) || []) { c.classList.remove('lb-verdeckt'); c.classList.add('lb-aufgedeckt'); }
    if (selbst) this.quiz.getippt++;
    this._quizStand();
  }

  _quizStand() {
    if (!this.wert('verdeckt') || this.bearbeiten) return;
    const n = this.modell ? this.modell.akkorde.length : 0;
    this._hinweis(`Akkorde auswendig: ${this.aufgedeckt.size} von ${n} aufgedeckt · spiel den Akkord, bevor er beim Mitlaufen auftaucht – antippen deckt auf`);
  }

  _akkordTipp(a, chip) {
    if (this.bearbeiten) { this._akkordBearbeiten(a, chip); return; }
    if (this.wert('verdeckt') && !this.aufgedeckt.has(a.index)) { this._aufdecken(a.index); return; }
    const tsym = transponiereAkkord(a.sym, this.song.transposition || 0, !!this.song.kreuzTonart);
    this._akkordHoeren(tsym);
    const gr = griff(tsym);
    if (!gr) return;
    const pop = this._popAuf(chip, 'lb-pop-griff');
    pop.innerHTML = `<div class="lb-pop-titel">${nameHtml(this._name(a.sym))}${a.eigen ? ' <small>eigen</small>' : ''}</div>${klaviatur(gr.toene, gr.grund, gr.bass)}<div class="lb-gnoten">${esc(gr.noten.join(' · '))}${gr.bass != null ? ` · Bass ${esc(DE_TON[gr.bass])}` : ''}</div>`;
    const reihe = mach('div', 'lb-reihe');
    const nochmal = mach('button', 'knopf');
    this.setzeSymbol(nochmal, 'lautsprecher', 'Nochmal');
    nochmal.onclick = () => this._akkordHoeren(tsym);
    const ab = mach('button', 'knopf');
    this.setzeSymbol(ab, 'play', 'Ab hier');
    ab.onclick = () => { this._popZu(); this.aktionen.springen(Math.max(this.song.anfang, zeitAusBeat(this.song, a.b - 1))); if (!this.tr.spielt) this.aktionen.umschalten(); };
    reihe.appendChild(nochmal);
    reihe.appendChild(ab);
    pop.appendChild(reihe);
    this._popPlatzieren(chip);
  }

  // ------------------------------------------------------------------------------------ Anpassen (eigene Akkorde, Notizen)
  _bearbeiten(an) {
    this.bearbeiten = an;
    this._popZu();
    this._kopfSync();
    this._hinweis(an ? 'Anpassen: Akkord antippen = ändern oder verschieben · Silbe antippen = Akkord dazu · Stift = Notiz' : '');
    if (!an) this._quizStand();
  }

  // Akkorde auswendig: alle Namen verdecken (frisch gemischt), Mitlaufen oder Antippen deckt auf
  verdecken(an) {
    this.aufgedeckt = new Set();
    this.quiz = { getippt: 0 };
    if (this.wert('verdeckt') === an) { if (this.gebaut) { this._setzen(); this._quizStand(); } }
    else this.setze('verdeckt', an);
    if (!an) this._hinweis('');
    else this.toast('Akkorde verdeckt – spiel mit und schau, ob du sie weißt', 2600);
  }

  _hinweis(text) {
    const h = this.r.hinweis;
    h.textContent = text;
    h.classList.toggle('versteckt', !text);
  }

  _akkordWahlGitter(aktuell, fn) {
    // die Akkorde der Tonart (wie im Lied) + ihre Geschwister; frei eintippen geht auch
    const gitter = mach('div', 'lb-pop-gitter lb-akkordwahl');
    const basis = ['Db', 'Gb', 'Ab', 'Bbm', 'Ebm', 'Fm', 'Gbm', 'Ab7', 'Db7', 'Eb', 'Bb', 'Gbmaj7'];
    for (const sym of basis) {
      const b = mach('button', `lb-wahl${sym === aktuell ? ' an' : ''}`, nameHtml(this._name(sym)));
      b.onclick = () => fn(sym);
      gitter.appendChild(b);
    }
    return gitter;
  }

  _freiEingabe(fn) {
    const zeile = mach('form', 'lb-frei-eingabe');
    const inp = mach('input');
    inp.placeholder = 'Anderer Akkord, z. B. Gbmaj7';
    for (const [k, v] of [['autocapitalize', 'off'], ['autocorrect', 'off'], ['autocomplete', 'off'], ['spellcheck', 'false']]) inp.setAttribute(k, v);
    const ok = mach('button', 'knopf');
    ok.type = 'submit';
    this.setzeSymbol(ok, 'haken', 'OK');
    zeile.appendChild(inp);
    zeile.appendChild(ok);
    zeile.onsubmit = (e) => {
      e.preventDefault();
      const roh = inp.value.trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/^([a-g])/, (x) => x.toUpperCase());
      if (!AKK_RE.test(roh)) { this.toast('Das sieht nicht nach einem Akkord aus (z. B. Db, Bbm, Gbmaj7, Ab/C)', 2800); return; }
      // eingetippt in der angezeigten Tonart -> zurueck nach Des-Dur
      fn(transponiereAkkord(roh, -(this.song.transposition || 0), false), true);
    };
    return zeile;
  }

  _akkordBearbeiten(a, chip) {
    const pop = this._popAuf(chip, 'lb-pop-bearbeiten');
    pop.appendChild(mach('div', 'lb-pop-titel', `Akkord ${nameHtml(this._name(a.sym))}${a.orig && a.orig !== a.sym ? ` <small>vorher ${nameHtml(this._name(a.orig))}</small>` : ''}`));
    const ersetzen = (sym, schonDes = false) => {
      const des = schonDes ? sym : transponiereAkkord(sym, 0, false);
      const e = (this.eigen.akk[a.id] ||= {});
      if (!a.neu && des === a.orig) delete e.sym; else e.sym = des;
      if (!Object.keys(e).length) delete this.eigen.akk[a.id];
      this._eigenGeaendert('Akkord geändert');
    };
    pop.appendChild(this._akkordWahlGitter(a.sym, (sym) => ersetzen(sym, true)));
    pop.appendChild(this._freiEingabe((sym) => ersetzen(sym, true)));
    const reihe = mach('div', 'lb-reihe');
    const knopf = (text, sym, fn) => { const b = mach('button', 'knopf'); this.setzeSymbol(b, sym, text); b.onclick = fn; reihe.appendChild(b); };
    const schieben = (d) => {
      const e = (this.eigen.akk[a.id] ||= {});
      e.schritt = (e.schritt || 0) + d;
      if (!e.schritt) delete e.schritt;
      if (!Object.keys(e).length) delete this.eigen.akk[a.id];
      this._eigenGeaendert(d < 0 ? 'Eine Silbe früher' : 'Eine Silbe später', a.id);
    };
    if (a.zeile != null && !a.instrumental) {
      knopf('Früher', 'zurueck', () => schieben(-1));
      knopf('Später', 'weiter', () => schieben(1));
    }
    knopf('Entfernen', 'kreuz', () => {
      if (a.neu) { this.eigen.neu = this.eigen.neu.filter((n) => 'n' + schluessel(n.b) !== a.id); delete this.eigen.akk[a.id]; }
      else (this.eigen.akk[a.id] ||= {}).weg = true;
      this._eigenGeaendert('Akkord entfernt');
    });
    if (a.eigen && !a.neu) knopf('Original', 'wiederholen', () => { delete this.eigen.akk[a.id]; this._eigenGeaendert('Wieder wie das Original'); });
    pop.appendChild(reihe);
    this._popPlatzieren(chip);
  }

  _silbeTipp(z, i, el) {
    if (!this.bearbeiten) { this._reiheTipp(z.silben[i].b); return; }
    const pop = this._popAuf(el, 'lb-pop-bearbeiten');
    pop.appendChild(mach('div', 'lb-pop-titel', `Akkord auf „${esc(z.silben[i].text.trim())}“ setzen`));
    const neu = (sym) => {
      const b = z.silben[i].b;
      this.eigen.neu = this.eigen.neu.filter((n) => schluessel(n.b) !== schluessel(b));
      this.eigen.neu.push({ b, sym });
      delete this.eigen.akk['n' + schluessel(b)];
      this._eigenGeaendert('Akkord hinzugefügt');
    };
    pop.appendChild(this._akkordWahlGitter(null, neu));
    pop.appendChild(this._freiEingabe(neu));
    this._popPlatzieren(el);
  }

  _notizBearbeiten(z, anker) {
    const pop = this._popAuf(anker, 'lb-pop-bearbeiten');
    pop.appendChild(mach('div', 'lb-pop-titel', `Notiz zu Zeile ${z.nr}`));
    const ta = mach('textarea', 'lb-notiz-feld');
    ta.rows = 3;
    ta.placeholder = 'z. B. hier atmen · leiser · links nur Grundton';
    ta.value = this.eigen.notiz[z.nr] || '';
    pop.appendChild(ta);
    const reihe = mach('div', 'lb-reihe');
    const ok = mach('button', 'knopf akzent');
    this.setzeSymbol(ok, 'haken', 'Speichern');
    ok.onclick = () => {
      const t = ta.value.trim().slice(0, 300);
      if (t) this.eigen.notiz[z.nr] = t; else delete this.eigen.notiz[z.nr];
      if (!this.wert('notizen') && t) this.setze('notizen', true);
      this._eigenGeaendert(t ? 'Notiz gespeichert' : 'Notiz gelöscht');
    };
    reihe.appendChild(ok);
    if (this.eigen.notiz[z.nr]) {
      const weg = mach('button', 'knopf');
      this.setzeSymbol(weg, 'kreuz', 'Löschen');
      weg.onclick = () => { delete this.eigen.notiz[z.nr]; this._eigenGeaendert('Notiz gelöscht'); };
      reihe.appendChild(weg);
    }
    pop.appendChild(reihe);
    this._popPlatzieren(anker);
    setTimeout(() => ta.focus(), 50);
  }

  _eigenGeaendert(meldung) {
    this._eigenSpeichern();
    this._popZu();
    const oben = this.r.blatt.scrollTop;
    this.modell = null;
    this._setzen();
    this.r.blatt.scrollTop = oben;
    if (meldung) this.toast(meldung, 1400);
  }

  // ------------------------------------------------------------------------------------ Popover
  _popAuf(anker, klasse) {
    const pop = this.r.pop;
    pop.className = `lb-pop glas ${klasse}`;
    pop.innerHTML = '';
    this._popAnker = anker;
    return pop;
  }

  _popPlatzieren(anker) {
    const pop = this.r.pop;
    pop.classList.remove('versteckt');
    const wr = this.wurzel.getBoundingClientRect(), ar = anker.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const x = Math.max(10, Math.min(wr.width - pw - 10, ar.left - wr.left - 8));
    let y = ar.bottom - wr.top + 8;
    if (y + ph > wr.height - 10) y = Math.max(10, ar.top - wr.top - ph - 8);
    pop.style.left = `${Math.round(x)}px`;
    pop.style.top = `${Math.round(y)}px`;
  }

  _popZu() { if (this.r) this.r.pop.classList.add('versteckt'); this._popAnker = null; }

  // ------------------------------------------------------------------------------------ Buehne
  _buehne(an) {
    this.buehne = an;
    this._popZu();
    this._einstZu();
    this.r.app.classList.toggle('lb-buehne', an);
    if (an) {
      if (!this.wert('mitlauf')) this.setze('mitlauf', true);
      try { document.documentElement.requestFullscreen?.(); } catch { /* iPad: nicht noetig */ }
      this._buehnenKnoepfeZeigen();
      this.toast('Bühne: Abspielen startet das Mitlaufen · Pedal blättert', 2600);
    } else {
      try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* egal */ }
    }
    this._kopfSync();
    this._entzerrenSpaeter();
  }

  _buehnenKnoepfeZeigen() {
    this.r.app.classList.add('lb-knoepfe-an');
    clearTimeout(this._bkTimer);
    this._bkTimer = setTimeout(() => { if (this.tr.spielt) this.r.app.classList.remove('lb-knoepfe-an'); }, 3200);
  }

  _taste(ev) {
    if (!this.sichtbar) return;
    const z = ev.target;
    if (z && (z.tagName === 'TEXTAREA' || z.tagName === 'INPUT')) return;
    const box = this.r.blatt;
    const seite = (d) => { this._scrollZeit = performance.now(); box.scrollBy({ top: d * box.clientHeight * 0.75, behavior: 'smooth' }); };
    switch (ev.code) {
      case 'Space': ev.preventDefault(); this.aktionen.umschalten(); this._leisteSync(); break;
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': ev.preventDefault(); seite(1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': ev.preventDefault(); seite(-1); break;
      case 'Escape': ev.preventDefault(); if (!this.r.pop.classList.contains('versteckt')) this._popZu(); else if (this.buehne) this._buehne(false); else { this.tr.pause(); this.schliessen(); } break;
      default: break;
    }
  }

  // ------------------------------------------------------------------------------------ Drucken
  _drucken() {
    this._einstZu();
    document.documentElement.classList.add('lb-druck');
    const weg = () => { document.documentElement.classList.remove('lb-druck'); window.removeEventListener('afterprint', weg); };
    window.addEventListener('afterprint', weg);
    setTimeout(() => { window.print(); setTimeout(weg, 1500); }, 60);
  }

  // Ist gerade etwas am Laufen? (Bildschirm wach halten)
  aktiv() { return this.sichtbar && (this.tr.spielt || this.buehne); }
}
