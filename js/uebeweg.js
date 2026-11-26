// Uebeweg (iPad-Fassung): das Lied Stueck fuer Stueck lernen.
// * Abschnitte waehlbar kurz (1 Takt), mittel (2 Takte) oder laenger (4 Takte) – jederzeit umstellbar.
// * Je Abschnitt: Linke Hand, Rechte Hand, Beide Haende, Im Tempo (Tempo-Treppe), Singen & Spielen.
//   Die Hand ist jederzeit frei waehlbar; die App spielt, was du gerade NICHT uebst.
// * "Geschafft" heisst nur: einmal durchgespielt. Es ist ein Merkzeichen, kein Urteil.
// * Schleife (jederzeit ein/aus): der Abschnitt laeuft immer wieder, bis du "Geschafft" oder "Weiter" tippst.
//   Ohne Schleife haelt die App nach jedem Durchgang an.
// * Reihenfolge: Abschnitt fuer Abschnitt (links, rechts, beide) oder Hand fuer Hand (erst alle Abschnitte eines
//   Liedteils links, dann alle zusammen links, dann rechts …).
// * "Alle zusammen": alle Abschnitte eines Liedteils am Stueck – mit der gewaehlten Hand, auch in Schleife.
import { zeitAusBeat } from './song.js';

const LOB = ['Schön!', 'Weiter so.', 'Prima.', 'Gut gemacht.', 'Ruhig und gleichmäßig – genau so.'];
const zufall = (liste) => liste[Math.floor(Math.random() * liste.length)];
const tagName = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const LAENGEN = { kurz: 1, mittel: 2, lang: 4 };
export const LAENGEN_NAME = { kurz: 'Kurz', mittel: 'Mittel', lang: 'Länger' };
const HAND_FOLGE = ['L', 'R', 'B', 'T'];
const HAND_NAME = { L: 'linke Hand', R: 'rechte Hand', B: 'beide Hände', T: 'im Tempo', S: 'singen und spielen' };

export class Uebeweg {
  constructor(k) {
    Object.assign(this, k);            // song, tr, einst, speicher, sichtbar
    this.aktiv = false;
    this.etappen = [];
    this.daten = { etappen: {}, tage: {}, aktuell: 0, schema: 3 };
    this.wartetAufUrteil = false;      // ohne Schleife: nach dem Durchgang angehalten – Geschafft oder Nochmal?
    this.imWechsel = false;
    this.anhoeren = false;             // die App spielt den Abschnitt einmal ganz vor
    this.runde = 0;                    // Durchgaenge in Folge (Schleife)
    this.nachricht = '';
    this.hoerer = new Set();
    this.sitzung = 0;
    this.tr.on('loop', () => this.durchgangFertig());
  }

  on(fn) { this.hoerer.add(fn); }
  melde(art, x) { for (const f of this.hoerer) f(art, x); }

  // ---------------------------------------------------------------------------------- Einstellungen
  laengeId() { const l = this.einst.get('uebeweg.abschnitt'); return LAENGEN[l] ? l : 'kurz'; }
  schleife() { return !!this.einst.get('uebeweg.schleife'); }
  handweise() { return this.einst.get('uebeweg.reihenfolge') === 'hand'; }
  einzaehlSchlaege() { return Math.max(0, Number(this.einst.get('spiel.einzaehlen')) || 0) * 4; }
  zielTempo() { return (this.einst.get('uebeweg.zielTempo') || 100) / 100; }
  startTempo() { return (this.einst.get('uebeweg.startTempo') || 60) / 100; }

  // ---------------------------------------------------------------------------------- Daten
  schluessel() { return `uebeweg_${this.song.fassung.id}`; }

  laden() {
    const d = this.speicher.lesen(this.schluessel(), null);
    this.daten = d && typeof d === 'object'
      ? { etappen: d.etappen || {}, aktuell: d.aktuell || 0, schema: 3, aktuellId: d.aktuellId || null, aktuellVonB: d.aktuellVonB ?? null, aktuellSt: d.aktuellSt || null }
      : { etappen: {}, aktuell: 0, schema: 3 };
    this.daten.tage = this.speicher.lesen('uebeweg_tage', {}) || {};
  }

  speichernSpaeter() {
    clearTimeout(this._speichern);
    this._speichern = setTimeout(() => this.speichernJetzt(), 600);
  }

  speichernJetzt() {
    clearTimeout(this._speichern);
    if (!this.etappen.length) return;
    const e = this.etappe;
    if (e) { this.daten.aktuellId = e.id; this.daten.aktuellVonB = e.vonB; this.daten.aktuellSt = this.stWahl || null; }
    const { tage, ...rest } = this.daten;
    this.speicher.schreiben(this.schluessel(), rest);
    this.speicher.schreiben('uebeweg_tage', tage || {});
  }

  heute() { const t = tagName(); return (this.daten.tage[t] = this.daten.tage[t] || { sekunden: 0, etappen: 0, sauber: 0 }); }

  serie() {
    let n = 0;
    const d = new Date();
    for (let i = 0; i < 1000; i++) {
      const e = this.daten.tage[tagName(d)];
      if (e && e.sekunden > 60) n++;
      else if (n > 0 || i > 0) break;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  // ---------------------------------------------------------------------------------- Plan
  // Stationen: alle Etappen bieten links / rechts / beide / im Tempo (/ singen). "pflicht" sind die, die zum
  // Abhaken der Etappe gehoeren.
  stationen(typ) {
    const begl = this.song.fassung.art === 'begleitung';
    const z = this.zielTempo(), start = this.startTempo();
    const S = (id, titel, kurz, hand, tempo, extra = {}) => ({ id, titel, kurz, hand, tempo, ...extra });
    const alle = [
      S('L', 'Linke Hand', 'Links', 'L', start),
      S('R', 'Rechte Hand', 'Rechts', 'R', start),
      S('B', 'Beide Hände', 'Beide', 'beide', start),
      S('T', 'Im Tempo', 'Tempo', 'beide', Math.min(z, start + 0.1), { leiter: true }),
      ...(begl ? [S('S', 'Singen & Spielen', 'Singen', 'beide', z, { singen: true })] : []),
    ];
    // "Alle zusammen": Hand fuer Hand mit jeder Hand, sonst beide Haende und im Tempo
    const pflicht = typ === 'abschnitt' ? alle.map((s) => s.id)
      : typ === 'durchlauf' ? (this.handweise() ? alle.map((s) => s.id) : ['B', 'T', ...(begl ? ['S'] : [])])
        : typ === 'verbinden' ? ['B'] : ['B', ...(begl ? ['S'] : [])];
    if (typ === 'verbinden') alle.find((s) => s.id === 'B').tempo = Math.max(start, Math.min(z, start + 0.1));
    if (typ === 'ganz') for (const s of alle) if (s.id !== 'L' && s.id !== 'R') s.tempo = z;
    return alle.map((s) => ({ ...s, pflicht: pflicht.includes(s.id) }));
  }

  planBauen() {
    const s = this.song;
    const laenge = LAENGEN[this.laengeId()];
    const et = [];
    let nr = 0;
    const abschnitte = s.abschnitte.filter((a) => a.name !== 'Vorspiel');
    const vorspiel = s.abschnitte.find((a) => a.name === 'Vorspiel');
    const teilEtappen = (name, farbe, takte, beatAnfang) => {
      // Takte in Stuecke der gewaehlten Laenge teilen (ein kurzer Rest bleibt ein eigenes kurzes Stueck)
      const stuecke = [];
      for (let i = 0; i < takte.length; i += laenge) stuecke.push(takte.slice(i, i + laenge));
      const ersteNr = nr + 1;
      stuecke.forEach((st, i) => {
        nr++;
        const vor = stuecke[i - 1];
        const a = beatAnfang(st[0]), b = beatAnfang(st[st.length - 1]) + 4;
        et.push({ id: `t${st[0]}-${st[st.length - 1]}`, typ: 'abschnitt', nr, titel: `Abschnitt ${nr}`, teil: name, vonB: a, bisB: b, farbe });
        if (i > 0) et.push({ id: `v${vor[0]}-${st[st.length - 1]}`, typ: 'verbinden', nr, titel: `${nr - 1} + ${nr} verbinden`, teil: name, vonB: beatAnfang(vor[0]), bisB: b, farbe });
      });
      if (stuecke.length > 1) et.push({ id: `d${takte[0]}-${takte[takte.length - 1]}`, typ: 'durchlauf', nr: `${ersteNr}–${nr}`, titel: `${name} – alle zusammen`, teil: name, vonB: beatAnfang(takte[0]), bisB: beatAnfang(takte[takte.length - 1]) + 4, farbe });
    };
    if (vorspiel) {
      const vT = Math.max(1, Math.round(-(s.fassung?.anfang_b ?? -8) / 4)) || 2;
      const takte = [];
      for (let t = -vT + 1; t <= 0; t++) takte.push(t);     // Vorspiel-Takte: 0, -1 … (Takt 1 beginnt bei Beat 0)
      teilEtappen('Vorspiel', vorspiel.farbe, takte, (t) => (t - 1) * 4);
    }
    abschnitte.forEach((teil) => {
      const takte = [];
      for (let t = teil.von; t <= teil.bis; t++) takte.push(t);
      teilEtappen(teil.name, teil.farbe, takte, (t) => (t - 1) * 4);
    });
    et.push({ id: 'ganz', typ: 'ganz', titel: 'Das ganze Lied', teil: 'Finale', vonB: et.length ? Math.min(...et.map((e) => e.vonB)) : 0, bisB: abschnitte[abschnitte.length - 1].bis * 4, farbe: '#ffd36b' });
    for (const e of et) e.stationen = this.stationen(e.typ);
    this.etappen = et;
    let i = this.daten.aktuellId ? et.findIndex((e) => e.id === this.daten.aktuellId) : -1;
    if (i < 0 && this.daten.aktuellVonB != null) i = et.findIndex((e) => e.typ === 'abschnitt' && e.vonB <= this.daten.aktuellVonB && this.daten.aktuellVonB < e.bisB);
    this.daten.aktuell = i >= 0 ? i : Math.min(this.daten.aktuell || 0, et.length - 1);
    this.stWahl = this.daten.aktuellSt || null;
  }

  // Laenge geaendert: neu einteilen, an derselben Stelle und mit derselben Hand weiter
  neuEinteilen() {
    const e = this.etappe;
    const st = this.station;
    this.speichernJetzt();
    this.daten.aktuellId = null;
    this.daten.aktuellVonB = e ? e.vonB : null;
    this.planBauen();
    if (st) this.stWahl = st.id;
    if (this.aktiv) this.anwenden({ abspielen: false });
    this.nachricht = `${LAENGEN_NAME[this.laengeId()]}e Abschnitte: ${this.etappe ? this.taktText(this.etappe) : ''}.`;
    this.melde('station');
  }

  ersteZeile(e) {
    const t0 = zeitAusBeat(this.song, e.vonB), t1 = zeitAusBeat(this.song, e.bisB);
    return (this.song.zeilen || []).find((x) => !x.summen && x.ts >= t0 - 0.4 && x.ts < t1) || null;
  }

  // Zeile, die schon vorher begonnen hat und in diesen Abschnitt hineinklingt
  laufendeZeile(e) {
    const t0 = zeitAusBeat(this.song, e.vonB);
    return (this.song.zeilen || []).find((x) => !x.summen && x.ts < t0 && (x.tEnde ?? x.ts) > t0 + 0.2) || null;
  }

  // ---------------------------------------------------------------------------------- Zustand
  zustand(e) {
    const d = (this.daten.etappen[e.id] = this.daten.etappen[e.id] || { stationen: {}, fertig: false });
    for (const st of e.stationen) d.stationen[st.id] = d.stationen[st.id] || { fertig: false, versuche: 0, tempo: st.tempo };
    return d;
  }

  get etappe() { return this.etappen[this.daten.aktuell]; }

  // erste offene Pflicht-Station
  offeneStation(e = this.etappe) {
    const z = this.zustand(e);
    return e.stationen.find((st) => st.pflicht && !z.stationen[st.id].fertig) || null;
  }

  get station() {
    const e = this.etappe;
    if (!e) return null;
    if (this.stWahl) { const w = e.stationen.find((s) => s.id === this.stWahl); if (w) return w; }
    return this.offeneStation(e) || e.stationen.find((s) => s.pflicht) || e.stationen[0];
  }

  etappeKomplett(e) {
    const z = this.zustand(e);
    return e.stationen.every((st) => !st.pflicht || z.stationen[st.id].fertig);
  }

  fortschritt() {
    const fertig = this.etappen.filter((e) => this.zustand(e).fertig).length;
    return { fertig, gesamt: this.etappen.length, anteil: this.etappen.length ? fertig / this.etappen.length : 0 };
  }

  // Abschnitte (und "alle zusammen") des Liedteils der aktuellen Etappe
  teilListe(e = this.etappe) {
    if (!e) return [];
    return this.etappen.map((x, i) => ({ e: x, i })).filter(({ e: x }) => x.teil === e.teil && (x.typ === 'abschnitt' || x.typ === 'durchlauf'));
  }

  zusammenIndex(e = this.etappe) { return e ? this.etappen.findIndex((x) => x.typ === 'durchlauf' && x.teil === e.teil) : -1; }

  // ---------------------------------------------------------------------------------- Ablauf
  starten() {
    this.laden();
    this.planBauen();
    this.aktiv = true;
    this.sitzung = 0;
    this.einzaehlAnwenden();
    this.anwenden({ abspielen: false });
    this.melde('start');
  }

  einzaehlAnwenden() {
    this.tr.loopEinzaehlen = this.einst.get('uebeweg.pauseEinzaehlen') ? this.einzaehlSchlaege() : 0;
  }

  beenden() {
    clearTimeout(this._wechsel);
    this.imWechsel = false;
    this.anhoeren = false;
    this.aktiv = false;
    this.tr.loopEinzaehlen = 0;
    this.tr.pause();
    this.tr.loopAus();
    this.wartetAufUrteil = false;
    this.einst.set('spiel.hand', 'nichts');
    this.tr.setSpeed(this.einst.get('tempo') || 1);      // wieder das eigene Tempo statt des Uebe-Tempos
    this.speichernJetzt();
    this.melde('ende');
  }

  hatNoten(e, hand, uebergang = 1) {
    return this.song.alleNoten.some((n) => n.hand !== 'V' && (hand === 'beide' || n.hand === hand)
      && n.b >= e.vonB - 1e-3 && n.b < e.bisB + uebergang - 1e-3 && this.sichtbar(n));
  }

  bereich(e = this.etappe) {
    const uebergang = e.typ === 'ganz' ? 0 : 1;               // Uebergangston (erster Schlag danach) mitueben
    return { a: zeitAusBeat(this.song, e.vonB), b: Math.min(this.song.ende, zeitAusBeat(this.song, e.bisB + uebergang)), uebergang };
  }

  anwenden({ abspielen = null, einzaehlen = true } = {}) {
    clearTimeout(this._wechsel);
    this.imWechsel = false;
    this.anhoeren = false;
    const e = this.etappe, st = this.station;
    if (!this.aktiv || !e || !st) return;
    const z = this.zustand(e).stationen[st.id];
    const lief = abspielen ?? this.tr.spielt;
    this.tr.pause();
    const { a, b, uebergang } = this.bereich(e);
    if ((st.id === 'L' || st.id === 'R') && !this.hatNoten(e, st.hand, uebergang)) {
      // diese Hand hat hier Pause: abhaken und zur naechsten
      z.fertig = true;
      this.speichernSpaeter();
      const hinweis = `Die ${st.id === 'L' ? 'linke' : 'rechte'} Hand hat hier Pause.`;
      if (this.etappeKomplett(e)) this.zustand(e).fertig = true;
      this.naechsterSchritt(st, { sofort: true });
      this.nachricht = `${hinweis} ${this.nachricht}`;
      this.melde('station');
      return;
    }
    this.einst.set('spiel.hand', st.hand);
    if (st.singen) { this.einst.set('liedtext.anzeigen', true); this.einst.set('ansicht.gesangslinie', true); }
    this.tr.setLoop(a, b, true);
    this.tr.setSpeed(z.tempo || st.tempo);
    this.tr.seek(a, { weiter: false });
    this.wartetAufUrteil = false;
    this.runde = 0;
    this.nachricht = this.anleitung(e, st);
    this.melde('station');
    if (lief) this.tr.play({ einzaehlen: einzaehlen ? this.einzaehlSchlaege() : 0 });
  }

  anleitung(e, st) {
    const was = e.typ === 'abschnitt' ? `${this.taktText(e)}` : e.typ === 'verbinden' ? `Abschnitt ${e.nr - 1} und ${e.nr}` : e.typ === 'durchlauf' ? `alle Abschnitte von „${e.teil}“` : 'das ganze Lied';
    const z = this.zustand(e).stationen[st.id];
    const tempo = Math.round((z.tempo || st.tempo) * 100);
    const schleife = this.schleife() ? ' Läuft in Schleife, bis du „Geschafft“ tippst.' : '';
    switch (st.id) {
      case 'L': return `Linke Hand, ${was} (${tempo} %). Die App spielt rechts dazu.${schleife}`;
      case 'R': return `Rechte Hand, ${was} (${tempo} %). Die App spielt links dazu.${schleife}`;
      case 'B': return `Beide Hände, ${was} (${tempo} %). Langsam ist erlaubt.${schleife}`;
      case 'T': return `Im Tempo: ${was}. Nach jedem „Geschafft“ etwas schneller – bis ${Math.round(this.zielTempo() * 100)} %.${schleife}`;
      case 'S': return `Sing dazu und spiel die Begleitung: ${was}.${schleife}`;
      default: return '';
    }
  }

  taktText(e) {
    const a = Math.floor(e.vonB / 4) + 1, b = Math.round(e.bisB / 4);
    if (b <= 0) {
      const vT = Math.max(1, Math.round(-(this.song.fassung?.anfang_b ?? -8) / 4));
      const va = a + vT, vb = b + vT;
      return va === vb ? `Vorspiel, Takt ${va}` : `Vorspiel, Takt ${va}–${vb}`;
    }
    if (a < 1) return `Vorspiel bis Takt ${b}`;
    return a === b ? `Takt ${a}` : `Takt ${a}–${b}`;
  }

  // Ein Durchgang ist zu Ende (Schleifenende erreicht)
  durchgangFertig() {
    if (!this.aktiv || this.imWechsel) return;
    const e = this.etappe, st = this.station;
    if (!e || !st) return;
    this.zustand(e).stationen[st.id].versuche++;
    if (this.anhoeren) {
      // Vorgespielt: zurueck zu deiner Hand, du bist dran
      this.anhoeren = false;
      this.tr.loopStoppen();
      this.einst.set('spiel.hand', st.hand);
      this.nachricht = 'Jetzt du – tippe auf Abspielen.';
      this.melde('station');
      return;
    }
    if (this.schleife()) {
      this.runde++;
      this.heute().sauber++;
      // Tempo-Treppe in der Schleife: jede Runde etwas schneller (bis zum Zieltempo)
      if (this.einst.get('uebeweg.treppe')) {
        const z = this.zustand(e).stationen[st.id];
        const ziel = this.zielTempo();
        if ((z.tempo || st.tempo) < ziel - 1e-3) {
          z.tempo = Math.min(ziel, Math.round(((z.tempo || st.tempo) + 0.05) * 100) / 100);
          this.tr.setSpeed(z.tempo);
          this.speichernSpaeter();
        }
      }
      this.nachricht = `Runde ${this.runde + 1}. Tippe „Geschafft“, wenn du weiter willst.`;
      this.melde('runde', this.runde);
      return;
    }
    this.tr.loopStoppen();                       // ohne Schleife: anhalten
    this.wartetAufUrteil = true;
    this.nachricht = 'Einmal durch. Geschafft – oder nochmal?';
    this.melde('urteil');
  }

  // "Geschafft": einmal durchgespielt – abhaken und weiter
  geschafft() {
    const e = this.etappe, st = this.station;
    if (!this.aktiv || this.imWechsel || !e || !st) return;
    if (this.anhoeren) { this.anhoeren = false; this.einst.set('spiel.hand', st.hand); }
    const ez = this.zustand(e);
    const z = ez.stationen[st.id];
    const weiterSpielen = this.tr.spielt || this.wartetAufUrteil || this.schleife();
    this.wartetAufUrteil = false;
    this.heute().sauber++;
    // Im Tempo: erst bis zum Zieltempo steigern
    if (st.leiter && (z.tempo || st.tempo) < this.zielTempo() - 1e-3) {
      z.tempo = Math.min(this.zielTempo(), Math.round(((z.tempo || st.tempo) + 0.1) * 100) / 100);
      this.tr.setSpeed(z.tempo);
      this.nachricht = `${zufall(LOB)} Jetzt ${Math.round(z.tempo * 100)} %.`;
      this.speichernSpaeter();
      this.melde('wertung', true);
      if (!this.tr.spielt) this.nochmal();
      return;
    }
    z.fertig = true;
    const warFertig = ez.fertig;
    if (this.etappeKomplett(e)) { ez.fertig = true; ez.fertigAm = Date.now(); if (!warFertig) this.heute().etappen++; }
    this.speichernSpaeter();
    this.melde('stationFertig', { station: st, etappe: e, etappeFertig: ez.fertig && !warFertig });
    this.naechsterSchritt(st, { abspielen: weiterSpielen });
  }

  // Naechste Station bzw. Etappe – je nach Reihenfolge
  naechsterSchritt(st, { sofort = false, abspielen = null } = {}) {
    const e = this.etappe;
    const lief = abspielen ?? (this.tr.spielt || this.schleife());
    const ziel = this.naechstesZiel(e, st);
    if (!ziel) {
      this.nachricht = 'Du hast den ganzen Übeweg einmal durchgespielt. Das ganze Lied – stark!';
      this.tr.pause();
      this.melde('fertig');
      return;
    }
    const wechsel = ziel.i !== this.daten.aktuell;
    this.daten.aktuell = ziel.i;
    this.stWahl = ziel.st;
    const neu = this.etappen[ziel.i];
    const stNeu = this.station;
    this.nachricht = wechsel
      ? `${zufall(LOB)} Weiter: ${neu.typ === 'durchlauf' ? `alle zusammen (${neu.teil})` : neu.typ === 'abschnitt' ? `${neu.teil}, ${this.taktText(neu)}` : neu.titel}${stNeu ? ` – ${HAND_NAME[stNeu.id]}` : ''}.`
      : `${zufall(LOB)} Weiter: ${stNeu ? stNeu.titel : ''}.`;
    this.melde('station');
    if (sofort) { this.anwenden({ abspielen: lief }); return; }
    this.wechselNach(lief ? 1200 : 400, lief);
  }

  naechstesZiel(e, st) {
    const i0 = this.daten.aktuell;
    const ez = this.zustand(e);
    const offen = (x) => x.stationen.find((s) => s.pflicht && !this.zustand(x).stationen[s.id].fertig);
    const hatPflicht = (x, id) => x.stationen.some((s) => s.id === id && s.pflicht);
    if (this.handweise() && HAND_FOLGE.includes(st.id) && (e.typ === 'abschnitt' || e.typ === 'durchlauf')) {
      // Hand fuer Hand: naechster Abschnitt dieses Liedteils mit derselben Hand, dann alle zusammen, dann naechste Hand
      const teil = this.etappen.map((x, i) => ({ x, i })).filter(({ x }) => x.teil === e.teil);
      const abschn = teil.filter(({ x }) => x.typ === 'abschnitt');
      const zus = teil.find(({ x }) => x.typ === 'durchlauf');
      const offenFuer = (x, h) => hatPflicht(x, h) && !this.zustand(x).stationen[h].fertig;
      for (const h of HAND_FOLGE.slice(HAND_FOLGE.indexOf(st.id))) {
        const kandidaten = abschn.filter(({ x, i }) => !(h === st.id && i === i0) && offenFuer(x, h));
        if (kandidaten.length) {
          const danach = h === st.id ? kandidaten.find(({ i }) => i > i0) : null;   // mit derselben Hand: erst die folgenden
          const k = danach || kandidaten[0];
          return { i: k.i, st: h };
        }
        if (zus && offenFuer(zus.x, h)) return { i: zus.i, st: h };
      }
      // Liedteil mit allen Haenden durch: Singen in den Abschnitten (falls offen), sonst der naechste Liedteil
      const singen = abschn.find(({ x }) => offen(x));
      if (singen) return { i: singen.i, st: offen(singen.x).id };
      const weiter = this.etappen.findIndex((x, i) => i > i0 && x.teil !== e.teil && x.typ !== 'verbinden' && offen(x));
      if (weiter >= 0) return { i: weiter, st: offen(this.etappen[weiter]).id };
    } else {
      // Abschnitt fuer Abschnitt: naechste offene Pflicht-Station dieser Etappe, sonst die naechste Etappe
      const hier = e.stationen.find((s) => s.pflicht && !ez.stationen[s.id].fertig);
      if (hier) return { i: i0, st: hier.id };
      const weiter = this.etappen.findIndex((x, i) => i > i0 && offen(x));
      if (weiter >= 0) return { i: weiter, st: offen(this.etappen[weiter]).id };
    }
    const vorn = this.etappen.findIndex((x) => offen(x));
    if (vorn >= 0) return { i: vorn, st: offen(this.etappen[vorn]).id };
    return null;
  }

  wechselNach(ms, abspielen = true) {
    clearTimeout(this._wechsel);
    this.imWechsel = true;
    this.tr.loopStoppen();
    this._wechsel = setTimeout(() => { this.imWechsel = false; if (this.aktiv) this.anwenden({ abspielen }); }, ms);
  }

  // "Nochmal": den Abschnitt von vorn (mit Einzaehlen)
  nochmal() {
    if (!this.aktiv || this.imWechsel) return;
    const st = this.station;
    if (this.anhoeren && st) { this.anhoeren = false; this.einst.set('spiel.hand', st.hand); }
    this.wartetAufUrteil = false;
    const { a } = this.bereich();
    this.tr.pause();
    this.tr.seek(a, { weiter: false });
    this.nachricht = this.schleife() ? 'Von vorn.' : 'Nochmal von vorn.';
    this.melde('wertung', false);
    this.tr.play({ einzaehlen: this.einzaehlSchlaege() });
  }

  // (alte Namen, fuer Pedal und Tastatur)
  werten(sauber) { if (sauber) this.geschafft(); else this.nochmal(); }

  // Die App spielt den Abschnitt einmal mit beiden Haenden vor
  vorspielen() {
    const e = this.etappe;
    if (!this.aktiv || !e) return;
    clearTimeout(this._wechsel);
    this.imWechsel = false;
    this.wartetAufUrteil = false;
    this.tr.pause();
    this.anhoeren = true;
    this.einst.set('spiel.hand', 'nichts');
    this.tr.seek(this.bereich(e).a, { weiter: false });
    this.nachricht = 'Hör erst zu – danach bist du dran.';
    this.melde('station');
    this.tr.play({ einzaehlen: 0 });
  }

  // Ohne Abhaken weiter bzw. zurueck (Etappe fuer Etappe im Lernpfad, "verbinden" in Hand-fuer-Hand uebersprungen)
  schritt(n) {
    const ueberspringen = (x) => this.handweise() && x.typ === 'verbinden';
    let i = this.daten.aktuell;
    do { i += n; } while (i >= 0 && i < this.etappen.length && ueberspringen(this.etappen[i]));
    if (i < 0 || i >= this.etappen.length) return;
    const st = this.station;
    const lief = this.tr.spielt;
    this.daten.aktuell = i;
    const e = this.etappe;
    this.stWahl = st && e.stationen.some((s) => s.id === st.id) ? st.id : null;
    this.speichernSpaeter();
    this.anwenden({ abspielen: lief });
  }

  ueberspringen() { this.schritt(1); }

  // Alle Abschnitte des Liedteils zusammen (bzw. zurueck zum ersten offenen Abschnitt)
  teilZusammen() {
    const e = this.etappe;
    if (!e) return;
    const st = this.station;
    const lief = this.tr.spielt;
    if (e.typ === 'durchlauf') {
      const liste = this.teilListe(e).filter(({ e: x }) => x.typ === 'abschnitt');
      const ziel = liste.find(({ e: x }) => st && !this.zustand(x).stationen[st.id]?.fertig) || liste[0];
      if (ziel) this.daten.aktuell = ziel.i;
    } else {
      const i = this.zusammenIndex(e);
      if (i < 0) return;
      this.daten.aktuell = i;
    }
    this.stWahl = st ? st.id : null;
    this.speichernSpaeter();
    this.anwenden({ abspielen: lief });
  }

  springen(index) {
    if (index < 0 || index >= this.etappen.length) return;
    const st = this.station;
    this.daten.aktuell = index;
    const e = this.etappe;
    this.stWahl = st && e.stationen.some((s) => s.id === st.id && s.pflicht) ? st.id : null;
    this.speichernSpaeter();
    this.anwenden({ abspielen: false });
  }

  // Geschaffte Etappen kommen nach 1, 3, 7, 14 und 30 Tagen zur Wiederholung
  istFaellig(e) {
    const ez = this.zustand(e);
    if (!ez.fertig || !ez.fertigAm) return false;
    const tage = [1, 3, 7, 14, 30][Math.min(4, ez.wiederholt || 0)];
    return Date.now() - ez.fertigAm > tage * 86400000;
  }

  faellige() { return this.etappen.map((e, i) => ({ e, i })).filter(({ e }) => this.istFaellig(e)); }

  stationWaehlen(stId) {
    const e = this.etappe;
    if (!e || !e.stationen.some((st) => st.id === stId)) return;
    const lief = this.tr.spielt;
    this.stWahl = stId;
    this.speichernSpaeter();
    this.anwenden({ abspielen: lief });
  }

  // Wackelstellen: schwierige Stellen merken und gezielt wieder aufsuchen
  wackelUmschalten() {
    const e = this.etappe;
    if (!e) return;
    const z = this.zustand(e);
    z.wackel = !z.wackel;
    this.nachricht = z.wackel ? 'Gemerkt: diese Stelle findest du im Lernpfad und mit „Gemerkte Stellen“ wieder.' : 'Nicht mehr gemerkt.';
    this.speichernSpaeter();
    this.melde('station');
  }

  wackelListe() { return this.etappen.map((e, i) => ({ e, i })).filter(({ e }) => this.daten.etappen[e.id]?.wackel); }

  // zur naechsten gemerkten Stelle (nach der aktuellen, sonst von vorn)
  naechsteWackelstelle() {
    const l = this.wackelListe();
    if (!l.length) return false;
    const z = l.find(({ i }) => i > this.daten.aktuell) || l[0];
    this.springen(z.i);
    return true;
  }

  // Abhaken zuruecknehmen (im Lernpfad lange druecken bzw. "Haken entfernen")
  hakenWeg(stId) {
    const e = this.etappe, ez = this.zustand(e);
    if (!ez.stationen[stId]) return;
    ez.stationen[stId].fertig = false;
    ez.fertig = this.etappeKomplett(e);
    this.speichernSpaeter();
    this.melde('station');
  }

  tempoAendern(d) {
    const e = this.etappe, st = this.station;
    if (!e || !st) return;
    const z = this.zustand(e).stationen[st.id];
    z.tempo = Math.max(0.3, Math.min(1.3, Math.round(((z.tempo || st.tempo) + d) * 100) / 100));
    this.tr.setSpeed(z.tempo);
    this.speichernSpaeter();
    this.melde('tempo');
  }

  zuruecksetzenAlles() {
    this.daten = { etappen: {}, tage: this.daten.tage || {}, aktuell: 0, schema: 3 };
    this.stWahl = null;
    this.speichernSpaeter();
    this.planBauen();
    this.anwenden({ abspielen: false });
  }

  tick(dt) {
    if (!this.aktiv || dt >= 1) return;
    // Uebezeit: waehrend gespielt wird und kurz danach (hoechstens 30 s ohne Spielen)
    const zaehlt = this.tr.spielt || (this.wartetAufUrteil && (this._wartenSeit = this._wartenSeit || performance.now()) && performance.now() - this._wartenSeit < 30000);
    if (!this.wartetAufUrteil) this._wartenSeit = 0;
    if (!zaehlt) return;
    const h = this.heute();
    const vorher = h.sekunden;
    h.sekunden += dt;
    const s0 = this.sitzung;
    this.sitzung += dt;
    if (s0 < 1500 && this.sitzung >= 1500) this.melde('pause');
    const ziel = (this.einst.get('uebeweg.tagesZiel') || 0) * 60;
    if (ziel > 0 && vorher < ziel && h.sekunden >= ziel) { this.speichernSpaeter(); this.melde('tagesziel', ziel / 60); }
    if (Math.floor(h.sekunden / 60) !== Math.floor(vorher / 60)) { this.speichernSpaeter(); this.melde('minute'); }
  }
}
