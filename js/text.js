// Text-Ansicht der iPad-Fassung: den Liedtext in Mundart ueber die Laute lernen.
// Vorbild ist die Lautschule der Desktop-App, hier fuer Touch neu gebaut (Hoch- und Querformat).
//
// Leck-Schutz: Diese Datei liegt spaeter OEFFENTLICH. Jeder liedbezogene Inhalt (Liedtext, Wortschatz,
// Lautlehre, "Worum geht's") kommt erst zur Laufzeit aus daten/ (verschluesselt). Hier nie Liedwoerter,
// Titel oder Namen eintragen. Die Oberflaeche sagt neutral "Mundart".
import { zeilenSilben, zeilenWoerter } from './silben.js';
import { zeileBei, zeitFormat } from './song.js';

// Standardwerte unter dem Praefix "text." – bitte in die Einstellungs-Standards uebernehmen
// (z. B. text: { ...TEXT_STANDARD, anzeigen: … }), sonst verwirft Einstellungen.laden() die
// gespeicherten Werte beim naechsten Start. "text.anzeigen" gehoert dem Klavier-Teil und wird hier nicht benutzt.
export const TEXT_STANDARD = {
  quelle: 'gesang', tempo: 0.8, schleife: false, echo: false, echoFaktor: 1.3,
  laut: { anlautKch: true, offenesAe: true, vollvokale: true, grossBetont: false },
  zeigeIpa: false, zeigeMelodie: true, abdecken: true,
  modus: 'hoeren', reiter: 'lautlehre', zeile: 1,
};

const MODI = [
  ['hoeren', 'Hören & Echo', 'ohr'],
  ['rueckwaerts', 'Rückwärts aufbauen', 'wiederholen'],
  ['luecken', 'Lückentext', 'text'],
  ['anfang', 'Anfangsbuchstaben', 'blatt'],
  ['karten', 'Karteikarten', 'karten'],
  ['lied', 'Ganzes Lied abfragen', 'noten'],
];
// In diesen Modi wird die Zeile oben abgedeckt (sonst stuende die Loesung direkt darueber)
const MODI_ABGEDECKT = ['rueckwaerts', 'luecken', 'anfang', 'karten'];
const REITER = [['lautlehre', 'Lautlehre'], ['wortschatz', 'Wortschatz'], ['legende', 'Zeichen'], ['worum', 'Worum geht’s'], ['fortschritt', 'Fortschritt']];
const TEMPI = [[0.5, '50 %'], [0.65, '65 %'], [0.8, '80 %'], [1, '100 %']];
const ABSTAENDE_TAGE = [0, 1, 2, 4, 8, 16];          // Leitner-Kaesten
const TAG_MS = 86400000;
const SCHRIFT = '-apple-system, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';

// ---------------------------------------------------------------------------------------------- Hilfen
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mach(tag, klasse = '', html = '') {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (html) e.innerHTML = html;
  if (tag === 'button') e.type = 'button';
  return e;
}

function heute() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function holeJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.warn('Text-Ansicht: nicht ladbar', url, e);
    return null;
  }
}

// Mini-Markdown der Lautlehre (fett, kursiv, Spiegelstriche, Zeilenumbrueche)
function md(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/^- (.*)$/gm, '– $1').replace(/\n/g, '<br>');
}

function zufall(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

function istKurzwort(w) {
  const nackt = w.replace(/[.,!?;:]/g, '');
  return !/[aeiouäöüy]/i.test(nackt) && !/^h?m+h?$/i.test(nackt);
}

function dauerText(tage) {
  if (tage < 1) return `${Math.max(1, Math.round(tage * 24))} Std.`;
  return tage === 1 ? '1 Tag' : `${tage} Tage`;
}

function rund(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ============================================================================================== Ansicht
export class TextAnsicht {
  constructor({ wurzel, song, engine, einst, speicher, quelle, symbol, setzeSymbol, toast, zurKlavier }) {
    this.wurzel = wurzel;
    this.song = song;
    this.engine = engine;
    this.einst = einst;
    this.speicher = speicher;
    this.quelle = quelle;
    this.symbol = symbol;
    this.setzeSymbol = setzeSymbol;
    this.toast = toast || (() => {});
    this.zurKlavier = zurKlavier || (() => {});

    this.phon = null;
    this.lautlehre = { kapitel: [] };
    this.worum = null;
    this.fort = { zeilen: {}, tage: {} };
    this.r = null;                     // Verweise auf die Bausteine der Oberflaeche
    this.gebaut = false;
    this.sichtbar = false;
    this._startet = null;

    this.zeile = null;                 // aktuelle Zeile
    this.silbenSpans = [];             // Silben der Originalzeile (Karaoke)
    this.melodieZeit = null;           // Abspielkopf der Melodie-Leiste
    this._gezeichnet = '';
    this.modusZustand = {};
    this.textOffen = false;            // abgedeckte Zeile vorruebergehend zeigen

    this.medien = {};                  // 'gesang' | 'original' -> { el, bereit }
    this.auftrag = null;               // laufender Abspielauftrag der Aufnahme
    this.echoTimer = null;
    this.melodieAuftrag = 0;
    this.melodieAktiv = false;
    this.melodieStimmen = [];          // eigene Sampler-Stimmen der Melodie (zum gezielten Stoppen)
    this.raf = 0;
    this.uhr = performance.now();
    this._minute = -1;
    this.popAnker = null;
    this._schleife = (t) => this._tick(t);
  }

  // ------------------------------------------------------------------------------------ Einstellungen
  // gespeicherter Wert unter "text.<pfad>" oder der Standard aus TEXT_STANDARD
  wert(pfad) {
    let v;
    try { v = this.einst ? this.einst.get('text.' + pfad) : undefined; } catch { v = undefined; }
    if (v !== undefined && v !== null) return v;
    return pfad.split('.').reduce((o, k) => (o == null ? undefined : o[k]), TEXT_STANDARD);
  }

  setze(pfad, wert, opts) {
    try { this.einst?.set('text.' + pfad, wert, opts); } catch (e) { console.warn(e); }
  }

  _lautOptionen() {
    const o = {};
    for (const k of Object.keys(TEXT_STANDARD.laut)) o[k] = !!this.wert('laut.' + k);
    return o;
  }

  // ------------------------------------------------------------------------------------ Start
  async start() {
    if (!this._startet) {
      this._startet = this._starten().catch((e) => {
        console.error('Text-Ansicht:', e);
        this._startet = null;
        if (!this.gebaut) this.wurzel.innerHTML = `<div class="tx-laden">Die Text-Ansicht konnte nicht laden: ${esc(e.message)}</div>`;
        throw e;
      });
    }
    return this._startet;
  }

  async _starten() {
    if (!this.gebaut) this.wurzel.innerHTML = '<div class="tx-laden">Lade …</div>';
    const [phon, ws, ll, wo, fort] = await Promise.all([
      import('../daten/phonetik.js'),
      holeJson('daten/wortschatz.json'),
      holeJson('daten/lautlehre.json'),
      holeJson('daten/worum.json'),
      Promise.resolve().then(() => (this.speicher ? this.speicher.lesen('text_fortschritt', null) : null)).catch(() => null),
    ]);
    this.phon = phon;
    if (ws) { try { phon.setWortschatz(ws); } catch (e) { console.warn('Wortschatz', e); } }
    this.lautlehre = ll && Array.isArray(ll.kapitel) ? ll : { kapitel: [] };
    this.worum = wo && typeof wo === 'object' ? wo : null;
    this.fort = fort && typeof fort === 'object' ? fort : {};
    if (!this.fort.zeilen || typeof this.fort.zeilen !== 'object') this.fort.zeilen = {};
    if (!this.fort.tage || typeof this.fort.tage !== 'object') this.fort.tage = {};

    // Silben den gesungenen Noten zuordnen (wie die Desktop-Lautschule)
    for (const z of this.song.zeilen || []) {
      const s = zeilenSilben(z.text);
      if (z.silben && s.length === z.silben.length) z.silben.forEach((n, i) => { n.silbe = s[i].text; });
    }

    this._bauen();
    this.gebaut = true;

    // Aufnahmen vorbereiten: dann spielt der erste Tipp sofort (iOS verlangt play() innerhalb der Beruehrung)
    const erste = this._quelleName();
    this._medium(erste).bereit
      .then(() => this._medium(erste === 'gesang' ? 'original' : 'gesang'))
      .catch(() => {});

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.stop(); this._fortSpeichern(true); }
    });
    window.addEventListener('pagehide', () => this._fortSpeichern(true));
    try { this.einst?.beiAenderung?.((p) => this._einstGeaendert(p)); } catch { /* egal */ }
    try {
      const mq = window.matchMedia('(orientation: portrait)');
      const zu = () => this._blattZu();
      if (mq.addEventListener) mq.addEventListener('change', zu); else if (mq.addListener) mq.addListener(zu);
    } catch { /* egal */ }
  }

  // ------------------------------------------------------------------------------------ Zeigen / Verstecken
  zeigen(zeileNr = null) {
    this.sichtbar = true;
    this.wurzel.classList.remove('versteckt');
    if (!this.gebaut) {
      this.start().then(() => { if (this.sichtbar) this._zeigenFertig(zeileNr); }).catch(() => {});
      return;
    }
    this._zeigenFertig(zeileNr);
  }

  _zeigenFertig(nr) {
    if (nr != null && nr !== '' && Number.isFinite(Number(nr))) this.waehleZeile(Number(nr), { mitte: true });
    else this._listeInSicht(true);
    this._kopfStand();
    this._gezeichnet = '';
    this.uhr = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this._schleife);
  }

  verstecken() {
    this.sichtbar = false;
    this.stop();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this._kartenTimer);
    if (this.gebaut) { this._popZu(); this._blattZu(); }
    this._fortSpeichern(true);
    try { this.einst?.speichernJetzt?.(); } catch { /* egal */ }
    this.wurzel.classList.add('versteckt');
  }

  _tick(jetzt) {
    if (!this.sichtbar) return;
    const dt = (jetzt - this.uhr) / 1000;
    this.uhr = jetzt;
    this._letzterTick = performance.now();
    const au = this.auftrag;
    if (au && au.el) {
      const el = au.el;
      if (!el.paused && dt > 0 && dt < 1) {
        const tag = this._tag();
        tag.sekunden += dt;
        const min = Math.floor(tag.sekunden / 60);
        if (min !== this._minute) { this._minute = min; this._kopfStand(); this._fortSpeichern(); }
      }
      const t = el.currentTime;
      if (!el.paused) {
        if (au.opts.zeile && au.opts.zeile === this.zeile) { this.melodieZeit = t; this._silbenMarkieren(t); }
        if (au.opts.beiZeit) au.opts.beiZeit(t);
      }
      // Bereichsende erreicht – oder die Aufnahme ist vorher zu Ende
      if (!au.pause && (el.ended || (!el.paused && t >= au.e))) this._rundeFertig(au);
    }
    this._melodieZeichnen();
    this.raf = requestAnimationFrame(this._schleife);
  }

  // ------------------------------------------------------------------------------------ Oberflaeche bauen
  _bauen() {
    this.wurzel.innerHTML = `
<div class="tx-app">
  <header class="tx-kopf">
    <button type="button" class="knopf rund tx-k-zeilen" data-a="zeilen" aria-label="Zeilen"></button>
    <div class="tx-marke"><div class="tx-titel">Text</div><div class="tx-unter">Mundart über die Laute lernen</div></div>
    <div class="tx-stand"></div>
    <span class="tx-frei"></span>
    <button type="button" class="knopf tx-k-nach" data-a="blatt"></button>
    <button type="button" class="knopf" data-a="klavier"></button>
  </header>
  <nav class="tx-leiste" aria-label="Zeilen"></nav>
  <aside class="tx-liste glas">
    <div class="tx-blatt-kopf"><h2>Zeilen</h2><button type="button" class="knopf rund" data-a="zu" aria-label="Schließen"></button></div>
    <div class="tx-liste-inhalt"></div>
  </aside>
  <main class="tx-mitte">
    <section class="glas tx-karte">
      <div class="tx-karte-kopf">
        <span class="pille tx-abschnitt"><i></i><span></span></span>
        <span class="tx-zkinfo"><span class="tx-zknr"></span><span class="tx-wdh"></span></span>
        <span class="tx-sterne"></span>
        <span class="tx-frei"></span>
        <button type="button" class="knopf tx-zeigen versteckt" data-a="zeigen"></button>
      </div>
      <div class="tx-original"></div>
      <div class="tx-laut"></div>
      <div class="tx-ipa"></div>
      <div class="tx-mbox"><canvas class="tx-melodie" aria-hidden="true"></canvas><div class="tx-echo versteckt">Jetzt du!</div></div>
      <div class="tx-steuer">
        <span class="tx-transport">
          <button type="button" class="knopf rund" data-a="vor" aria-label="Vorige Zeile"></button>
          <button type="button" class="knopf gross akzent tx-play" data-a="play"></button>
          <button type="button" class="knopf rund" data-a="weiter" aria-label="Nächste Zeile"></button>
        </span>
        <div class="segmente tx-seg-quelle"><button type="button" data-wert="gesang">Gesang</button><button type="button" data-wert="original">Original</button></div>
        <div class="segmente tx-seg-tempo">${TEMPI.map(([w, n]) => `<button type="button" data-wert="${w}">${n}</button>`).join('')}</div>
        <button type="button" class="knopf" data-a="schleife"></button>
        <button type="button" class="knopf" data-a="echo"></button>
        <button type="button" class="knopf" data-a="melodie"></button>
      </div>
    </section>
    <nav class="tx-modi"></nav>
    <section class="glas tx-modus"></section>
  </main>
  <aside class="tx-nach glas">
    <div class="tx-nach-kopf"><nav class="reiter tx-reiter"></nav><button type="button" class="knopf rund tx-nach-zu" data-a="zu" aria-label="Schließen"></button></div>
    <div class="tx-nach-inhalt"></div>
  </aside>
  <div class="tx-hinter"></div>
  <div class="tx-pop glas versteckt" role="dialog"></div>
</div>`;
    const q = (s) => this.wurzel.querySelector(s);
    const r = (this.r = {
      app: q('.tx-app'), stand: q('.tx-stand'), leiste: q('.tx-leiste'), liste: q('.tx-liste'), listeInhalt: q('.tx-liste-inhalt'),
      mitte: q('.tx-mitte'), karte: q('.tx-karte'), abschnitt: q('.tx-abschnitt'), zknr: q('.tx-zknr'), sterne: q('.tx-sterne'),
      zeigen: q('[data-a="zeigen"]'), original: q('.tx-original'), laut: q('.tx-laut'), ipa: q('.tx-ipa'), melodie: q('.tx-melodie'),
      play: q('[data-a="play"]'), segQuelle: q('.tx-seg-quelle'), segTempo: q('.tx-seg-tempo'), schleife: q('[data-a="schleife"]'),
      echoKnopf: q('[data-a="echo"]'), melodieKnopf: q('[data-a="melodie"]'), wdh: q('.tx-wdh'), echo: q('.tx-echo'),
      modi: q('.tx-modi'), modus: q('.tx-modus'), nach: q('.tx-nach'), reiter: q('.tx-reiter'), nachInhalt: q('.tx-nach-inhalt'),
      hinter: q('.tx-hinter'), pop: q('.tx-pop'),
    });
    this.setzeSymbol(q('[data-a="zeilen"]'), 'liste');
    this.setzeSymbol(q('[data-a="blatt"]'), 'blatt', 'Nachschlagen');
    this.setzeSymbol(q('[data-a="klavier"]'), 'klavier', 'Klavier');
    for (const b of this.wurzel.querySelectorAll('[data-a="zu"]')) this.setzeSymbol(b, 'kreuz');
    this.setzeSymbol(q('[data-a="vor"]'), 'zurueck');
    this.setzeSymbol(q('[data-a="weiter"]'), 'weiter');
    this.setzeSymbol(r.schleife, 'schleife', 'Schleife');
    this.setzeSymbol(r.echoKnopf, 'welle', 'Echo');

    r.app.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b && r.app.contains(b)) this._aktion(b.dataset.a);
    });
    for (const b of r.segQuelle.children) b.onclick = () => this._quelleWaehlen(b.dataset.wert);
    for (const b of r.segTempo.children) b.onclick = () => this.setze('tempo', Number(b.dataset.wert));
    r.hinter.onclick = () => this._blattZu();
    // Popover schliessen, sobald woanders hingetippt wird
    r.app.addEventListener('pointerdown', (e) => {
      if (r.pop.classList.contains('versteckt')) return;
      if (r.pop.contains(e.target) || e.target.closest('.tx-wort, .tx-wortlaut')) return;
      this._popZu();
    }, true);
    r.mitte.addEventListener('scroll', () => this._popZu(), { passive: true });

    this._listeBauen();
    this._modiBauen();
    this._reiterBauen();
    this.waehleZeile(this.wert('zeile'));
    this._knoepfeSync();
    this._kopfStand();
  }

  _aktion(a) {
    const z = this.zeile;
    switch (a) {
      case 'klavier': this.stop(); this._blattZu(); this.zurKlavier(); break;
      case 'zeilen': this._blattAuf(this.offen === 'liste' ? null : 'liste'); break;
      case 'blatt': this._blattAuf(this.offen === 'nach' ? null : 'nach'); break;
      case 'zu': this._blattZu(); break;
      case 'vor': this._schritt(-1); break;
      case 'weiter': this._schritt(1); break;
      case 'play': if (this.auftrag || this.melodieAktiv) this.stop(); else this.spieleZeile(z); break;
      case 'schleife': this.setze('schleife', !this.wert('schleife')); break;
      case 'echo': this.setze('echo', !this.wert('echo')); break;
      case 'melodie': if (this.melodieAktiv) this.stop(); else this.melodieSpielen(z); break;
      case 'zeigen': this.textOffen = !this.textOffen; this._abdecken(); break;
      default: break;
    }
  }

  _einstGeaendert(p) {
    if (!this.gebaut || (p !== '*' && !String(p).startsWith('text.'))) return;
    const k = p === '*' ? '*' : p.slice(5);
    this._knoepfeSync();
    if (k === '*' || k.startsWith('laut') || k === 'zeigeIpa' || k === 'zeigeMelodie') this._zeileZeigen();
    if (k === '*' || k === 'abdecken') this._abdecken();
    // Tempo gilt sofort, auch mitten in der Wiedergabe
    if ((k === '*' || k === 'tempo') && this.auftrag && this.auftrag.el && this.auftrag.opts.tempo == null) {
      const rate = Number(this.wert('tempo')) || 1;
      try { this.auftrag.el.defaultPlaybackRate = rate; this.auftrag.el.playbackRate = rate; } catch { /* egal */ }
    }
  }

  _knoepfeSync() {
    if (!this.r) return;
    const r = this.r;
    const laeuft = !!this.auftrag;
    const playName = laeuft ? 'stopp' : 'play';
    if (r.play.dataset.zustand !== playName) {
      r.play.dataset.zustand = playName;
      this.setzeSymbol(r.play, playName, laeuft ? 'Stopp' : 'Abspielen');
    }
    for (const b of r.segQuelle.children) b.classList.toggle('an', b.dataset.wert === this._quelleName());
    for (const b of r.segTempo.children) b.classList.toggle('an', Number(b.dataset.wert) === Number(this.wert('tempo')));
    r.schleife.classList.toggle('an', !!this.wert('schleife'));
    r.echoKnopf.classList.toggle('an', !!this.wert('echo'));
    const melName = this.melodieAktiv ? 'stopp' : 'klavier';
    if (r.melodieKnopf.dataset.zustand !== melName) {
      r.melodieKnopf.dataset.zustand = melName;
      this.setzeSymbol(r.melodieKnopf, melName, 'Melodie');
    }
  }

  // ------------------------------------------------------------------------------------ Blaetter (Hochformat / schmal)
  _blattAuf(welches) {
    if (!this.r) return;
    this._popZu();
    this.offen = welches || null;
    this.r.liste.classList.toggle('tx-offen', this.offen === 'liste');
    this.r.nach.classList.toggle('tx-offen', this.offen === 'nach');
    this.r.hinter.classList.toggle('tx-offen', !!this.offen);
    if (this.offen === 'liste') this._listeInSicht(true);
  }

  _blattZu() { if (this.offen) this._blattAuf(null); }

  // ------------------------------------------------------------------------------------ Fortschritt
  _zf(nr, anlegen = false) {
    const f = this.fort.zeilen[nr];
    if (f) return f;
    const neu = { sterne: 0, box: 0, faellig: 0, wdh: 0 };
    if (anlegen) this.fort.zeilen[nr] = neu;
    return neu;
  }

  _tag() { return (this.fort.tage[heute()] ||= { sekunden: 0, wdh: 0 }); }
  _textZeilen() { return (this.song.zeilen || []).filter((z) => !z.summen); }

  _fortSpeichern(sofort = false) {
    clearTimeout(this._fortTimer);
    const tun = () => { try { this.speicher?.schreiben('text_fortschritt', this.fort); } catch (e) { console.warn(e); } };
    if (sofort) tun(); else this._fortTimer = setTimeout(tun, 800);
  }

  _kopfStand() {
    if (!this.r) return;
    const tz = this._textZeilen();
    const gelernt = tz.filter((z) => this._zf(z.nr).sterne >= 4).length;
    const faellig = tz.filter((z) => (this._zf(z.nr).faellig || 0) <= Date.now()).length;
    const t = this.fort.tage[heute()] || { sekunden: 0 };
    this.r.stand.innerHTML =
      `<span class="pille leise">Gelernt <b>${gelernt}/${tz.length}</b></span>` +
      `<span class="pille leise">Karten fällig <b>${faellig}</b></span>` +
      `<span class="pille leise">Heute <b>${Math.round(t.sekunden / 60)} min</b></span>`;
  }

  _sterneHtml(n) {
    let h = '';
    for (let i = 0; i < 5; i++) h += `<span class="tx-st${i < n ? ' tx-voll' : ''}">${this.symbol('stern')}</span>`;
    return h;
  }

  // ------------------------------------------------------------------------------------ Liedteile
  _abschnitt(z) {
    const ab = this.song.abschnitte || [];
    if (this._abRef !== ab) {
      this._abRef = ab;
      this._abMap = new Map();
      this._abLeer = { name: '', farbe: '#8a90a0', t: 0, te: this.song.dauer || 0 };
    }
    let a = this._abMap.get(z.nr);
    if (!a) {
      a = ab.find((x) => z.t >= x.t - 0.5 && z.t < x.te) || ab[ab.length - 1] || this._abLeer;
      this._abMap.set(z.nr, a);
    }
    return a;
  }

  // ------------------------------------------------------------------------------------ Zeilenliste
  _listeBauen() {
    const box = this.r.listeInhalt, leiste = this.r.leiste;
    box.innerHTML = '';
    leiste.innerHTML = '';
    let ab = null;
    for (const z of this.song.zeilen || []) {
      const a = this._abschnitt(z);
      if (a !== ab) {
        ab = a;
        const k = mach('div', 'tx-abkopf', '<i></i><span></span>');
        k.querySelector('i').style.background = a.farbe;
        k.querySelector('span').textContent = a.name;
        box.appendChild(k);
      }
      const el = mach('button', `tx-zeile${z.summen ? ' tx-summen' : ''}`, '<span class="tx-nr"></span><span class="tx-tx"></span><span class="tx-sterne-klein"></span>');
      el.dataset.nr = z.nr;
      el.querySelector('.tx-nr').textContent = z.nr;
      el.querySelector('.tx-tx').textContent = z.text;
      el.onclick = () => { this.waehleZeile(z.nr); this._blattZu(); };
      box.appendChild(el);

      // Leiste fuer das Hochformat: Nummern mit Liedteil-Farbe und Sterne-Balken
      const c = mach('button', `tx-chip${z.summen ? ' tx-summen' : ''}`, '<span></span><i></i>');
      c.dataset.nr = z.nr;
      c.querySelector('span').textContent = z.nr;
      c.style.borderBottomColor = a.farbe;
      c.onclick = () => this.waehleZeile(z.nr);
      leiste.appendChild(c);
    }
    if (!(this.song.zeilen || []).length) box.innerHTML = '<div class="tx-leer">Kein Liedtext gefunden.</div>';
    this._listeAktualisieren();
  }

  _listeAktualisieren() {
    if (!this.r) return;
    const nr = this.zeile ? this.zeile.nr : -1;
    for (const el of this.r.listeInhalt.querySelectorAll('.tx-zeile')) {
      const n = Number(el.dataset.nr);
      el.classList.toggle('tx-an', n === nr);
      const st = el.querySelector('.tx-sterne-klein');
      const z = this.song.zeilen[n - 1];
      const html = z && !z.summen ? this._sterneHtml(this._zf(n).sterne || 0) : '';
      if (st.dataset.n !== String(this._zf(n).sterne || 0)) { st.innerHTML = html; st.dataset.n = String(this._zf(n).sterne || 0); }
    }
    for (const c of this.r.leiste.children) {
      const n = Number(c.dataset.nr);
      c.classList.toggle('tx-an', n === nr);
      c.querySelector('i').style.width = `${((this._zf(n).sterne || 0) / 5) * 100}%`;
    }
  }

  // Ausgewaehlte Zeile in der Liste und in der Leiste sichtbar machen (ohne scrollIntoView,
  // das auf dem iPad auch die ganze Seite verschieben kann)
  _listeInSicht(mitte = false) {
    if (!this.r || !this.zeile) return;
    const nr = this.zeile.nr;
    const el = this.r.listeInhalt.querySelector(`.tx-zeile[data-nr="${nr}"]`);
    const box = this.r.listeInhalt;
    if (el && box.clientHeight) {
      const oben = el.offsetTop, unten = oben + el.offsetHeight;
      if (mitte || oben < box.scrollTop + 8 || unten > box.scrollTop + box.clientHeight - 8) {
        box.scrollTop = Math.max(0, oben - (mitte ? box.clientHeight / 2 - el.offsetHeight / 2 : 8));
      }
    }
    const chip = this.r.leiste.querySelector(`.tx-chip[data-nr="${nr}"]`);
    const l = this.r.leiste;
    if (chip && l.clientWidth) {
      const links = chip.offsetLeft, rechts = links + chip.offsetWidth;
      if (links < l.scrollLeft + 8 || rechts > l.scrollLeft + l.clientWidth - 8) l.scrollLeft = Math.max(0, links - l.clientWidth / 2 + chip.offsetWidth / 2);
    }
  }

  waehleZeile(nr, { stoppen = true, mitte = false } = {}) {
    const zl = this.song.zeilen || [];
    if (!zl.length || !this.r) return;
    const z = zl.find((x) => x.nr === Number(nr)) || zl[0];
    if (stoppen) this.stop();
    const neu = z !== this.zeile;
    this.zeile = z;
    this.setze('zeile', z.nr, { still: true });
    if (neu) this.textOffen = false;
    this._popZu();
    this._zeileZeigen();
    this._listeAktualisieren();
    this._listeInSicht(mitte);
    // Karteikarten haengen nicht an der gewaehlten Zeile: dort die Karte stehen lassen
    if (stoppen && this.wert('modus') !== 'karten') this._modusZeigen();
    else this._abdecken();
  }

  _schritt(d) {
    const zl = this.song.zeilen || [];
    const i = zl.indexOf(this.zeile);
    const n = zl[Math.max(0, Math.min(zl.length - 1, i + d))];
    if (n) this.waehleZeile(n.nr);
  }

  // ------------------------------------------------------------------------------------ Zeilen-Karte
  _zeileZeigen() {
    const z = this.zeile, r = this.r;
    if (!z || !r) return;
    const a = this._abschnitt(z);
    r.abschnitt.querySelector('span').textContent = a.name || 'Zeile';
    r.abschnitt.querySelector('i').style.background = a.farbe;
    r.abschnitt.style.borderColor = a.farbe;
    r.zknr.textContent = `Zeile ${z.nr} von ${this.song.zeilen.length}${z.summen ? ' · Summen' : ''} · ${zeitFormat(z.t)}`;
    this._sterneZeigen();

    // Originalzeile: Silben, nach Woertern gruppiert (Wort antippen = Bedeutung)
    const orig = r.original;
    orig.className = `tx-original${z.summen ? ' tx-summen' : ''}`;
    orig.innerHTML = '';
    this.silbenSpans = [];
    const woerter = zeilenWoerter(z.text);
    const silben = zeilenSilben(z.text);
    woerter.forEach((w, wi) => {
      const wel = mach('span', 'tx-wort');
      for (const s of silben) {
        if (s.wort !== wi) continue;
        const sp = mach('span', 'tx-silbe');
        sp.textContent = s.text;
        wel.appendChild(sp);
        this.silbenSpans.push(sp);
      }
      wel.onclick = (e) => { e.stopPropagation(); this._popAuf(wel, w, wi); };
      orig.appendChild(wel);
    });

    // Lautschrift in deutscher Lesart, betonte Silbe unterstrichen
    const laut = r.laut;
    laut.innerHTML = '';
    r.ipa.textContent = '';
    if (z.summen) {
      laut.innerHTML = '<span class="tx-blass">Summen – hier zählt nur die Melodie (Mund geschlossen, „mmm“)</span>';
    } else if (this.phon) {
      let res = null;
      try { res = this.phon.respellLine(z.text, this._lautOptionen()); } catch (e) { console.warn('Lautschrift', e); }
      const ipa = [];
      let wi = -1;                                  // Index passend zu zeilenWoerter (Kurzwoerter gehoeren zum Folgewort)
      for (const w of res ? res.words : []) {
        if (!w.isWord) continue;
        const kurz = istKurzwort(w.text);
        if (!kurz) wi++;
        const ziel = kurz ? wi + 1 : wi;
        const el = mach('span', 'tx-wortlaut');
        const syl = w.syllables || [];
        if (syl.length) {
          syl.forEach((s, i) => {
            const sp = mach('span', s.stressed && syl.length > 1 ? 'tx-betont' : '');
            sp.textContent = s.de ?? s.dialekt ?? '';
            el.appendChild(sp);
            if (i < syl.length - 1) el.appendChild(document.createTextNode('-'));
          });
        } else {
          el.textContent = w.de || '';
        }
        if (!el.textContent) continue;
        el.onclick = (e) => { e.stopPropagation(); this._popAuf(el, w.text, ziel); };
        laut.appendChild(el);
        if (w.ipa) ipa.push(w.ipa);
      }
      if (this.wert('zeigeIpa') && ipa.length) r.ipa.textContent = `[${ipa.join(' ').replace(/[[\]]/g, '')}]`;
    }
    r.ipa.classList.toggle('versteckt', !r.ipa.textContent);
    r.melodie.classList.toggle('versteckt', !this.wert('zeigeMelodie'));
    r.wdh.textContent = `${this._zf(z.nr).wdh || 0}× gehört`;
    this._gezeichnet = '';
    this._silbenMarkieren(this.auftrag && this.auftrag.opts.zeile === z ? this.melodieZeit : null);
    this._abdecken();
  }

  _sterneZeigen() {
    const z = this.zeile, st = this.r.sterne;
    st.innerHTML = '';
    if (!z || z.summen) return;
    const n = this._zf(z.nr).sterne || 0;
    for (let i = 1; i <= 5; i++) {
      const b = mach('button', `tx-stern${i <= n ? ' tx-voll' : ''}`, this.symbol('stern'));
      b.setAttribute('aria-label', `${i} von 5 Sternen`);
      b.onclick = () => {
        const f = this._zf(z.nr, true);
        f.sterne = f.sterne === i ? i - 1 : i;      // gleicher Stern nochmal = einen weniger
        this._fortSpeichern();
        this._sterneZeigen();
        this._listeAktualisieren();
        this._kopfStand();
      };
      st.appendChild(b);
    }
  }

  // Zeile oben abdecken, solange ein Uebe-Modus die Loesung verlangt
  _abdecken() {
    if (!this.r) return;
    const m = this.wert('modus');
    let zu = !!this.wert('abdecken') && !!this.zeile && !this.zeile.summen &&
      (MODI_ABGEDECKT.includes(m) || (m === 'lied' && (this.modusZustand.kHilfe || 'text') !== 'text'));
    if (m === 'karten' && this.modusZustand.kartenAuf === this.zeile.nr) zu = false;
    const verdeckt = zu && !this.textOffen;
    this.r.karte.classList.toggle('tx-zu', verdeckt);
    this.r.app.classList.toggle('tx-geheim', verdeckt);     // auch die Texte in der Zeilenliste verschwimmen
    this.r.zeigen.classList.toggle('versteckt', !zu);
    if (zu) this.setzeSymbol(this.r.zeigen, 'auge', this.textOffen ? 'Verbergen' : 'Text zeigen');
    this._gezeichnet = '';
  }

  _silbenMarkieren(t) {
    const z = this.zeile;
    if (!z || !this.r) return;
    const n = this.silbenSpans.length;
    const aktiv = t != null && z.silben && z.silben.length === n && n > 0;
    this.r.original.classList.toggle('tx-laeuft', !!aktiv);
    let idx = -1;
    if (aktiv) for (let i = 0; i < n; i++) if (z.silben[i].t <= t + 0.03) idx = i;
    for (let i = 0; i < n; i++) {
      const cls = !aktiv ? 'tx-silbe' : i < idx ? 'tx-silbe tx-gesungen' : i === idx ? 'tx-silbe tx-jetzt' : 'tx-silbe';
      if (this.silbenSpans[i].className !== cls) this.silbenSpans[i].className = cls;
    }
  }

  // ------------------------------------------------------------------------------------ Wort-Popover
  _wortZeiten(z) {
    // Startzeit je Wort aus den gesungenen Silben
    const zeiten = [];
    if (!z || !z.silben) return zeiten;
    const silben = zeilenSilben(z.text);
    if (silben.length === z.silben.length) silben.forEach((s, i) => { if (zeiten[s.wort] == null) zeiten[s.wort] = z.silben[i].t; });
    return zeiten;
  }

  _popAuf(anker, wort, wi) {
    const pop = this.r.pop;
    if (this.popAnker === anker && !pop.classList.contains('versteckt')) { this._popZu(); return; }
    this._popZu();
    const sauber = String(wort).replace(/[.,!?;:]/g, '').split(' ').pop();
    let g = null;
    try { g = this.phon ? this.phon.glossWord(sauber) : null; } catch { g = null; }
    let html = `<div class="tx-pop-kopf"><b>${esc(String(wort).replace(/[.,!?;:]/g, ''))}</b>`;
    if (g && g.art) html += `<span class="tx-pop-art">${esc(g.art)}</span>`;
    if (g && g.unsicher) html += '<span class="tx-unsicher">unsicher</span>';
    html += '</div>';
    html += g
      ? `<div class="tx-pop-hd">${esc(g.hd)}</div>${g.hinweis ? `<div class="tx-pop-hinweis">${esc(g.hinweis)}</div>` : ''}`
      : '<div class="tx-pop-hinweis">Dieses Wort steht nicht im Wortschatz.</div>';
    pop.innerHTML = html;
    const zeiten = this._wortZeiten(this.zeile);
    if (wi != null && wi >= 0 && zeiten[wi] != null) {
      const b = mach('button', 'knopf tx-pop-knopf');
      this.setzeSymbol(b, 'lautsprecher', 'Wort hören');
      b.onclick = (e) => { e.stopPropagation(); this._wortHoeren(wi); };
      pop.appendChild(b);
    }
    pop.classList.remove('versteckt');
    // unter das Wort legen, innerhalb der Ansicht halten
    const wr = this.wurzel.getBoundingClientRect(), ar = anker.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const x = Math.max(12, Math.min(wr.width - pw - 12, ar.left - wr.left));
    let y = ar.bottom - wr.top + 8;
    if (y + ph > wr.height - 12) y = ar.top - wr.top - ph - 8;
    pop.style.left = `${Math.round(x)}px`;
    pop.style.top = `${Math.round(Math.max(12, y))}px`;
    anker.classList.add('tx-gewaehlt');
    this.popAnker = anker;
  }

  _popZu() {
    if (!this.r) return;
    this.r.pop.classList.add('versteckt');
    if (this.popAnker) this.popAnker.classList.remove('tx-gewaehlt');
    this.popAnker = null;
  }

  _wortHoeren(wi) {
    const z = this.zeile;
    const zeiten = this._wortZeiten(z);
    if (zeiten[wi] == null) return;
    let ende = z.tEnde + 0.15;
    for (let k = wi + 1; k < zeiten.length; k++) if (zeiten[k] != null) { ende = zeiten[k]; break; }
    this.spieleBereich(zeiten[wi] - 0.08, ende + 0.04, { zeile: z, runden: 1, echo: false, zaehlen: false });
  }

  // ------------------------------------------------------------------------------------ Melodie-Leiste
  _silbenTexte(z) {
    if (this._stZeile === z && this._stText === z.text) return this._st;
    const s = zeilenSilben(z.text);
    this._stZeile = z; this._stText = z.text;
    this._st = z.silben && s.length === z.silben.length ? s.map((x) => x.text) : null;
    return this._st;
  }

  _melodieZeichnen() {
    const cv = this.r && this.r.melodie, z = this.zeile;
    if (!cv || !z || cv.classList.contains('versteckt')) return;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    const zu = this.r.karte.classList.contains('tx-zu');
    const schluessel = `${z.nr}|${W}|${H}|${zu}|${this.melodieZeit == null ? '-' : this.melodieZeit.toFixed(3)}`;
    if (schluessel === this._gezeichnet) return;
    this._gezeichnet = schluessel;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const noten = z.noten || [];
    if (!noten.length) {
      c.fillStyle = 'rgba(243,244,248,0.45)';
      c.font = `500 14px ${SCHRIFT}`;
      c.textAlign = 'center';
      c.fillText(z.summen ? 'Gesummt – ohne Melodie-Noten' : 'Keine Melodie-Noten für diese Zeile', W / 2, H / 2 + 5);
      return;
    }
    const a = z.ts - 0.3, e = z.tEnde + 0.4;
    let lo = Infinity, hi = -Infinity;
    for (const n of noten) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
    lo -= 2; hi += 2;
    const x = (t) => 14 + ((t - a) / (e - a)) * (W - 28);
    const y = (p) => 12 + (1 - (p - lo) / (hi - lo)) * (H - 44);
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    for (let p = lo; p <= hi; p++) { c.beginPath(); c.moveTo(0, y(p)); c.lineTo(W, y(p)); c.stroke(); }
    c.font = `600 13px ${SCHRIFT}`;
    c.textAlign = 'left';
    const texte = zu ? null : this._silbenTexte(z);
    let si = 0;
    const mz = this.melodieZeit;
    for (const n of noten) {
      const x0 = x(n.t), x1 = Math.max(x0 + 6, x(n.te)), yy = y(n.p);
      const aktiv = mz != null && n.t <= mz && n.te > mz;
      c.fillStyle = aktiv ? '#93dd3a' : n.s ? 'rgba(120,176,255,0.85)' : 'rgba(120,176,255,0.42)';
      rund(c, x0, yy - 5, x1 - x0, 10, 5);
      c.fill();
      if (n.s) {
        const txt = texte ? texte[si] : null;
        si++;
        if (txt) {
          c.fillStyle = aktiv ? '#ffffff' : 'rgba(255,255,255,0.7)';
          c.fillText(txt, x0, H - 10);
        }
      }
    }
    if (mz != null && mz >= a && mz <= e) {
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillRect(x(mz), 4, 2, H - 30);
    }
  }

  // ------------------------------------------------------------------------------------ Abspielen: Aufnahme
  _quelleName() { return this.wert('quelle') === 'original' ? 'original' : 'gesang'; }

  _quelleWaehlen(q) {
    if (q !== 'gesang' && q !== 'original') return;
    this._medium(q);                                   // schon einmal laden
    const au = this.auftrag;
    if (this._quelleName() === q) return;
    this.setze('quelle', q);
    // laeuft gerade etwas, mit der neuen Quelle weiterspielen (Zeile von vorn, ganzes Lied an der Stelle)
    if (au) {
      const ab = au.opts.beiZeit && au.el ? au.el.currentTime : au.a;
      this.spieleBereich(ab, au.e, au.opts);
    }
  }

  // Audio-Element je Quelle: einmal angelegt, blob:-Adresse von quelle()
  _medium(name) {
    let m = this.medien[name];
    if (m) return m;
    m = { el: null, bereit: null };
    this.medien[name] = m;
    m.bereit = Promise.resolve().then(() => this.quelle(name)).then((url) => {
      if (!url) throw new Error('keine Adresse');
      const el = new Audio();
      el.preload = 'auto';
      el.preservesPitch = true;
      el.webkitPreservesPitch = true;
      el.setAttribute('playsinline', '');
      // Absicherung, falls die Bildschleife gedrosselt ist: Bereichsende auch ueber timeupdate erkennen
      const pruefe = () => this._zeitPruefen(el);
      el.addEventListener('timeupdate', pruefe);
      el.addEventListener('ended', pruefe);
      el.src = url;
      try { el.load(); } catch { /* egal */ }
      m.el = el;
      return el;
    });
    m.bereit.catch((e) => {
      console.warn('Text-Ansicht: Aufnahme nicht ladbar', name, e);
      if (this.medien[name] === m) delete this.medien[name];
    });
    return m;
  }

  _zeitPruefen(el) {
    const au = this.auftrag;
    if (!au || au.el !== el || au.pause) return;
    if (performance.now() - (this._letzterTick || 0) < 250) return;     // die Bildschleife laeuft: sie erledigt das
    const t = el.currentTime;
    if (!el.paused) {
      if (au.opts.zeile && au.opts.zeile === this.zeile) { this.melodieZeit = t; this._silbenMarkieren(t); }
      if (au.opts.beiZeit) au.opts.beiZeit(t);
    }
    if (el.ended || (!el.paused && t >= au.e)) this._rundeFertig(au);
  }

  _wecken() {
    try { const p = this.engine && this.engine.aufwecken(); if (p && p.catch) p.catch(() => {}); } catch { /* egal */ }
  }

  spieleZeile(z, opts = {}) {
    if (!z) return;
    this.spieleBereich(z.ts - 0.25, z.tEnde + 0.35, { zeile: z, ...opts });
  }

  spieleBereich(a, e, opts = {}) {
    this.stop();
    this._wecken();
    const au = { a: Math.max(0, a), e, opts, runden: 0, el: null, pause: false };
    this.auftrag = au;
    this._knoepfeSync();
    const m = this._medium(this._quelleName());
    if (m.el) { au.el = m.el; this._abspielen(au); return; }
    this.toast('Aufnahme wird geladen …', 1500);
    m.bereit.then((el) => {
      if (this.auftrag !== au) return;
      au.el = el;
      this._abspielen(au);
    }).catch(() => {
      if (this.auftrag !== au) return;
      this.stop();
      this.toast('Die Aufnahme ließ sich nicht laden.', 2600);
    });
  }

  _abspielen(au) {
    const el = au.el;
    const rate = Number(au.opts.tempo ?? this.wert('tempo')) || 1;
    try { el.defaultPlaybackRate = rate; el.playbackRate = rate; } catch { /* egal */ }
    const setze = () => { if (this.auftrag === au) { try { el.currentTime = au.a; } catch { /* egal */ } } };
    if (el.readyState >= 1) setze(); else el.addEventListener('loadedmetadata', setze, { once: true });
    const p = el.play();
    if (p && p.catch) {
      p.catch((err) => {
        if (this.auftrag !== au || (err && err.name === 'AbortError')) return;
        this.stop();
        this.toast(err && err.name === 'NotAllowedError' ? 'Bitte noch einmal auf Abspielen tippen.' : 'Die Aufnahme lässt sich hier nicht abspielen.', 2600);
      });
    }
  }

  _rundeFertig(au) {
    const el = au.el;
    el.pause();
    au.pause = true;
    au.runden++;
    if (au.opts.zeile && au.opts.zaehlen !== false) {
      const f = this._zf(au.opts.zeile.nr, true);
      f.wdh = (f.wdh || 0) + 1;
      this._tag().wdh++;
      if (this.zeile === au.opts.zeile) this.r.wdh.textContent = `${f.wdh}× gehört`;
      this._fortSpeichern();
      this._kopfStand();
    }
    const max = au.opts.runden ?? (this.wert('schleife') ? Infinity : this.wert('echo') ? 3 : 1);
    if (au.runden >= max) {
      const fertig = au.opts.fertig;
      this.stop();
      if (fertig) fertig();
      return;
    }
    const echo = au.opts.echo ?? this.wert('echo');
    const pauseS = echo ? ((au.e - au.a) / (el.playbackRate || 1)) * (Number(this.wert('echoFaktor')) || 1.3) : 0.45;
    this._echoZeigen(!!echo);
    this.melodieZeit = null;
    this._silbenMarkieren(null);
    this.echoTimer = setTimeout(() => {
      this._echoZeigen(false);
      if (this.auftrag !== au) return;
      au.pause = false;
      try { el.currentTime = au.a; } catch { /* egal */ }
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    }, pauseS * 1000);
  }

  _echoZeigen(an) { if (this.r) this.r.echo.classList.toggle('versteckt', !an); }

  stop() {
    clearTimeout(this.echoTimer);
    this.echoTimer = null;
    this.melodieAuftrag++;
    // nur die eigenen Melodie-Stimmen stoppen (nie Toene des Klavier-Teils)
    if (this.melodieStimmen && this.melodieStimmen.length) {
      const jetzt = this.engine.jetzt;
      for (const s of this.melodieStimmen) { try { this.engine.sampler.stoppe(s, jetzt, 0.05); } catch { /* egal */ } }
    }
    this.melodieStimmen = [];
    this.melodieAktiv = false;
    for (const m of Object.values(this.medien)) if (m && m.el && !m.el.paused) { try { m.el.pause(); } catch { /* egal */ } }
    this.auftrag = null;
    this._echoZeigen(false);
    this._knoepfeSync();
    this.melodieZeit = null;
    this._silbenMarkieren(null);
  }

  // ------------------------------------------------------------------------------------ Abspielen: Melodie (Klavier)
  async melodieSpielen(z) {
    if (!z || !z.noten || !z.noten.length || !this.engine || !this.engine.sampler) return;
    this.stop();                                      // erhoeht melodieAuftrag
    const auftrag = this.melodieAuftrag;
    this.melodieAktiv = true;
    this._knoepfeSync();
    try { await this.engine.aufwecken(); } catch { /* egal */ }
    if (auftrag !== this.melodieAuftrag) return;
    const tempo = Number(this.wert('tempo')) || 1;
    const t0 = this.engine.jetzt + 0.08;
    const a = z.noten[0].t;
    this.melodieStimmen = z.noten.map((n) => this.engine.sampler.spiele(n.p, n.s ? 78 : 62, t0 + (n.t - a) / tempo, (n.te - n.t) / tempo)).filter(Boolean);
    const dauer = (z.noten[z.noten.length - 1].te - a) / tempo;
    const start = performance.now();
    const ende = () => {
      if (auftrag !== this.melodieAuftrag || !this.melodieAktiv) return;
      this.melodieAktiv = false;
      this.melodieStimmen = [];
      this.melodieZeit = null;
      this._silbenMarkieren(null);
      this._knoepfeSync();
    };
    const lauf = () => {
      if (auftrag !== this.melodieAuftrag || !this.melodieAktiv) return;
      const verg = (performance.now() - start) / 1000 - 0.08;
      if (verg > dauer + 0.3) { ende(); return; }
      this.melodieZeit = a + Math.max(0, verg) * tempo;
      if (z === this.zeile) this._silbenMarkieren(this.melodieZeit);
      requestAnimationFrame(lauf);
    };
    lauf();
    setTimeout(ende, (dauer + 0.5) * 1000);          // Absicherung, falls die Bildschleife gedrosselt ist
  }

  // ------------------------------------------------------------------------------------ Uebe-Modi
  _modiBauen() {
    const nav = this.r.modi;
    nav.innerHTML = '';
    const akt = this.wert('modus');
    for (const [id, name, sym] of MODI) {
      const b = mach('button', id === akt ? 'tx-an' : '', `${this.symbol(sym)}<span>${name}</span>`);
      b.onclick = () => {
        if (this.wert('modus') === id) return;
        this.stop();
        this.textOffen = false;
        this.setze('modus', id);
        this._modiBauen();
        this._modusZeigen();
      };
      nav.appendChild(b);
    }
  }

  _modusZeigen() {
    if (!this.r) return;
    const box = this.r.modus;
    clearTimeout(this._kartenTimer);
    box.innerHTML = '';
    this.modusZustand.kartenAuf = false;
    const m = this.wert('modus');
    const fn = { hoeren: this._modusHoeren, rueckwaerts: this._modusRueckwaerts, luecken: this._modusLuecken, anfang: this._modusAnfang, karten: this._modusKarten, lied: this._modusLied }[m] || this._modusHoeren;
    if (this.zeile) fn.call(this, box, this.zeile);
    this._abdecken();
  }

  _knopf(text, fn, klasse = '', sym = null) {
    const b = mach('button', `knopf ${klasse}`.trim());
    if (sym) this.setzeSymbol(b, sym, text); else b.textContent = text;
    b.onclick = fn;
    return b;
  }

  _reihe(...kinder) {
    const r = mach('div', 'tx-reihe');
    for (const k of kinder) if (k) r.appendChild(k);
    return r;
  }

  _kopf(box, titel, erkl) { box.insertAdjacentHTML('beforeend', `<h3>${titel}</h3><div class="tx-erkl">${erkl}</div>`); }

  _modusHoeren(box, z) {
    this._kopf(box, 'Hören & Echo', 'Die Aufnahme ist die Wahrheit – die Lautschrift ist nur eine Brücke. Höre die Zeile langsam (65 %), sprich sie im Echo nach, dann schneller. <b>Echo</b> spielt die Zeile, lässt dir Zeit zum Nachsprechen („Jetzt du!“) und spielt sie wieder.');
    box.appendChild(this._reihe(
      this._knopf('3× hören', () => this.spieleZeile(z, { runden: 3, echo: false }), '', 'ohr'),
      this._knopf('Echo-Runde (5×)', () => this.spieleZeile(z, { runden: 5, echo: true }), 'akzent', 'welle'),
      this._knopf('Ganzen Liedteil hören', () => {
        const ab = this._abschnitt(z);
        this.spieleBereich(ab.t, ab.te, { runden: 1, echo: false, beiZeit: (t) => this._liedteilVerfolgen(t, ab) });
      }, '', 'lautsprecher'),
      this._knopf('Mit Klavier-Melodie', () => this.melodieSpielen(this.zeile), '', 'klavier'),
    ));
    box.insertAdjacentHTML('beforeend', '<div class="tx-erkl tx-tipp">Tippe auf ein Wort oder seine Lautschrift: Dann siehst du die ungefähre Bedeutung und kannst das Wort einzeln hören. Unterstrichen ist die betonte Silbe. Die Zeichen (χ, kχ, æ, °) erklärt „Nachschlagen“ im Reiter „Zeichen“.</div>');
  }

  _liedteilVerfolgen(t, ab) {
    const { aktuell } = zeileBei(this.song, t);
    if (aktuell && aktuell !== this.zeile && this._abschnitt(aktuell) === ab) this.waehleZeile(aktuell.nr, { stoppen: false });
    if (aktuell && aktuell === this.zeile) { this.melodieZeit = t; this._silbenMarkieren(t); }
  }

  _modusRueckwaerts(box, z) {
    this._kopf(box, 'Rückwärts aufbauen', 'Eine Gedächtnis-Technik: zuerst das <b>Ende</b> der Zeile, dann kommt Wort für Wort von vorn dazu. So ist das Ziel immer schon vertraut, wenn du es erreichst. Der Ausschnitt kommt aus der echten Aufnahme.');
    const woerter = zeilenWoerter(z.text);
    const zeiten = this._wortZeiten(z);
    if (this.modusZustand.rkZeile !== z.nr) { this.modusZustand.rkZeile = z.nr; this.modusZustand.rk = 1; }
    this.modusZustand.rk = Math.max(1, Math.min(this.modusZustand.rk || 1, woerter.length));
    const anzeige = mach('div', 'tx-gross');
    const zeichne = () => {
      const k = this.modusZustand.rk;
      anzeige.innerHTML = '';
      woerter.forEach((w, i) => {
        const sp = mach('span', i >= woerter.length - k ? '' : 'tx-blass');
        sp.textContent = i >= woerter.length - k ? w : '…';
        anzeige.appendChild(sp);
      });
    };
    zeichne();
    box.appendChild(anzeige);
    const ab = () => { const i = woerter.length - this.modusZustand.rk; return zeiten[i] != null ? zeiten[i] - 0.12 : z.ts - 0.25; };
    box.appendChild(this._reihe(
      this._knopf('Ausschnitt hören', () => this.spieleBereich(ab(), z.tEnde + 0.35, { zeile: z, runden: this.wert('echo') ? 3 : 1 }), 'akzent', 'play'),
      this._knopf('Ein Wort mehr', () => { this.modusZustand.rk = Math.min(woerter.length, this.modusZustand.rk + 1); zeichne(); }, '', 'plus'),
      this._knopf('Ein Wort weniger', () => { this.modusZustand.rk = Math.max(1, this.modusZustand.rk - 1); zeichne(); }, '', 'minus'),
      this._knopf('Ganze Zeile', () => { this.modusZustand.rk = woerter.length; zeichne(); this.spieleZeile(z); }),
    ));
  }

  _modusLuecken(box, z) {
    this._kopf(box, 'Lückentext', 'Stufe 1 versteckt etwa jedes dritte Wort, Stufe 4 jedes. Sprich die Zeile laut, dann tippe auf eine Lücke, um nachzusehen. „Neu mischen“ verteilt die Lücken anders.');
    this.modusZustand.lStufe ||= 1;
    this.modusZustand.lSeed ||= 1;
    const woerter = zeilenWoerter(z.text);
    const anzeige = mach('div', 'tx-gross');
    const zeichne = () => {
      const r = zufall(this.modusZustand.lSeed + z.nr * 7);
      const anteil = [0, 0.34, 0.5, 0.75, 1][this.modusZustand.lStufe];
      const reihenfolge = woerter.map((_, i) => [r(), i]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
      const versteckt = new Set(reihenfolge.slice(0, Math.max(1, Math.round(woerter.length * anteil))));
      anzeige.innerHTML = '';
      woerter.forEach((w, i) => {
        if (versteckt.has(i)) {
          const b = mach('button', 'tx-luecke');
          b.textContent = w;
          b.setAttribute('aria-label', 'Lücke aufdecken');
          b.onclick = () => b.classList.add('tx-auf');
          anzeige.appendChild(b);
        } else {
          const sp = mach('span');
          sp.textContent = w;
          anzeige.appendChild(sp);
        }
      });
    };
    zeichne();
    box.appendChild(anzeige);
    const stufen = mach('div', 'segmente');
    for (let s = 1; s <= 4; s++) {
      const b = mach('button', s === this.modusZustand.lStufe ? 'an' : '');
      b.textContent = `Stufe ${s}`;
      b.onclick = () => { this.modusZustand.lStufe = s; this._modusZeigen(); };
      stufen.appendChild(b);
    }
    box.appendChild(this._reihe(stufen,
      this._knopf('Neu mischen', () => { this.modusZustand.lSeed++; zeichne(); }, '', 'wiederholen'),
      this._knopf('Lösung zeigen', () => anzeige.querySelectorAll('.tx-luecke').forEach((x) => x.classList.add('tx-auf')), '', 'auge'),
      this._knopf('Zeile hören', () => this.spieleZeile(z), 'akzent', 'play'),
    ));
  }

  _anfangsForm(w) {
    return w.split(' ').map((teil) => (teil ? teil[0] + teil.slice(1).replace(/[^\s.,!?]/g, '·') : teil)).join(' ');
  }

  _modusAnfang(box, z) {
    this._kopf(box, 'Anfangsbuchstaben', 'Nur der erste Buchstabe jedes Wortes bleibt stehen – genug Halt fürs Gedächtnis, aber den Rest musst du selbst „hören“. Tippe auf ein Wort, dann steht es ganz da.');
    const anzeige = mach('div', 'tx-gross');
    for (const w of zeilenWoerter(z.text)) {
      const kurz = this._anfangsForm(w);
      const b = mach('button', 'tx-anfang');
      b.textContent = kurz;
      b.onclick = () => { const offen = b.textContent === w; b.textContent = offen ? kurz : w; b.classList.toggle('tx-auf', !offen); };
      anzeige.appendChild(b);
    }
    box.appendChild(anzeige);
    box.appendChild(this._reihe(
      this._knopf('Zeile hören', () => this.spieleZeile(z), 'akzent', 'play'),
      this._knopf('Echo (3×)', () => this.spieleZeile(z, { runden: 3, echo: true }), '', 'welle'),
    ));
  }

  // ---------------------------------------------------------------- Karteikarten (Leitner 1-2-4-8-16 Tage)
  _modusKarten(box) {
    const tz = this._textZeilen();
    const jetzt = Date.now();
    const faellig = tz.filter((z) => (this._zf(z.nr).faellig || 0) <= jetzt)
      .sort((a, b) => (this._zf(a.nr).box || 0) - (this._zf(b.nr).box || 0) || a.nr - b.nr);
    this._kopf(box, 'Karteikarten', `Du hörst eine Zeile und sprichst sie <b>auswendig</b> mit, dann deckst du auf und bewertest dich. Gute Karten kommen seltener wieder (1, 2, 4, 8, 16 Tage). Heute fällig: <b>${faellig.length}</b> von ${tz.length}.`);
    if (!faellig.length) {
      box.insertAdjacentHTML('beforeend', '<div class="tx-kartei"><div class="tx-kartei-hinten">Für heute ist nichts mehr fällig.</div><div class="tx-kartei-vorne">Morgen kommen die nächsten Karten wieder.</div></div>');
      // eine "Nochmal"-Karte kommt nach einer Minute wieder – dann die Ansicht selbst auffrischen
      let naechste = Infinity;
      for (const z of tz) naechste = Math.min(naechste, this._zf(z.nr).faellig || Infinity);
      if (naechste - jetzt < 15 * 60000) {
        this._kartenTimer = setTimeout(() => { if (this.sichtbar && this.wert('modus') === 'karten') this._modusZeigen(); }, Math.max(0, naechste - jetzt) + 300);
      }
      return;
    }
    const z = faellig[0];
    if (this.zeile !== z) this.waehleZeile(z.nr, { stoppen: false });
    const karte = mach('div', 'tx-kartei');
    const erstes = zeilenWoerter(z.text)[0] || '';
    karte.innerHTML = `<div class="tx-kartei-vorne">Zeile ${z.nr} · ${esc(this._abschnitt(z).name)} · Anfang: <b>${esc(erstes)} …</b></div><div class="tx-kartei-hinten tx-blass">Sprich die Zeile – dann aufdecken.</div>`;
    box.appendChild(karte);
    const f0 = this._zf(z.nr);
    const box0 = f0.box || 0;
    const bewerten = (art) => {
      const f = this._zf(z.nr, true);
      const now = Date.now();
      if (art === 'nochmal') { f.box = 0; f.faellig = now + 60 * 1000; }
      else if (art === 'schwer') { f.box = Math.max(1, f.box || 0); f.faellig = now + TAG_MS * ABSTAENDE_TAGE[f.box] * 0.5; }
      else if (art === 'gut') { f.box = Math.min(5, (f.box || 0) + 1); f.faellig = now + TAG_MS * ABSTAENDE_TAGE[f.box]; }
      else { f.box = Math.min(5, (f.box || 0) + 2); f.faellig = now + TAG_MS * ABSTAENDE_TAGE[f.box]; }
      f.sterne = Math.max(f.sterne || 0, f.box);
      this.stop();
      this._fortSpeichern();
      this._listeAktualisieren();
      this._sterneZeigen();
      this._kopfStand();
      this._modusZeigen();
    };
    const mitZeit = (name, wann, fn, klasse = '') => {
      const b = mach('button', `knopf tx-bewerten ${klasse}`.trim(), `<span>${name}</span><small>${wann}</small>`);
      b.onclick = fn;
      return b;
    };
    const bew = this._reihe(
      mitZeit('Nochmal', '1 Min.', () => bewerten('nochmal')),
      mitZeit('Schwer', dauerText(ABSTAENDE_TAGE[Math.max(1, box0)] * 0.5), () => bewerten('schwer')),
      mitZeit('Gut', dauerText(ABSTAENDE_TAGE[Math.min(5, box0 + 1)]), () => bewerten('gut'), 'akzent'),
      mitZeit('Leicht', dauerText(ABSTAENDE_TAGE[Math.min(5, box0 + 2)]), () => bewerten('leicht')),
    );
    bew.classList.add('versteckt');
    const aufdecken = () => {
      const hinten = karte.querySelector('.tx-kartei-hinten');
      hinten.className = 'tx-kartei-hinten';
      hinten.textContent = z.text;
      let laut = '';
      try { laut = this.phon.respellLine(z.text, this._lautOptionen()).words.filter((w) => w.isWord).map((w) => w.de).join(' '); } catch { laut = ''; }
      if (laut) { const l = mach('span', 'tx-kartei-laut'); l.textContent = laut; hinten.appendChild(l); }
      bew.classList.remove('versteckt');
      knopfAuf.disabled = true;
      this.modusZustand.kartenAuf = z.nr;
      this._abdecken();
    };
    const knopfAuf = this._knopf('Aufdecken', aufdecken, '', 'auge');
    box.appendChild(this._reihe(
      this._knopf('Zeile hören', () => { if (this.zeile !== z) this.waehleZeile(z.nr, { stoppen: false }); this.spieleZeile(z); }, 'akzent', 'play'),
      knopfAuf,
    ));
    box.appendChild(bew);
  }

  // ---------------------------------------------------------------- Ganzes Lied abfragen
  _modusLied(box) {
    this._kopf(box, 'Ganzes Lied abfragen', 'Das ganze Lied läuft – du singst mit. Wähle, wie viel Hilfe du willst: ganzer Text, nur Anfangsbuchstaben oder gar nichts (dann zählt nur dein Gedächtnis).');
    this.modusZustand.kHilfe ||= 'text';
    const seg = mach('div', 'segmente');
    for (const [w, n] of [['text', 'Ganzer Text'], ['anfang', 'Anfangsbuchstaben'], ['nichts', 'Kein Text']]) {
      const b = mach('button', w === this.modusZustand.kHilfe ? 'an' : '');
      b.textContent = n;
      b.onclick = () => {
        this.modusZustand.kHilfe = w;
        for (const x of seg.children) x.classList.toggle('an', x === b);
        this._abdecken();
        if (this._liedZeige) this._liedZeige(this._liedT ?? null);
      };
      seg.appendChild(b);
    }
    const gross = mach('div', 'tx-gross tx-lied-jetzt');
    const klein = mach('div', 'tx-lied-dann');
    const form = (txt) => {
      const h = this.modusZustand.kHilfe;
      if (h === 'text') return txt;
      if (h === 'anfang') return zeilenWoerter(txt).map((w) => this._anfangsForm(w)).join(' ');
      return '…';
    };
    const zeige = (t) => {
      this._liedT = t;
      if (t == null) { gross.textContent = ''; klein.textContent = 'Tippe auf „Ab Anfang“ oder „Ab dieser Zeile“.'; return; }
      const { aktuell, naechste } = zeileBei(this.song, t);
      gross.textContent = aktuell ? form(aktuell.text) : '';
      klein.textContent = naechste ? `dann: ${this.modusZustand.kHilfe === 'text' ? naechste.text : '…'}` : '';
      if (aktuell && aktuell !== this.zeile) this.waehleZeile(aktuell.nr, { stoppen: false });
      if (aktuell && aktuell === this.zeile) { this.melodieZeit = t; this._silbenMarkieren(t); }
    };
    this._liedZeige = zeige;
    box.appendChild(this._reihe(seg));
    box.appendChild(this._reihe(
      this._knopf('Ab Anfang', () => this.spieleBereich(0, this.song.dauer, { runden: 1, echo: false, beiZeit: zeige, fertig: () => zeige(null) }), 'akzent', 'play'),
      this._knopf('Ab dieser Zeile', () => this.spieleBereich(this.zeile.ts - 0.5, this.song.dauer, { runden: 1, echo: false, beiZeit: zeige, fertig: () => zeige(null) }), '', 'weiter'),
      this._knopf('Stopp', () => { this.stop(); zeige(null); }, '', 'stopp'),
    ));
    box.appendChild(gross);
    box.appendChild(klein);
    zeige(null);
  }

  // ------------------------------------------------------------------------------------ Nachschlagen (Reiter)
  _reiterBauen() {
    const nav = this.r.reiter;
    nav.innerHTML = '';
    const akt = this.wert('reiter');
    for (const [id, name] of REITER) {
      const b = mach('button', id === akt ? 'an' : '');
      b.textContent = name;
      b.onclick = () => { this.setze('reiter', id); this._reiterBauen(); };
      nav.appendChild(b);
    }
    const box = this.r.nachInhalt;
    box.scrollTop = 0;
    if (akt === 'wortschatz') this._wortschatzZeigen(box);
    else if (akt === 'legende') this._legendeZeigen(box);
    else if (akt === 'worum') this._worumZeigen(box);
    else if (akt === 'fortschritt') this._fortschrittZeigen(box);
    else this._lautlehreZeigen(box);
  }

  _lautlehreZeigen(box, id = null) {
    box.innerHTML = '';
    box.scrollTop = 0;
    const ll = this.lautlehre;
    const kap = ll.kapitel.find((k) => k.id === id);
    if (!kap) {
      const kopf = mach('div', 'tx-erkl tx-blass');
      kopf.textContent = `${ll.titel || 'Lautlehre'}. Tippe auf ein Kapitel.`;
      box.appendChild(kopf);
      if (!ll.kapitel.length) box.insertAdjacentHTML('beforeend', '<div class="tx-leer">Die Lautlehre ist nicht geladen.</div>');
      ll.kapitel.forEach((k, i) => {
        const el = mach('button', 'tx-kapitel', `<b>${i + 1}. ${esc(k.titel)}${k.unsicher ? '<span class="tx-unsicher">unsicher</span>' : ''}</b><span>${esc(k.kurz || '')}</span>`);
        el.onclick = () => this._lautlehreZeigen(box, k.id);
        box.appendChild(el);
      });
      return;
    }
    box.appendChild(this._knopf('Alle Kapitel', () => this._lautlehreZeigen(box), 'tx-klein', 'zurueck'));
    box.insertAdjacentHTML('beforeend', `<h3>${esc(kap.titel)}${kap.unsicher ? '<span class="tx-unsicher">unsicher</span>' : ''}</h3><div class="tx-text">${md(kap.erklaerung || '')}</div>`);
    if (kap.beispiele && kap.beispiele.length) {
      box.insertAdjacentHTML('beforeend', '<div class="abschnittstitel">Beispiele</div>');
      for (const b of kap.beispiele) {
        box.insertAdjacentHTML('beforeend', `<div class="tx-bsp"><span>${esc(b.dialekt)}</span><span class="tx-bsp-laut">${esc(b.lautschrift)}</span><span class="tx-blass">${esc(b.hd)}</span></div>`);
      }
    }
    if (kap.uebung) box.insertAdjacentHTML('beforeend', `<div class="tx-kachel"><b>Übung</b><div>${md(kap.uebung)}</div></div>`);
  }

  _wortschatzZeigen(box) {
    box.innerHTML = '<div class="tx-erkl tx-blass">Die Wörter des Liedes mit ungefährer Bedeutung (allgemeines Wörterbuch, keine Übersetzung des Liedes). Antippen springt zur ersten Zeile mit dem Wort.</div>';
    const suche = mach('input', 'tx-suche');
    suche.type = 'search';
    suche.placeholder = 'Wort oder Bedeutung suchen';
    suche.setAttribute('autocomplete', 'off');
    suche.setAttribute('autocorrect', 'off');
    suche.setAttribute('autocapitalize', 'off');
    suche.spellcheck = false;
    box.appendChild(suche);
    const liste = mach('div', 'tx-wortliste');
    box.appendChild(liste);
    const zaehl = new Map();
    for (const z of this.song.zeilen || []) {
      if (z.summen) continue;
      for (const w of z.text.split(/\s+/)) {
        const k = w.replace(/[.,!?;:]/g, '');
        if (!k) continue;
        try { if (this.phon.isSummen(k)) continue; } catch { /* egal */ }
        const e = zaehl.get(k.toLowerCase()) || { wort: k, n: 0, zeile: z.nr };
        e.n++;
        zaehl.set(k.toLowerCase(), e);
      }
    }
    const eintraege = [...zaehl.values()].sort((a, b) => a.wort.localeCompare(b.wort, 'de')).map((e) => {
      let g = null;
      try { g = this.phon.glossWord(e.wort); } catch { g = null; }
      const el = mach('button', 'tx-wort-eintrag', '<b></b><span></span><small></small>');
      el.querySelector('b').textContent = e.wort;
      el.querySelector('span').innerHTML = g ? `${esc(g.hd)}${g.unsicher ? '<span class="tx-unsicher">unsicher</span>' : ''}` : '<span class="tx-blass">–</span>';
      el.querySelector('small').textContent = `${e.n}×`;
      el.onclick = () => { this.waehleZeile(e.zeile, { mitte: true }); this._blattZu(); };
      liste.appendChild(el);
      return { el, such: `${e.wort} ${g ? g.hd : ''}`.toLowerCase() };
    });
    const leer = mach('div', 'tx-leer versteckt', 'Nichts gefunden.');
    liste.appendChild(leer);
    suche.oninput = () => {
      const s = suche.value.trim().toLowerCase();
      let n = 0;
      for (const e of eintraege) { const ja = !s || e.such.includes(s); e.el.classList.toggle('versteckt', !ja); if (ja) n++; }
      leer.classList.toggle('versteckt', n > 0);
    };
  }

  _legendeZeigen(box) {
    box.innerHTML = '<div class="tx-erkl tx-blass">So liest du die Lautschrift. Sie ist eine Näherung für deutsche Ohren – die Aufnahme bleibt die Wahrheit.</div>';
    for (const l of this.phon.LEGENDE || []) {
      const el = mach('div', 'tx-legende', '<b></b><div></div><small></small>');
      el.querySelector('b').textContent = l.zeichen;
      el.querySelector('div').textContent = l.bedeutung;
      el.querySelector('small').textContent = l.beispiel || '';
      box.appendChild(el);
    }
    box.insertAdjacentHTML('beforeend', '<div class="abschnittstitel">Darstellung</div>');
    const opts = [
      ['laut.anlautKch', 'ch am Wortanfang als „kχ“', 'Unsicher, ob so gesprochen – die Aufnahme entscheidet.'],
      ['laut.offenesAe', 'Offenes ä als „æ“', ''],
      ['laut.vollvokale', 'Volle Endvokale mit „°“ markieren', ''],
      ['laut.grossBetont', 'Betonte Silbe GROSS', ''],
      ['zeigeIpa', 'Zusätzlich IPA (international)', ''],
      ['zeigeMelodie', 'Melodie-Leiste zeigen', ''],
      ['abdecken', 'Zeile in Übe-Modi abdecken', 'Bei Lückentext, Anfangsbuchstaben, Rückwärts und Karteikarten steht die Lösung sonst direkt darüber.'],
    ];
    for (const [p, titel, hilfe] of opts) {
      const feld = mach('div', 'feld', `<label></label><label class="schalter"><input type="checkbox"><span></span></label>`);
      const lab = feld.querySelector('label');
      lab.textContent = titel;
      if (hilfe) { const h = mach('span', 'hilfe'); h.textContent = hilfe; lab.appendChild(h); }
      const inp = feld.querySelector('input');
      inp.checked = !!this.wert(p);
      inp.setAttribute('aria-label', titel);
      inp.onchange = () => this.setze(p, inp.checked);
      lab.onclick = () => { inp.checked = !inp.checked; this.setze(p, inp.checked); };
      box.appendChild(feld);
    }
  }

  _worumZeigen(box) {
    const w = this.worum;
    if (!w) { box.innerHTML = '<div class="tx-leer">Der Text für „Worum geht’s?“ ist nicht geladen.</div>'; return; }
    // stammt aus daten/worum.json (eigene Datei, verschluesselt ausgeliefert)
    box.innerHTML = `<div class="tx-worum"><h3>${esc(w.titel || 'Worum geht’s?')}</h3>${w.html || ''}</div>`;
  }

  _fortschrittZeigen(box) {
    const tz = this._textZeilen();
    const tage = Object.entries(this.fort.tage).sort((a, b) => b[0].localeCompare(a[0]));
    const sicher = tz.filter((z) => this._zf(z.nr).sterne >= 4).length;
    const gehoert = tz.reduce((s, z) => s + (this._zf(z.nr).wdh || 0), 0);
    let h = `<h3>Dein Stand</h3>
      <div class="tx-kacheln"><div class="tx-kachel">Sicher (4–5 Sterne)<b>${sicher} / ${tz.length}</b></div><div class="tx-kachel">Gesamt gehört<b>${gehoert}×</b></div></div>
      <div class="abschnittstitel">Je Liedteil</div>`;
    const teile = [];
    for (const z of tz) {
      const a = this._abschnitt(z);
      let e = teile.find((x) => x.a === a);
      if (!e) { e = { a, summe: 0, n: 0 }; teile.push(e); }
      e.summe += this._zf(z.nr).sterne || 0;
      e.n++;
    }
    for (const e of teile) {
      const anteil = e.n ? e.summe / (e.n * 5) : 0;
      h += `<div class="tx-teil"><span class="tx-teil-name"><i style="background:${esc(e.a.farbe)}"></i>${esc(e.a.name)}</span><span class="tx-balken"><i style="width:${Math.round(anteil * 100)}%"></i></span><small>${Math.round(anteil * 100)} %</small></div>`;
    }
    h += '<div class="abschnittstitel">Letzte Tage</div>';
    h += tage.slice(0, 10).map(([d, v]) => `<div class="tx-tag"><b>${esc(d)}</b><span>${Math.round((v.sekunden || 0) / 60)} min</span><small>${v.wdh || 0}× gehört</small></div>`).join('') || '<div class="tx-blass">Noch nichts – leg los!</div>';
    box.innerHTML = h;
  }
}
