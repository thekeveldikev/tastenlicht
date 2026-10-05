// Uebeweg (iPad-Fassung): das Lied Stueck fuer Stueck lernen – kurze Abschnitte, erst links, dann rechts,
// dann beide; dreimal sauber, dann weiter; langsam beginnen, Tempo erst steigern, wenn es sitzt; den
// Uebergangston mitueben; Abschnitte verbinden.
// Unterschied zum Desktop: Das iPad hoert dein Klavier nicht. Nach jedem Durchgang haelt der Coach an und
// fragt "Geklappt?" – Antwort per Tippen, Enter oder Bluetooth-Fusspedal. Die App spielt dabei die Hand,
// die du gerade NICHT uebst (deine Hand ist stumm und hervorgehoben).
import { zeitAusBeat } from './song.js';

const LOB = ['Sehr schön!', 'Genau so!', 'Sauber gespielt.', 'Klasse – weiter so.', 'Das sitzt!', 'Schön ruhig.', 'Prima!', 'Wunderbar.'];
const MUT = ['Kein Problem – nochmal ganz in Ruhe.', 'Langsam ist schnell: noch ein Durchgang.', 'Fast! Gleich klappt es.', 'Schultern locker, nochmal.', 'Lieber langsam und sicher.'];
const zufall = (liste) => liste[Math.floor(Math.random() * liste.length)];
const tagName = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export class Uebeweg {
  constructor(k) {
    Object.assign(this, k);            // song, tr, einst, speicher, sichtbar
    this.aktiv = false;
    this.etappen = [];
    this.daten = { etappen: {}, tage: {}, aktuell: 0, schema: 2 };
    this.sauberFolge = 0;
    this.wartetAufUrteil = false;
    this.imWechsel = false;
    this.nachricht = '';
    this.hoerer = new Set();
    this.sitzung = 0;
    this.tr.on('loop', () => this.durchgangFertig());
  }

  on(fn) { this.hoerer.add(fn); }
  melde(art, x) { for (const f of this.hoerer) f(art, x); }

  // ---------------------------------------------------------------------------------- Daten
  schluessel() { return `uebeweg_${this.song.fassung.id}`; }

  laden() {
    const d = this.speicher.lesen(this.schluessel(), null);
    this.daten = d && typeof d === 'object'
      ? { etappen: d.etappen || {}, aktuell: d.aktuell || 0, schema: 2, aktuellId: d.aktuellId || null, aktuellVonB: d.aktuellVonB ?? null }
      : { etappen: {}, aktuell: 0, schema: 2 };
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
    if (e) { this.daten.aktuellId = e.id; this.daten.aktuellVonB = e.vonB; }
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
  zielTempo() { return (this.einst.get('uebeweg.zielTempo') || 100) / 100; }

  stationen(typ) {
    const begl = this.song.fassung.art === 'begleitung';
    const z = this.zielTempo();
    const start = (this.einst.get('uebeweg.startTempo') || 60) / 100;
    const S = (id, titel, hand, tempo, noetig = 3, extra = {}) => ({ id, titel, hand, tempo, noetig, ...extra });
    if (typ === 'abschnitt') {
      return [
        S('L', 'Linke Hand', 'L', start),
        S('R', 'Rechte Hand', 'R', start),
        S('B', 'Beide Hände', 'beide', start),
        S('T', 'Im Fluss', 'beide', Math.min(z, start + 0.1), 3, { leiter: true }),
        ...(begl ? [S('S', 'Singen & Spielen', 'beide', z, 2, { singen: true })] : []),
      ];
    }
    if (typ === 'verbinden') return [S('T', 'Verbinden', 'beide', Math.max(start, z - 0.2), 2, { leiter: true })];
    if (typ === 'durchlauf') {
      return [S('T', 'Am Stück', 'beide', Math.max(start, z - 0.1), 2, { leiter: true }),
        ...(begl ? [S('S', 'Singen & Spielen', 'beide', z, 1, { singen: true })] : [])];
    }
    return [S('T', 'Ganz durch', 'beide', z, 1), ...(begl ? [S('S', 'Singen & Spielen', 'beide', z, 1, { singen: true })] : [])];
  }

  planBauen() {
    const s = this.song;
    const laenge = this.einst.get('uebeweg.laenge') || 2;
    const et = [];
    let nr = 0;
    const abschnitte = s.abschnitte.filter((a) => a.name !== 'Vorspiel');
    const vorspiel = s.abschnitte.find((a) => a.name === 'Vorspiel');
    if (vorspiel) et.push({ id: 'a0', typ: 'abschnitt', nr: 0, titel: 'Vorspiel', teil: 'Vorspiel', vonB: -8, bisB: 0, farbe: vorspiel.farbe });
    abschnitte.forEach((teil) => {
      const takte = [];
      for (let t = teil.von; t <= teil.bis; t++) takte.push(t);
      const stuecke = [];
      for (let i = 0; i < takte.length; i += laenge) stuecke.push(takte.slice(i, i + laenge));
      if (stuecke.length > 1 && stuecke[stuecke.length - 1].length === 1 && laenge > 1) stuecke[stuecke.length - 2].push(...stuecke.pop());
      const ersteNr = nr + 1;
      stuecke.forEach((st, i) => {
        nr++;
        const vor = stuecke[i - 1];
        const ende = st[st.length - 1];
        et.push({ id: `t${st[0]}-${ende}`, typ: 'abschnitt', nr, titel: `Abschnitt ${nr}`, teil: teil.name, vonB: (st[0] - 1) * 4, bisB: ende * 4, farbe: teil.farbe });
        if (i > 0) et.push({ id: `v${vor[0]}-${ende}`, typ: 'verbinden', nr, titel: `${nr - 1} + ${nr} verbinden`, teil: teil.name, vonB: (vor[0] - 1) * 4, bisB: ende * 4, farbe: teil.farbe });
      });
      if (stuecke.length > 1) et.push({ id: `d${teil.von}-${teil.bis}`, typ: 'durchlauf', nr: `${ersteNr}–${nr}`, titel: `${teil.name} am Stück`, teil: teil.name, vonB: (teil.von - 1) * 4, bisB: teil.bis * 4, farbe: teil.farbe });
    });
    et.push({ id: 'ganz', typ: 'ganz', titel: 'Das ganze Lied', teil: 'Finale', vonB: vorspiel ? -8 : 0, bisB: abschnitte[abschnitte.length - 1].bis * 4, farbe: '#ffd36b' });
    for (const e of et) e.stationen = this.stationen(e.typ);
    this.etappen = et;
    let i = this.daten.aktuellId ? et.findIndex((e) => e.id === this.daten.aktuellId) : -1;
    if (i < 0 && this.daten.aktuellVonB != null) i = et.findIndex((e) => e.typ === 'abschnitt' && e.vonB <= this.daten.aktuellVonB && this.daten.aktuellVonB < e.bisB);
    this.daten.aktuell = i >= 0 ? i : Math.min(this.daten.aktuell || 0, et.length - 1);
  }

  ersteZeile(e) {
    const t0 = zeitAusBeat(this.song, e.vonB), t1 = zeitAusBeat(this.song, e.bisB);
    return (this.song.zeilen || []).find((x) => !x.summen && x.ts >= t0 - 0.4 && x.ts < t1) || null;
  }

  // ---------------------------------------------------------------------------------- Zustand
  zustand(e) {
    const d = (this.daten.etappen[e.id] = this.daten.etappen[e.id] || { stationen: {}, fertig: false, sterne: 0 });
    for (const st of e.stationen) d.stationen[st.id] = d.stationen[st.id] || { fertig: false, sauber: 0, versuche: 0, tempo: st.tempo };
    return d;
  }

  get etappe() { return this.etappen[this.daten.aktuell]; }

  stationIndex(e = this.etappe) {
    const z = this.zustand(e);
    const i = e.stationen.findIndex((st) => !z.stationen[st.id].fertig);
    return i < 0 ? e.stationen.length - 1 : i;
  }

  get station() { const e = this.etappe; return e ? e.stationen[this.stationIndex(e)] : null; }

  fortschritt() {
    const fertig = this.etappen.filter((e) => this.zustand(e).fertig).length;
    return { fertig, gesamt: this.etappen.length, anteil: this.etappen.length ? fertig / this.etappen.length : 0 };
  }

  // ---------------------------------------------------------------------------------- Ablauf
  starten() {
    this.laden();
    this.planBauen();
    this.aktiv = true;
    this.sitzung = 0;
    this.tr.loopEinzaehlen = this.einst.get('uebeweg.pauseEinzaehlen') ? 4 : 0;
    this.anwenden({ abspielen: false });
    this.melde('start');
  }

  beenden() {
    clearTimeout(this._wechsel);
    this.imWechsel = false;
    this.aktiv = false;
    this.tr.loopEinzaehlen = 0;
    this.tr.loopAus();
    this.wartetAufUrteil = false;
    this.einst.set('spiel.hand', 'nichts');
    this.speichernJetzt();
    this.melde('ende');
  }

  hatNoten(e, hand, uebergang = 1) {
    return this.song.alleNoten.some((n) => n.hand !== 'V' && (hand === 'beide' || n.hand === hand)
      && n.b >= e.vonB - 1e-3 && n.b < e.bisB + uebergang - 1e-3 && this.sichtbar(n));
  }

  anwenden({ abspielen = null } = {}) {
    clearTimeout(this._wechsel);
    this.imWechsel = false;
    const e = this.etappe, st = this.station;
    if (!this.aktiv || !e || !st) return;
    const z = this.zustand(e).stationen[st.id];
    const lief = abspielen ?? this.tr.spielt;
    this.tr.pause();
    const uebergang = e.typ === 'ganz' ? 0 : 1;               // Uebergangston (erster Schlag danach) mitueben
    if ((st.id === 'L' || st.id === 'R') && !this.hatNoten(e, st.hand, uebergang)) {
      z.fertig = true;                                         // diese Hand hat hier Pause
      this.speichernSpaeter();
      this.anwenden({ abspielen: lief });
      this.nachricht = `Die ${st.id === 'L' ? 'linke' : 'rechte'} Hand hat hier Pause. ${this.nachricht}`;
      this.melde('station');
      return;
    }
    this.einst.set('spiel.hand', st.hand);
    if (st.singen) { this.einst.set('liedtext.anzeigen', true); this.einst.set('ansicht.gesangslinie', true); }
    const a = zeitAusBeat(this.song, e.vonB);
    const b = Math.min(this.song.ende, zeitAusBeat(this.song, e.bisB + uebergang));
    this.tr.setLoop(a, b, true);
    this.tr.setSpeed(z.tempo || st.tempo);
    this.tr.seek(a, { weiter: false });
    this.sauberFolge = 0;
    this.wartetAufUrteil = false;
    this.nachricht = this.anleitung(e, st);
    this.melde('station');
    if (lief) this.tr.play({ einzaehlen: 4 });
  }

  anleitung(e, st) {
    const was = e.typ === 'abschnitt' ? (e.nr === 0 ? 'das Vorspiel' : `Abschnitt ${e.nr} (${this.taktText(e)})`)
      : e.typ === 'verbinden' ? `die Abschnitte ${e.nr - 1} und ${e.nr} zusammen` : e.typ === 'durchlauf' ? `„${e.teil}“ am Stück` : 'das ganze Lied';
    const tempo = Math.round((this.zustand(e).stationen[st.id].tempo || st.tempo) * 100);
    switch (st.id) {
      case 'L': return `Nur die linke Hand: ${was}, langsam (${tempo} %). Die App spielt die rechte Hand dazu. Dreimal sauber, dann geht’s weiter.`;
      case 'R': return `Jetzt die rechte Hand allein, ${was}. Die App spielt die linke Hand leise mit.`;
      case 'B': return `Beide Hände zusammen, ${was}. Langsam ist erlaubt.`;
      case 'T': return st.leiter ? `Im Fluss: ${was}. Nach jedem „Geklappt“ wird es etwas schneller – bis ${Math.round(this.zielTempo() * 100)} %.` : `Jetzt ${was} durchspielen – du kannst das!`;
      case 'S': return `Sing dazu und spiel die Begleitung: ${was}. Sag danach ehrlich, ob es geklappt hat.`;
      default: return '';
    }
  }

  taktText(e) {
    const a = Math.floor(e.vonB / 4) + 1, b = e.bisB / 4;
    return a < 1 ? 'Vorspiel' : a === b ? `Takt ${a}` : `Takt ${a}–${b}`;
  }

  // Ein Durchgang ist zu Ende: nachfragen (Standard) oder automatisch zaehlen
  durchgangFertig() {
    if (!this.aktiv || this.imWechsel) return;
    if (this.einst.get('uebeweg.nachfragen') !== false) {
      this.tr.loopStoppen();                     // nach dem Durchgang anhalten und fragen
      this.wartetAufUrteil = true;
      this.nachricht = 'Hat es geklappt?';
      this.melde('urteil');
      return;
    }
    const sauber = !this.nochmalGetippt;
    this.nochmalGetippt = false;
    this.werten(sauber, { weiter: false });
  }

  // Ergebnis eines Durchgangs verbuchen. weiter: nach dem Urteil gleich den naechsten Durchgang starten
  werten(sauber, { weiter = true } = {}) {
    const e = this.etappe, st = this.station;
    if (!this.aktiv || this.imWechsel || !e || !st) return;
    if (!this.wartetAufUrteil && this.einst.get('uebeweg.nachfragen') === false && !sauber && this.tr.spielt) {
      this.nochmalGetippt = true;                 // ohne Nachfragen: "Nochmal" markiert den laufenden Durchgang
      this.nachricht = 'Notiert – dieser Durchgang zählt nicht.';
      this.melde('wertung', false);
      return;
    }
    const z = this.zustand(e).stationen[st.id];
    const warUrteil = this.wartetAufUrteil;
    this.wartetAufUrteil = false;
    z.versuche++;
    if (sauber) this.heute().sauber++;
    const ziel = st.singen ? st.tempo : this.zielTempo();
    if (sauber) {
      z.sauber++;
      if (st.leiter && (z.tempo || st.tempo) < ziel - 1e-3) {
        z.tempo = Math.min(ziel, Math.round(((z.tempo || st.tempo) + 0.1) * 100) / 100);
        this.tr.setSpeed(z.tempo);
        this.sauberFolge = 0;
        this.nachricht = `${zufall(LOB)} Tempo hoch auf ${Math.round(z.tempo * 100)} %.`;
      } else {
        this.sauberFolge++;
        this.nachricht = this.sauberFolge >= st.noetig ? '' : `${zufall(LOB)} ${this.sauberFolge} von ${st.noetig} sauber.`;
      }
    } else {
      this.sauberFolge = 0;
      if (st.leiter && (z.tempo || st.tempo) > 0.5) { z.tempo = Math.max(0.5, Math.round(((z.tempo || st.tempo) - 0.05) * 100) / 100); this.tr.setSpeed(z.tempo); }
      this.nachricht = zufall(MUT);
    }
    this.speichernSpaeter();
    this.melde('wertung', sauber);
    if (this.sauberFolge >= st.noetig) { this.stationFertig(); return; }
    // nach dem Urteil weiter: ruhig einzaehlen und den naechsten Durchgang spielen
    if (warUrteil && weiter && !this.tr.spielt) { this.tr.seek(this.tr.loop.a, { weiter: false }); this.tr.play({ einzaehlen: 4 }); }
  }

  stationFertig() {
    const e = this.etappe, st = this.station;
    const ez = this.zustand(e);
    ez.stationen[st.id].fertig = true;
    this.sauberFolge = 0;
    const offen = e.stationen.filter((s) => !ez.stationen[s.id].fertig);
    if (!offen.length) { this.etappeFertig(); return; }
    this.nachricht = `${st.titel} geschafft! Weiter: ${offen[0].titel}.`;
    this.melde('stationFertig', st);
    this.wechselNach(1600);
  }

  wechselNach(ms) {
    clearTimeout(this._wechsel);
    this.imWechsel = true;
    this.tr.loopStoppen();
    this._wechsel = setTimeout(() => { this.imWechsel = false; if (this.aktiv) this.anwenden({ abspielen: true }); }, ms);
  }

  etappeFertig() {
    const e = this.etappe;
    const ez = this.zustand(e);
    const versuche = e.stationen.reduce((s, st) => s + ez.stationen[st.id].versuche, 0);
    const sauber = e.stationen.reduce((s, st) => s + ez.stationen[st.id].sauber, 0);
    const q = versuche ? sauber / versuche : 1;
    if (ez.fertig && ez.wiederholung) ez.wiederholt = (ez.wiederholt || 0) + 1;
    ez.wiederholung = false;
    ez.fertigAm = Date.now();
    ez.fertig = true;
    ez.sterne = Math.max(ez.sterne || 0, q >= 0.75 ? 3 : q >= 0.5 ? 2 : 1);
    this.heute().etappen++;
    const offen = this.etappen.findIndex((x, i) => i > this.daten.aktuell && !this.zustand(x).fertig);
    const offenVorn = this.etappen.findIndex((x) => !this.zustand(x).fertig);
    const naechste = offen >= 0 ? offen : offenVorn >= 0 ? offenVorn : this.etappen.length;
    this.melde('etappeFertig', { etappe: e, sterne: ez.sterne });
    this.speichernSpaeter();
    if (naechste < this.etappen.length) {
      this.daten.aktuell = naechste;
      this.nachricht = `${e.titel} geschafft – ${ez.sterne} von 3 Sternen! Gleich geht es weiter mit: ${this.etappe.titel}.`;
      this.wechselNach(2600);
    } else {
      this.nachricht = 'Du hast den ganzen Übeweg geschafft. Das ganze Lied – mit beiden Händen. Wahnsinn!';
      this.tr.pause();
    }
  }

  springen(index) {
    if (index < 0 || index >= this.etappen.length) return;
    this.daten.aktuell = index;
    const e = this.etappe, ez = this.zustand(e);
    if (ez.fertig) {
      ez.wiederholung = true;                    // Wiederholung: nur noch "Im Fluss" (und "Singen & Spielen")
      for (const st of e.stationen) ez.stationen[st.id].fertig = !(st.id === 'T' || st.id === 'S');
    }
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
    const ez = this.zustand(e);
    const i = e.stationen.findIndex((st) => st.id === stId);
    if (i < 0) return;
    e.stationen.forEach((st, k) => { ez.stationen[st.id].fertig = k < i; });
    if (ez.fertig) ez.wiederholung = true;
    this.sauberFolge = 0;
    this.speichernSpaeter();
    this.anwenden({ abspielen: false });
  }

  ueberspringen() {
    const st = this.station;
    if (!st || this.imWechsel) return;
    this.zustand(this.etappe).stationen[st.id].fertig = true;
    const e = this.etappe;
    if (e.stationen.every((s) => this.zustand(e).stationen[s.id].fertig)) this.etappeFertig();
    else this.anwenden({ abspielen: this.tr.spielt });
  }

  zuruecksetzenAlles() {
    this.daten = { etappen: {}, tage: this.daten.tage || {}, aktuell: 0, schema: 2 };
    this.speichernSpaeter();
    this.planBauen();
    this.anwenden({ abspielen: false });
  }

  tick(dt) {
    if (!this.aktiv || dt >= 1) return;
    // Uebezeit: waehrend gespielt wird und waehrend der Coach auf dein Urteil wartet (hoechstens 30 s)
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
