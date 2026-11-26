// Oberflaeche der Klavier-Ansicht (iPad): Kopf, Akkord-Anzeige, Liedtext, Leiste, Zeitleiste, Coach,
// Lernpfad, Einstellungen (Blatt), Akkordblatt. Touch zuerst, alle Tippflaechen >= 44 px.
import { THEMEN } from './buehne.js';
import { symbol, setzeSymbol } from './symbole.js';
import { zeitFormat, abschnittBei, akkordBei, zeileBei, beatAusZeit, zeitAusBeat } from './song.js';
import { akkordName, akkordStufe, tonartNach } from './notennamen.js';
import { zeilenSilben } from './silben.js';
import { updateBaustein } from './update.js';
import { sicherungBaustein } from './sicherung.js';

export const EBENEN_VORLAGEN = {
  voll: { mel: true, harm: true, fill: true, bass: true, acc: true },
  mittel: { mel: true, harm: false, fill: false, bass: true, acc: true },
  leicht: { mel: true, harm: false, fill: false, bass: true, acc: false },
  melodie: { mel: true, harm: false, fill: false, bass: false, acc: false },
};

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Oberflaeche {
  constructor(k) {
    Object.assign(this, k);              // app, song, einst, tr, engine, buehne, uw, aktionen, phon
    this.zeileJetzt = undefined;
    this.silbenSpans = [];
    this.offenesBlatt = null;
    this.reiter = 'ueben';
  }

  // ================================================================== Aufbau
  bauen() {
    const a = this.app;
    a.insertAdjacentHTML('beforeend', `
      <header id="kopf">
        <div class="titelkarte glas"><div class="titel" id="uiTitel"></div><div class="unter" id="uiUnter"></div></div>
        <div class="mitte">
          <span class="pille" id="uiAbschnitt"></span>
          <span class="pille leise" id="uiTakt"></span>
          <span class="pille schlaege" id="uiSchlaege"><i class="eins"></i><i></i><i></i><i></i></span>
          <span class="pille leise" id="uiTempo"></span>
        </div>
        <div class="rechts">
          <button class="knopf rund" id="btnStart" aria-label="Startseite"></button>
          <button class="knopf rund" id="btnText" aria-label="Text lernen"></button>
          <button class="knopf rund" id="btnBlatt" aria-label="Liedblatt: Akkorde über dem Text"></button>
          <button class="knopf rund" id="btnEinst" aria-label="Einstellungen"></button>
        </div>
      </header>
      <div id="akkordHud" class="glas"><div class="akk" id="uiAkk"></div><div class="stufe" id="uiStufe"></div><div class="naechster"><span>dann</span> <b id="uiAkkN"></b></div></div>
      <div id="liedtext"><div class="zeile" id="ltAktuell"></div><div class="laut" id="ltLaut"></div><div class="naechste" id="ltNaechste"></div></div>
      <div id="einzaehler"></div>
      <div id="musterKarte" class="glas versteckt"><b>Nach Akkorden spielen</b><span id="musterText"></span></div>
      <section id="coach" class="glas versteckt" aria-live="polite">
        <div class="coachkopf"><span class="etappe" id="coEtappe"></span>
          <button class="knopf" id="coPfad" aria-label="Lernpfad"></button><button class="knopf" id="coZu" aria-label="Übeweg beenden"></button></div>
        <div class="stationen" id="coStationen"></div>
        <div class="coach-nachricht" id="coNachricht"></div>
        <div class="durchgaenge" id="coDurchgaenge"></div>
        <div class="coach-urteil" id="coUrteil">
          <button class="knopf ja" id="coJa"></button><button class="knopf" id="coNein"></button>
        </div>
        <div class="coach-knoepfe">
          <button class="knopf" id="coLos"></button>
          <button class="knopf" id="coWeiter">Überspringen</button>
          <button class="knopf" id="coTextUeben"></button>
        </div>
        <div class="coach-fuss" id="coFuss"></div>
      </section>
      <footer id="steuerung" class="glas">
        <canvas id="zeitleiste"></canvas>
        <div class="reihe">
          <div class="gruppe">
            <button class="knopf gross akzent rund" id="btnPlay" aria-label="Abspielen"></button>
            <button class="knopf rund" id="btnAnfang" aria-label="Zum Anfang"></button>
            <button class="knopf rund" id="btnSchleife" aria-label="Schleife"></button>
            <button class="knopf uebeweg" id="btnUebeweg"></button>
            <span class="zeit" id="uiZeit"></span>
          </div>
          <div class="gruppe tempo">
            <button class="knopf rund" id="btnLangsamer" aria-label="Langsamer"></button>
            <input type="range" id="tempoRegler" min="30" max="130" step="5" aria-label="Tempo">
            <span class="wert" id="tempoWert"></span>
            <button class="knopf rund" id="btnSchneller" aria-label="Schneller"></button>
          </div>
          <div class="gruppe">
            <select id="selStil" class="fassung nur-gross" aria-label="Fassung und Begleit-Stil"></select>
            <select id="selStufe" class="stufe nur-gross" aria-label="Stufe"></select>
            <div class="segmente nur-gross" id="segHand" aria-label="Du spielst">
              <button data-wert="nichts">Hören</button><button data-wert="L">Links</button><button data-wert="beide">Beide</button><button data-wert="R">Rechts</button>
            </div>
            <select id="selSpur" class="nur-gross" aria-label="Mitlaufen">
              <option value="keine">Nur Klavier</option><option value="original">+ Original</option><option value="karaoke">+ Karaoke</option><option value="gesang">+ Nur Gesang</option>
            </select>
            <button class="knopf rund nur-gross" id="btnMetronom" aria-label="Metronom"></button>
            <button class="knopf rund nur-gross" id="btnLied" aria-label="Liedtext"></button>
            <button class="knopf rund" id="btnKlein" aria-label="Leiste einklappen"></button>
          </div>
        </div>
      </footer>
      <div class="blatt-hinter versteckt" id="blattHinter"></div>
      <aside class="blatt glas" id="blatt" aria-modal="true">
        <div class="blatt-kopf"><h2 id="blattTitel"></h2><button class="knopf rund" id="blattZu" aria-label="Schließen"></button></div>
        <nav class="reiter" id="blattReiter"></nav>
        <div class="blatt-inhalt" id="blattInhalt"></div>
      </aside>
      <div id="textWurzel" class="versteckt"></div>
      <div id="blattWurzel" class="versteckt"></div>
      <div id="startWurzel" class="versteckt"></div>
      <div id="toast" role="status" aria-live="polite"></div>`);
    this.symboleSetzen();
    this.bindungen();
    this.zeitleisteEinrichten();
    this.zustandSync();
  }

  symboleSetzen() {
    const $ = (id) => document.getElementById(id);
    setzeSymbol($('btnText'), 'lautschule');
    setzeSymbol($('btnStart'), 'haus');
    setzeSymbol($('btnBlatt'), 'liedblatt');
    setzeSymbol($('btnEinst'), 'zahnrad');
    setzeSymbol($('btnPlay'), 'play');
    setzeSymbol($('btnAnfang'), 'anfang');
    setzeSymbol($('btnSchleife'), 'schleife');
    setzeSymbol($('btnUebeweg'), 'pfad', 'Übeweg');
    setzeSymbol($('btnLangsamer'), 'minus');
    setzeSymbol($('btnSchneller'), 'plus');
    setzeSymbol($('btnMetronom'), 'metronom');
    setzeSymbol($('btnLied'), 'text');
    setzeSymbol($('btnKlein'), 'weiter');
    setzeSymbol($('coPfad'), 'liste');
    setzeSymbol($('coZu'), 'kreuz');
    setzeSymbol($('coJa'), 'haken', 'Geklappt');
    setzeSymbol($('coNein'), 'wiederholen', 'Nochmal');
    setzeSymbol($('coTextUeben'), 'lautschule', 'Text üben');
    setzeSymbol($('blattZu'), 'kreuz');
  }

  bindungen() {
    const $ = (id) => document.getElementById(id);
    const a = this.aktionen, e = this.einst;
    $('btnPlay').onclick = () => a.umschalten();
    $('btnAnfang').onclick = () => a.zumAnfang();
    $('btnSchleife').onclick = () => a.schleifeUmschalten();
    $('btnUebeweg').onclick = () => a.uebewegUmschalten();
    $('btnLangsamer').onclick = () => a.tempoAendern(-0.05);
    $('btnSchneller').onclick = () => a.tempoAendern(0.05);
    $('tempoRegler').oninput = (ev) => a.tempoSetzen(Number(ev.target.value) / 100);
    $('btnMetronom').onclick = () => { e.set('spiel.metronom', !e.get('spiel.metronom')); this.toast(e.get('spiel.metronom') ? 'Metronom an' : 'Metronom aus'); };
    $('btnLied').onclick = () => e.set('liedtext.anzeigen', !e.get('liedtext.anzeigen'));
    $('btnKlein').onclick = () => e.set('ansicht.leisteKlein', !e.get('ansicht.leisteKlein'));
    $('btnText').onclick = () => a.textOeffnen();
    $('btnStart').onclick = () => a.startOeffnen();
    $('btnBlatt').onclick = () => this.aktionen.liedblattOeffnen();
    $('btnEinst').onclick = () => this.blattOeffnen('einstellungen');
    $('blattZu').onclick = () => this.blattZu();
    $('blattHinter').onclick = () => this.blattZu();
    // Fassung in zwei Schritten: Stil (Song, Begleit-Stile, Mein Arrangement) und Stufe
    const sf = $('selStil');
    sf.innerHTML = '';
    const opt = (wert, text) => { const o = document.createElement('option'); o.value = wert; o.textContent = text; return o; };
    sf.appendChild(opt('song', 'Song (mit Melodie)'));
    const gruppe = document.createElement('optgroup');
    gruppe.label = 'Begleitung zum Singen';
    for (const st of this.song.stile || []) gruppe.appendChild(opt(st.id, st.name));
    gruppe.appendChild(opt('mix', 'Mein Arrangement'));
    sf.appendChild(gruppe);
    sf.onchange = (ev) => { a.stilWaehlen(ev.target.value); ev.target.blur(); };
    $('selStufe').onchange = (ev) => { a.stufeWaehlen(Number(ev.target.value)); ev.target.blur(); };
    $('selSpur').onchange = (ev) => { e.set('klang.spurQuelle', ev.target.value); ev.target.blur(); };
    for (const b of $('segHand').querySelectorAll('button')) b.onclick = () => e.set('spiel.hand', b.dataset.wert);
    // Coach
    const uw = this.uw;
    $('coZu').onclick = () => a.uebewegUmschalten();
    $('coPfad').onclick = () => this.blattOeffnen('pfad');
    $('coJa').onclick = () => { this.engine.aufwecken(); uw.werten(true); };
    $('coNein').onclick = () => { this.engine.aufwecken(); uw.werten(false); };
    $('coLos').onclick = () => a.umschalten();
    $('coWeiter').onclick = () => uw.ueberspringen();
    uw.on((art, x) => {
      if (art === 'start') { $('coach').classList.remove('versteckt'); $('btnUebeweg').classList.add('an'); }
      if (art === 'ende') { $('coach').classList.add('versteckt'); $('btnUebeweg').classList.remove('an'); if (this.offenesBlatt === 'pfad') this.blattZu(); }
      if (art === 'stationFertig') { this.buehne.feiern(0.5); this.toast(`${x.titel} geschafft!`); }
      if (art === 'etappeFertig') { this.buehne.feiern(1.4); this.toast(`${x.etappe.titel} geschafft – ${x.sterne} von 3 Sternen`, 2600); }
      if (art === 'tagesziel') { this.buehne.feiern(1.0); this.toast(`Tagesziel erreicht: ${x} ${x === 1 ? 'Minute' : 'Minuten'} geübt. Stark!`, 3200); }
      if (art === 'pause') this.toast('Schon 25 Minuten am Stück – kurz aufstehen, Schultern lockern, etwas trinken.', 6000);
      this.coachRender();
      if (this.offenesBlatt === 'pfad') this.pfadRender();
    });
  }

  // Zustaende in die Knoepfe uebertragen (nach jeder Einstellungsaenderung)
  zustandSync() {
    const $ = (id) => document.getElementById(id);
    const e = this.einst, s = this.song;
    $('uiTitel').textContent = s.titel || '';
    $('uiUnter').textContent = [s.kuenstlerin, s.fassung?.name, s.tonartName || 'Des-Dur'].filter(Boolean).join(' · ');
    this.stilAuswahlSync();
    $('selSpur').value = e.get('klang.spurQuelle');
    for (const b of $('segHand').querySelectorAll('button')) b.classList.toggle('an', b.dataset.wert === e.get('spiel.hand'));
    $('btnMetronom').classList.toggle('an', !!e.get('spiel.metronom'));
    $('btnLied').classList.toggle('an', !!e.get('liedtext.anzeigen'));
    $('btnSchleife').classList.toggle('an', this.tr.loop.aktiv);
    const klein = !!e.get('ansicht.leisteKlein');
    $('steuerung').classList.toggle('klein', klein);
    setzeSymbol($('btnKlein'), klein ? 'zurueck' : 'weiter');
    $('btnKlein').setAttribute('aria-label', klein ? 'Leiste ausklappen' : 'Leiste einklappen');
    $('liedtext').classList.toggle('versteckt', !e.get('liedtext.anzeigen'));
    $('liedtext').classList.toggle('mitte', e.get('liedtext.position') === 'mitte');
    $('liedtext').classList.toggle('gross', !!e.get('liedtext.gross'));
    $('akkordHud').classList.toggle('versteckt', !e.get('ansicht.akkordHud'));
    this.zeileJetzt = undefined;
  }

  stilAuswahlSync() {
    const $ = (id) => document.getElementById(id);
    const f = this.song.fassung;
    const stil = f.id === 'song' ? 'song' : f.stil || 'standard';
    $('selStil').value = stil;
    const stufen = stil === 'song' || stil === 'mix' ? [] : this.song.fassungen.filter((x) => x.stil === stil).sort((a, b) => a.stufe - b.stufe);
    const sel = $('selStufe');
    const sig = stufen.map((x) => x.id).join('|');
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      sel.innerHTML = '';
      for (const x of stufen) { const o = document.createElement('option'); o.value = String(x.stufe); o.textContent = `${x.stufe} · ${x.stufeName}`; sel.appendChild(o); }
    }
    sel.classList.toggle('versteckt', !stufen.length);
    if (stufen.length) sel.value = String(f.stufe);
  }

  // ================================================================== pro Bild
  update(t) {
    const $ = (id) => document.getElementById(id);
    const tr = this.tr, s = this.song;
    // Play-Knopf
    const spielt = tr.spielt;
    if (spielt !== this._spielt) { this._spielt = spielt; setzeSymbol($('btnPlay'), spielt ? 'pause' : 'play'); setzeSymbol($('coLos'), spielt ? 'pause' : 'play', spielt ? 'Pause' : 'Los'); }
    // Kopf
    const ab = abschnittBei(s, t);
    if (ab !== this._ab) { this._ab = ab; $('uiAbschnitt').textContent = ab ? ab.name : ''; $('uiAbschnitt').style.borderColor = ab ? ab.farbe : ''; }
    const b = beatAusZeit(s, t);
    const vorT = s.fassung?.anfang_b != null ? Math.round(-s.fassung.anfang_b / 4) : 0;
    const anzahl = s.taktAnzahl || s.takte.length;
    const zaehltEin = spielt && t < tr.startZeit - 0.02;
    const taktTxt = zaehltEin ? 'Einzählen'
      : b < 0 && vorT > 0 && b >= -vorT * 4 - 1e-3 ? `Vorspiel ${Math.floor(b / 4) + vorT + 1}/${vorT}`
      : `Takt ${Math.min(Math.max(1, Math.floor(b / 4) + 1), anzahl)}/${anzahl}`;
    if (taktTxt !== this._takt) { this._takt = taktTxt; $('uiTakt').textContent = taktTxt; }
    const schlag = ((Math.floor(b) % 4) + 4) % 4;
    const punkte = $('uiSchlaege').children;
    for (let i = 0; i < 4; i++) punkte[i].classList.toggle('an', spielt && i === schlag && b - Math.floor(b) < 0.35);
    const tempoTxt = `${Math.round(s.bpm * tr.speed)} BPM`;
    if (tempoTxt !== this._tempoTxt) {
      this._tempoTxt = tempoTxt; $('uiTempo').textContent = tempoTxt;
      $('tempoWert').textContent = `${Math.round(tr.speed * 100)} %`;
      $('tempoRegler').value = String(Math.round(tr.speed * 100));
    }
    const zeitTxt = `${zeitFormat(t)} / ${zeitFormat(s.ende)}`;
    if (zeitTxt !== this._zeit) { this._zeit = zeitTxt; $('uiZeit').textContent = zeitTxt; }
    // Akkorde
    if (this.einst.get('ansicht.akkordHud')) {
      const ak = akkordBei(s, t + 0.03);
      if (ak.akkord !== this._akk) {
        this._akk = ak.akkord;
        const sys = this.einst.get('ansicht.akkordSystem');
        $('uiAkk').textContent = ak.akkord ? akkordName(ak.akkord.sym, sys) : '–';
        $('uiStufe').textContent = ak.akkord ? akkordStufe(ak.akkord.sym) : '';
        $('uiAkkN').textContent = ak.naechster ? akkordName(ak.naechster.sym, sys) : '';
      }
    }
    if (this.einst.get('liedtext.anzeigen')) this.liedtextUpdate(t);
    this.einzaehlerUpdate(t);
    this.zeitleisteZeichnen(t);
    if (this.uw.aktiv) {
      const fragt = this.uw.wartetAufUrteil;
      if (fragt !== this._fragt) { this._fragt = fragt; $('coUrteil').classList.toggle('fragt', fragt); }
    }
    const jetzt = performance.now();
    if (!this._ltZeit || jetzt - this._ltZeit > 300) { this._ltZeit = jetzt; this.liedtextPlatz(); }
  }

  // Liedtext nie unter dem Coach: im Querformat rechts daneben (bis zur Akkord-Anzeige), im Hochformat darunter
  liedtextPlatz() {
    const $ = (id) => document.getElementById(id);
    const lt = $('liedtext'), co = $('coach');
    const coachDa = !co.classList.contains('versteckt');
    const st = lt.style;
    if (!coachDa) { if (st.left || st.top) { st.left = st.width = st.top = st.transform = ''; } return; }
    const r = co.getBoundingClientRect();
    if (window.innerHeight > window.innerWidth) {
      st.left = st.width = st.transform = '';
      st.top = `${Math.round(r.bottom + 10)}px`;
    } else {
      const hud = $('akkordHud');
      const rechts = hud.classList.contains('versteckt') ? window.innerWidth - 12 : hud.getBoundingClientRect().left - 10;
      const links = r.right + 10;
      st.top = '';
      st.transform = 'none';
      st.left = `${Math.round(links)}px`;
      st.width = `${Math.round(Math.max(300, rechts - links))}px`;
    }
  }

  liedtextUpdate(t) {
    const $ = (id) => document.getElementById(id);
    const { aktuell, naechste } = zeileBei(this.song, t);
    if (aktuell !== this.zeileJetzt) {
      this.zeileJetzt = aktuell;
      const z = $('ltAktuell');
      z.classList.toggle('summen', !!aktuell?.summen);
      z.innerHTML = '';
      this.silbenSpans = [];
      if (aktuell) {
        zeilenSilben(aktuell.text).forEach((sb, i) => {
          if (sb.neuesWort && i > 0) z.appendChild(document.createTextNode(' '));
          const sp = el('span', 's');
          sp.textContent = sb.text;
          z.appendChild(sp);
          this.silbenSpans.push(sp);
        });
      }
      $('ltNaechste').textContent = naechste ? naechste.text : '';
      const laut = $('ltLaut');
      laut.innerHTML = '';
      if (aktuell && this.einst.get('liedtext.lautschrift') && this.phon && !aktuell.summen) {
        try {
          const r = this.phon.respellLine(aktuell.text, { grossBetont: false });
          for (const w of r.words) {
            if (!w.isWord) { laut.appendChild(document.createTextNode(w.text.replace(/\s+/g, ' '))); continue; }
            const silben = w.syllables || [];
            silben.forEach((sy, i) => {
              const sp = el(sy.stressed && silben.length > 1 ? 'u' : 'span');
              sp.textContent = (sy.de ?? sy.text ?? '') + (i < silben.length - 1 ? '-' : '');
              laut.appendChild(sp);
            });
          }
        } catch (e) { console.warn('Lautschrift', e); }
      }
    }
    if (!aktuell) return;
    const silben = aktuell.silben, n = this.silbenSpans.length;
    let index = -1;
    if (silben.length === n && n > 0) { for (let i = 0; i < n; i++) if (silben[i].t <= t + 0.03) index = i; }
    else if (n > 0) { const a = aktuell.ts, e = Math.max(a + 0.5, aktuell.tEnde); index = Math.floor(((t - a) / (e - a)) * n); }
    for (let i = 0; i < n; i++) {
      const cls = i < index ? 's gesungen' : i === index ? 's jetzt' : 's';
      if (this.silbenSpans[i].className !== cls) this.silbenSpans[i].className = cls;
    }
  }

  einzaehlerUpdate(t) {
    const z = document.getElementById('einzaehler');
    const tr = this.tr;
    if (tr.spielt && !tr.wartet && t < tr.startZeit - 0.02) {
      const rest = Math.ceil(beatAusZeit(this.song, tr.startZeit) - beatAusZeit(this.song, t) - 1e-6);
      if (rest >= 1 && rest <= 8) { if (z.textContent !== String(rest)) z.textContent = String(rest); z.classList.add('an'); return; }
    }
    z.classList.remove('an');
  }

  // ================================================================== Zeitleiste (Tippen = springen, Ziehen = Schleife)
  zeitleisteEinrichten() {
    const cv = document.getElementById('zeitleiste');
    this.zl = { cv, ctx: cv.getContext('2d'), zieh: null, letzterTipp: 0 };
    const zuZeit = (x) => this.song.anfang + (x / cv.clientWidth) * (this.song.ende - this.song.anfang);
    const xVon = (ev) => ev.clientX - cv.getBoundingClientRect().left;
    cv.addEventListener('pointerdown', (ev) => { try { cv.setPointerCapture(ev.pointerId); } catch { /* egal */ } const x = xVon(ev); this.zl.zieh = { x0: x, x1: x }; });
    cv.addEventListener('pointermove', (ev) => { if (this.zl.zieh) this.zl.zieh.x1 = xVon(ev); });
    cv.addEventListener('pointerup', () => {
      const z = this.zl.zieh;
      this.zl.zieh = null;
      if (!z) return;
      if (Math.abs(z.x1 - z.x0) > 12) {
        const a = this.aufTakt(zuZeit(Math.min(z.x0, z.x1)), false), b = this.aufTakt(zuZeit(Math.max(z.x0, z.x1)), true);
        this.aktionen.schleifeSetzen(a, b);
        this.toast('Schleife gesetzt');
        return;
      }
      const jetzt = performance.now();
      if (jetzt - this.zl.letzterTipp < 320) {               // Doppeltipp: Liedteil als Schleife
        const ab = abschnittBei(this.song, zuZeit(z.x0));
        this.aktionen.schleifeSetzen(ab.t, ab.te);
        this.toast(`Schleife: ${ab.name}`);
        this.zl.letzterTipp = 0;
        return;
      }
      this.zl.letzterTipp = jetzt;
      this.aktionen.springen(zuZeit(z.x0));
    });
    cv.addEventListener('pointercancel', () => { this.zl.zieh = null; });
  }

  aufTakt(t, ende) {
    const b = beatAusZeit(this.song, t);
    const tb = ende ? Math.ceil(b / 4) * 4 : Math.floor(b / 4) * 4;
    const min = Math.round(beatAusZeit(this.song, this.song.anfang));
    return zeitAusBeat(this.song, Math.max(min, tb));
  }

  zeitleisteZeichnen(t) {
    const { cv, ctx } = this.zl;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const A0 = this.song.anfang, L = this.song.ende;
    const x = (s) => ((s - A0) / (L - A0)) * W;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = '600 12px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const ab of this.song.abschnitte) {
      const x0 = x(ab.t), x1 = x(Math.min(ab.te, L));
      ctx.fillStyle = ab.farbe + '44'; ctx.fillRect(x0 + 1, 3, x1 - x0 - 2, H - 6);
      ctx.fillStyle = ab.farbe; ctx.fillRect(x0 + 1, H - 4, x1 - x0 - 2, 2);
      if (x1 - x0 > 40) {
        // Name auf die Breite des Liedteils kuerzen (sonst ueberlappen lange Namen im Hochformat)
        let name = ab.name;
        const platz = x1 - x0 - 14;
        if (ctx.measureText(name).width > platz) { while (name.length > 2 && ctx.measureText(name + '…').width > platz) name = name.slice(0, -1); name = name.trimEnd() + '…'; }
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(name, x0 + 8, H / 2);
      }
    }
    // Uebeweg-Etappe markieren
    if (this.uw.aktiv && this.uw.etappe) {
      const e = this.uw.etappe;
      const a = x(zeitAusBeat(this.song, e.vonB)), b = x(zeitAusBeat(this.song, e.bisB));
      ctx.fillStyle = 'rgba(255,211,107,0.35)'; ctx.fillRect(a, 0, Math.max(3, b - a), 3);
    }
    const lp = this.tr.loop;
    if (lp.aktiv || this.zl.zieh) {
      let a = x(lp.a), b = x(lp.b);
      if (this.zl.zieh && Math.abs(this.zl.zieh.x1 - this.zl.zieh.x0) > 12) { a = Math.min(this.zl.zieh.x0, this.zl.zieh.x1); b = Math.max(this.zl.zieh.x0, this.zl.zieh.x1); }
      else if (!lp.aktiv) { a = b = -10; }
      ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(a, 0, b - a, H);
      ctx.fillStyle = '#e3262e'; ctx.fillRect(a - 1, 0, 3, H); ctx.fillRect(b - 2, 0, 3, H);
    }
    const px = x(Math.max(A0, t));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 1.5, 0, 3, H);
  }

  // ================================================================== Coach (Uebeweg)
  coachRender() {
    const $ = (id) => document.getElementById(id);
    const uw = this.uw;
    if (!uw.aktiv) return;
    const e = uw.etappe, st = uw.station;
    if (!e) return;
    const z = uw.zustand(e);
    $('coEtappe').textContent = e.typ === 'abschnitt' && e.nr > 0 ? `${e.titel} · ${uw.taktText(e)}` : e.titel;
    const box = $('coStationen');
    box.innerHTML = '';
    for (const s of e.stationen) {
      const b = el('button', `st${z.stationen[s.id].fertig ? ' fertig' : ''}${s === st ? ' jetzt' : ''}`);
      b.textContent = s.titel;
      b.onclick = () => uw.stationWaehlen(s.id);
      box.appendChild(b);
    }
    $('coNachricht').textContent = uw.nachricht;
    const noetig = st ? st.noetig : 3;
    const zs = st ? z.stationen[st.id] : null;
    $('coDurchgaenge').innerHTML = Array.from({ length: noetig }, (_, i) => `<i class="${i < uw.sauberFolge ? 'voll' : ''}"></i>`).join('') +
      `<span>sauber in Folge · Tempo ${Math.round(((zs && zs.tempo) || (st && st.tempo) || 1) * 100)} %</span>`;
    const p = uw.fortschritt(), h = uw.heute(), faellig = uw.faellige().length;
    const ziel = this.einst.get('uebeweg.tagesZiel') || 0, min = Math.floor(h.sekunden / 60), serie = uw.serie();
    const zielHtml = ziel ? `<i class="tagesziel${min >= ziel ? ' voll' : ''}"><i style="width:${Math.min(100, (h.sekunden / 60 / ziel) * 100).toFixed(1)}%"></i></i>${min} / ${ziel} min` : `heute ${min} min`;
    $('coFuss').innerHTML = `<span>${p.fertig} von ${p.gesamt} Etappen${faellig ? ` · <b class="faellig">${faellig} zum Wiederholen</b>` : ''}</span><span>${zielHtml} · ${serie} ${serie === 1 ? 'Tag' : 'Tage'} in Folge</span>`;
    const tz = uw.ersteZeile(e);
    $('coTextUeben').classList.toggle('versteckt', !tz);
    $('coTextUeben').onclick = () => this.aktionen.textOeffnen(tz ? tz.nr : null);
    $('coUrteil').classList.toggle('fragt', uw.wartetAufUrteil);
  }

  pfadRender() {
    const uw = this.uw, box = document.getElementById('blattInhalt');
    if (!uw.aktiv) { uw.laden(); uw.planBauen(); }        // immer der Plan der aktuellen Fassung
    if (!uw.etappen.length) { box.innerHTML = '<p class="text-hilfe">Starte den Übeweg, dann erscheint hier dein Lernpfad.</p>'; return; }
    const p = uw.fortschritt();
    box.innerHTML = `<div class="text-hilfe">${p.fertig} von ${p.gesamt} Etappen geschafft</div><div class="pfadleiste"><i style="width:${(p.anteil * 100).toFixed(1)}%"></i></div>`;
    let teil = null;
    uw.etappen.forEach((e, i) => {
      if (e.teil !== teil) {
        teil = e.teil;
        const k = el('div', 'pfadteil', `<i style="background:${e.farbe}"></i>`);
        k.appendChild(document.createTextNode(teil));
        box.appendChild(k);
      }
      const z = uw.zustand(e);
      const zeile = el('div', `etp${z.fertig ? ' fertig' : ''}${i === uw.daten.aktuell ? ' jetzt' : ''}`);
      const kreis = e.typ === 'abschnitt' ? (e.nr === 0 ? 'V' : String(e.nr)) : e.typ === 'verbinden' ? '+' : e.typ === 'durchlauf' ? 'L' : 'G';
      const ersteZ = uw.ersteZeile(e);
      const unter = e.typ === 'abschnitt' ? `${uw.taktText(e)}${ersteZ ? ' · ' + ersteZ.text.split(/\s+/).slice(0, 3).join(' ') + ' …' : ''}` : e.typ === 'verbinden' ? 'Abschnitte zusammen' : e.typ === 'durchlauf' ? 'Liedteil am Stück' : 'Finale';
      zeile.innerHTML = `<span class="kreis">${z.fertig ? symbol('haken') : kreis}</span><span class="tx"><b></b><span></span></span><span class="sterne">${[0, 1, 2].map((k) => `<span class="${k < z.sterne ? 'voll' : ''}">${symbol('stern')}</span>`).join('')}</span>`;
      zeile.querySelector('b').textContent = e.typ === 'abschnitt' ? (e.nr === 0 ? 'Vorspiel' : `Abschnitt ${e.nr}`) : e.titel;
      if (uw.istFaellig(e)) zeile.querySelector('b').insertAdjacentHTML('beforeend', '<span class="faellig-tag">wiederholen</span>');
      zeile.querySelector('.tx span').textContent = unter;
      zeile.onclick = () => { if (!uw.aktiv) this.aktionen.uebewegUmschalten(); uw.springen(i); this.blattZu(); };
      box.appendChild(zeile);
    });
    const jetzt = box.querySelector('.etp.jetzt');
    if (jetzt) jetzt.scrollIntoView({ block: 'center' });
  }

  // ================================================================== Blatt (Einstellungen / Lernpfad)
  blattOeffnen(art) {
    const $ = (id) => document.getElementById(id);
    this.offenesBlatt = art;
    $('blattHinter').classList.remove('versteckt');
    requestAnimationFrame(() => { $('blattHinter').classList.add('offen'); $('blatt').classList.add('offen'); });
    $('blattTitel').textContent = art === 'pfad' ? 'Lernpfad' : 'Einstellungen';
    $('blattReiter').classList.toggle('versteckt', art === 'pfad');
    if (art === 'pfad') this.pfadRender();
    else { this.reiterBauen(); this.einstellungenBauen(); }
  }

  blattZu() {
    const $ = (id) => document.getElementById(id);
    this.offenesBlatt = null;
    $('blattHinter').classList.remove('offen');
    $('blatt').classList.remove('offen');
    setTimeout(() => { if (!this.offenesBlatt) $('blattHinter').classList.add('versteckt'); }, 260);
  }

  reiterBauen() {
    const nav = document.getElementById('blattReiter');
    nav.innerHTML = '';
    for (const [id, name] of [['stile', 'Stile'], ['ueben', 'Üben'], ['ansicht', 'Ansicht'], ['klang', 'Klang'], ['uebeweg', 'Übeweg'], ['info', 'Hilfe']]) {
      const b = el('button', this.reiter === id ? 'an' : '');
      b.textContent = name;
      b.onclick = () => { this.reiter = id; this.reiterBauen(); this.einstellungenBauen(); };
      nav.appendChild(b);
    }
  }

  einstellungenBauen() {
    const box = document.getElementById('blattInhalt');
    box.innerHTML = '';
    const T = (txt) => box.appendChild(el('div', 'abschnittstitel', esc(txt)));
    const F = (f) => box.appendChild(this.feldBauen(f));
    const r = this.reiter;
    if (r === 'stile') { this.stileBauen(box); return; }
    if (r === 'ueben') {
      T('Was spielst du?');
      F({ p: 'spiel.hand', l: 'Du spielst', t: 'auswahl', o: [['nichts', 'nichts – nur hören'], ['L', 'linke Hand'], ['R', 'rechte Hand'], ['beide', 'beide Hände']], h: 'Deine Hand ist stumm und leuchtet, die App spielt den Rest' });
      F({ p: 'ebenenVorlage', l: 'Schwierigkeit', t: 'auswahl', o: [['voll', 'Volle Fassung'], ['mittel', 'Mittel (ohne Harmonie)'], ['leicht', 'Leicht (Melodie + Bass)'], ['melodie', 'Nur Melodie']] });
      F({ p: 'spiel.einzaehlen', l: 'Einzählen beim Start', t: 'auswahl', o: [[0, 'nein'], [1, '1 Takt'], [2, '2 Takte']] });
      F({ p: 'spiel.metronom', l: 'Metronom', t: 'schalter' });
      F({ p: 'klang.transposition', l: 'Tonart', t: 'regler', min: -6, max: 6, step: 1, f: (v) => `${tonartNach(v).name}${v ? ` (${v > 0 ? '+' : ''}${v})` : ''}`, h: 'In deine Stimmlage (die Aufnahme schweigt dann)' });
      T('Liedtext');
      F({ p: 'liedtext.anzeigen', l: 'Liedtext anzeigen', t: 'schalter' });
      F({ p: 'liedtext.lautschrift', l: 'Lautschrift darunter', t: 'schalter' });
      F({ p: 'liedtext.gross', l: 'Große Schrift', t: 'schalter' });
      F({ p: 'liedtext.position', l: 'Position', t: 'auswahl', o: [['oben', 'oben'], ['mitte', 'Bildmitte']] });
    } else if (r === 'ansicht') {
      T('Noten');
      F({ p: 'ansicht.thema', l: 'Farben', t: 'auswahl', o: Object.entries(THEMEN).map(([k, v]) => [k, v.name]) });
      F({ p: 'ansicht.sichtSekunden', l: 'Vorausschau', t: 'regler', min: 1.5, max: 7, step: 0.5, f: (v) => `${v} s` });
      F({ p: 'ansicht.notenNamen', l: 'Notennamen in den Noten', t: 'schalter' });
      F({ p: 'ansicht.notenSystem', l: 'Notennamen', t: 'auswahl', o: [['de', 'Deutsch (C D E … H)'], ['en', 'Englisch (C D E … B)'], ['solfege', 'Do Re Mi'], ['stufe', 'Stufen (1–7)']] });
      F({ p: 'ansicht.tastenNamen', l: 'Tasten beschriften', t: 'auswahl', o: [['aus', 'aus'], ['c', 'nur C'], ['alle', 'alle']] });
      F({ p: 'ansicht.notenVerstecken', l: 'Auswendig lernen', t: 'auswahl', o: [['aus', 'Noten sichtbar'], ['kurz', 'nur kurz vorher'], ['ganz', 'ganz ausgeblendet']] });
      F({ p: 'ansicht.gesangslinie', l: 'Gesangslinie (Begleitung)', t: 'schalter', h: 'Deine Silben fallen als goldene Geisternoten mit' });
      F({ p: 'ansicht.akkordHud', l: 'Akkord-Anzeige', t: 'schalter' });
      F({ p: 'ansicht.akkordSpur', l: 'Akkorde in den Noten', t: 'schalter' });
      F({ p: 'ansicht.akkordSystem', l: 'Akkordnamen', t: 'auswahl', o: [['en', 'Englisch (Db, Bbm)'], ['de', 'Deutsch (Des, b-Moll)']] });
      F({ p: 'ansicht.akkordTasten', l: 'Akkordtöne auf den Tasten', t: 'schalter' });
      F({ p: 'ansicht.perspektive', l: '3D-Perspektive', t: 'regler', min: 0, max: 1, step: 0.05, f: (v) => (v ? `${Math.round(v * 100)} %` : 'flach') });
      F({ p: 'ansicht.tastaturHoehe', l: 'Höhe der Tastatur', t: 'regler', min: 0.7, max: 1.4, step: 0.05, f: (v) => `${Math.round(v * 100)} %` });
      T('Effekte');
      F({ p: 'effekte.aufprall', l: 'Lichtkrone beim Anschlag', t: 'schalter' });
      F({ p: 'effekte.bloom', l: 'Leuchten', t: 'regler', min: 0, max: 1, step: 0.05, f: (v) => `${Math.round(v * 100)} %` });
      F({ p: 'effekte.funken', l: 'Funkenregen', t: 'schalter' });
      F({ p: 'effekte.pulse', l: 'Pulsringe', t: 'schalter' });
      F({ p: 'effekte.sterne', l: 'Sternenhimmel', t: 'schalter' });
      F({ p: 'effekte.aurora', l: 'Aurora', t: 'schalter' });
      F({ p: 'ansicht.maxDpr', l: 'Bildschärfe', t: 'auswahl', o: [[2, 'voll (Retina)'], [1.5, 'Sparmodus (Akku)']] });
    } else if (r === 'klang') {
      F({ p: 'klang.master', l: 'Gesamtlautstärke', t: 'regler', min: 0, max: 1.2, step: 0.05, f: (v) => `${Math.round(v * 100)} %` });
      F({ p: 'klang.klavier', l: 'Klavier', t: 'regler', min: 0, max: 1.2, step: 0.05, f: (v) => `${Math.round(v * 100)} %` });
      F({ p: 'klang.spur', l: 'Mitlaufende Aufnahme', t: 'regler', min: 0, max: 1.2, step: 0.05, f: (v) => `${Math.round(v * 100)} %` });
      F({ p: 'klang.metronom', l: 'Metronom', t: 'regler', min: 0, max: 1.2, step: 0.05, f: (v) => `${Math.round(v * 100)} %` });
      F({ p: 'klang.hall', l: 'Raumhall', t: 'regler', min: 0, max: 1, step: 0.05, f: (v) => `${Math.round(v * 100)} %` });
      F({ p: 'klang.gesangsfuehrung', l: 'Gesangsführung', t: 'regler', min: 0, max: 1, step: 0.05, f: (v) => (v ? `${Math.round(v * 100)} %` : 'aus'), h: 'Spielt die Gesangsmelodie leise mit (zum Singenlernen)' });
    } else if (r === 'uebeweg') {
      F({ p: 'uebeweg.laenge', l: 'Länge eines Abschnitts', t: 'auswahl', o: [[1, '1 Takt (kleine Häppchen)'], [2, '2 Takte (empfohlen)'], [4, '4 Takte']] });
      F({ p: 'uebeweg.startTempo', l: 'Starttempo', t: 'regler', min: 30, max: 100, step: 5, f: (v) => `${v} %` });
      F({ p: 'uebeweg.zielTempo', l: 'Zieltempo', t: 'regler', min: 50, max: 120, step: 5, f: (v) => `${v} %` });
      F({ p: 'uebeweg.nachfragen', l: 'Nach jedem Durchgang fragen', t: 'schalter', h: 'Aus: jeder Durchgang zählt, außer du tippst „Nochmal“' });
      F({ p: 'uebeweg.pauseEinzaehlen', l: 'Einzählen vor jeder Wiederholung', t: 'schalter' });
      F({ p: 'uebeweg.tagesZiel', l: 'Tagesziel', t: 'regler', min: 0, max: 60, step: 5, f: (v) => (v ? `${v} min` : 'aus') });
      const b = el('button', 'knopf', 'Übeweg-Fortschritt dieser Fassung zurücksetzen');
      b.style.marginTop = '18px';
      b.onclick = () => { if (confirm('Fortschritt des Übewegs für diese Fassung wirklich löschen?')) { if (!this.uw.aktiv) this.aktionen.uebewegUmschalten(); this.uw.zuruecksetzenAlles(); this.toast('Übeweg zurückgesetzt'); } };
      box.appendChild(b);
    } else {
      T('Auf dem iPad');
      F({ p: 'geraet.wachHalten', l: 'Bildschirm beim Üben wach halten', t: 'schalter' });
      F({ p: 'geraet.start', l: 'Beim Öffnen zeigen', t: 'auswahl', o: [['auto', 'Automatisch (iPad: Startseite)'], ['start', 'Startseite'], ['klavier', 'Klavier'], ['liedblatt', 'Liedblatt'], ['text', 'Text lernen']] });
      F({ p: 'geraet.pedal', l: 'Bluetooth-Pedal / Tastatur', t: 'auswahl', o: [['geklappt', 'rechts = Geklappt, links = Nochmal'], ['takt', 'rechts/links = Takt vor/zurück']], h: 'Seitenwender-Pedale senden Pfeiltasten; Leertaste = Start/Stopp, Enter = Geklappt' });
      box.insertAdjacentHTML('beforeend', `
        <div class="abschnittstitel">Bedienung</div>
        <p class="text-hilfe"><b>Noten antippen</b>: Start/Stopp. <b>Noten ziehen</b>: vor- und zurückspulen. <b>Tasten unten</b> sind spielbar.<br>
        <b>Zeitleiste</b>: antippen = springen, waagerecht ziehen = Schleife, doppelt tippen = Liedteil als Schleife.<br>
        <b>Übeweg</b>: kurze Abschnitte, erst links, dann rechts, dann beide; dreimal „Geklappt“, dann geht es weiter.</p>
        <div class="abschnittstitel">Offline</div>
        <p class="text-hilfe" id="infoOffline">Wird geprüft …</p>
        <div class="abschnittstitel">Über</div>
        <p class="text-hilfe">Privates Übungsprogramm. Inhalte liegen verschlüsselt im Netz und werden nur auf diesem Gerät entschlüsselt.<br>Stand: <span id="infoStand"></span></p>`);
      box.appendChild(updateBaustein());
      box.appendChild(el('div', 'abschnittstitel', 'Sicherung'));
      box.appendChild(sicherungBaustein((t, ms) => this.toast(t, ms)));
      const b = el('button', 'knopf', 'Alle Einstellungen zurücksetzen');
      b.onclick = () => { if (confirm('Alle Einstellungen auf Standard zurücksetzen? (Lernstände bleiben)')) { this.einst.zuruecksetzen(); this.toast('Einstellungen zurückgesetzt'); } };
      box.appendChild(b);
      this.aktionen.offlineInfo?.().then((t) => { const p = document.getElementById('infoOffline'); if (p) p.textContent = t; });
      const st = document.getElementById('infoStand'); if (st) st.textContent = window.TRESOR_INFO?.stand || 'Entwicklung';
    }
  }

  // Reiter "Stile": Steckbrief, Stil- und Stufenwahl, Karussell, Muster, Akkord-Modus, Baukasten
  stileBauen(box) {
    const s = this.song, f = s.fassung, a = this.aktionen;
    const stilId = f.id === 'song' ? 'song' : f.stil || 'standard';
    const stil = (s.stile || []).find((x) => x.id === stilId);
    const sb = stil?.steckbrief;
    box.innerHTML = `
      <div class="stil-steckbrief">
        <div class="stil-kopf"><b>${esc(stil ? stil.name : f.id === 'song' ? 'Song (mit Melodie)' : 'Mein Arrangement')}</b>${f.stufeName ? `<span>Stufe ${f.stufe} · ${esc(f.stufeName)}</span>` : ''}</div>
        ${sb ? `<p>${esc(sb.idee)}</p><div class="stil-muster">${esc(sb.muster)}</div><p class="text-hilfe"><b>Übe-Tipp:</b> ${esc(sb.tipp)}<br><b>Klingt nach:</b> ${esc(sb.hoeren)}</p>`
    : `<p class="text-hilfe">${f.id === 'song' ? 'Die Klavierfassung mit Melodie. Für die Begleit-Stile einen Stil wählen.' : 'Dein Mix aus den Stilen – unten je Liedteil einstellen.'}</p>`}
        ${f.beschreibung && f.art === 'begleitung' ? `<p class="text-hilfe">Diese Stufe: ${esc(f.beschreibung)}</p>` : ''}
      </div>
      <div class="abschnittstitel">Stil wählen</div>
      <div class="stil-liste" id="stilListe"></div>
      <div class="abschnittstitel">Stufe</div>
      <div class="stil-stufen" id="stufenReihe"></div>
      <div class="abschnittstitel">Hören & Üben</div>
      <div class="stil-stufen">
        <button class="knopf" id="stKarussell">${a.karussellAktiv?.() ? 'Karussell stoppen' : 'Stil-Karussell'}</button>
        <button class="knopf" id="stMuster">Muster üben</button>
        <button class="knopf" id="stAkkord">Nach Akkorden spielen</button>
      </div>
      <p class="text-hilfe">Karussell: Der Liedteil läuft in Schleife, nach jedem Durchgang kommt der nächste Stil. Muster üben: zwei Takte langsam in Schleife. Nach Akkorden spielen: Noten aus, Akkordtöne als Punkte – spiel das Muster frei.</p>
      <div class="abschnittstitel">Mein Arrangement – je Liedteil ein Stil</div>
      <div id="baukasten"></div>
      <div class="stil-stufen">
        <button class="knopf" id="bkVorschlag">Vorschlag laden</button>
        <button class="knopf akzent" id="bkSpielen">Mein Arrangement spielen</button>
      </div>`;
    const liste = document.getElementById('stilListe');
    for (const st of [{ id: 'song', name: 'Song (mit Melodie)', kurz: 'Klavierfassung mit Melodie' }, ...(s.stile || []), { id: 'mix', name: 'Mein Arrangement', kurz: 'dein Mix aus den Stilen' }]) {
      const b = el('button', `stil-knopf${st.id === stilId ? ' an' : ''}`, '<b></b><span></span>');
      b.querySelector('b').textContent = st.name;
      b.querySelector('span').textContent = st.kurz;
      b.onclick = () => { a.stilWaehlen(st.id); this.stileBauen(box); };
      liste.appendChild(b);
    }
    const reihe = document.getElementById('stufenReihe');
    const stufen = s.fassungen.filter((x) => x.stil === stilId && stilId !== 'mix').sort((x, y) => x.stufe - y.stufe);
    if (!stufen.length) reihe.innerHTML = '<span class="text-hilfe">–</span>';
    for (const x of stufen) {
      const b = el('button', `knopf${x.id === f.id ? ' an' : ''}`);
      b.textContent = `${x.stufe} · ${x.stufeName}`;
      b.onclick = () => { a.stufeWaehlen(x.stufe); this.stileBauen(box); };
      reihe.appendChild(b);
    }
    document.getElementById('stKarussell').onclick = () => { a.karussellUmschalten(); this.blattZu(); };
    document.getElementById('stMuster').onclick = () => { a.musterUeben(); this.blattZu(); };
    document.getElementById('stAkkord').onclick = () => { a.akkordModusUmschalten(); this.blattZu(); };
    const bk = document.getElementById('baukasten');
    const basis = s.fassungen.find((x) => x.id === 'begl1');
    const wahl = this.einst.get('baukasten') || {};
    for (const [i, ab] of (basis?.abschnitte || []).entries()) {
      const zeile = el('div', 'feld', '<label></label><select></select>');
      zeile.querySelector('label').textContent = ab.name;
      const sel = zeile.querySelector('select');
      sel.setAttribute('aria-label', ab.name);
      for (const st of s.stile || []) {
        const g = document.createElement('optgroup');
        g.label = st.name;
        for (const x of s.fassungen.filter((y) => y.stil === st.id).sort((p, q) => p.stufe - q.stufe)) {
          const o = el('option'); o.value = x.id; o.textContent = `${st.name} · ${x.stufeName}`; g.appendChild(o);
        }
        sel.appendChild(g);
      }
      sel.value = wahl[`t${i}`] || 'begl3';
      sel.onchange = () => { this.einst.set(`baukasten.t${i}`, sel.value); sel.blur(); };
      bk.appendChild(zeile);
    }
    document.getElementById('bkVorschlag').onclick = () => { a.baukastenVorschlag(); this.stileBauen(box); };
    document.getElementById('bkSpielen').onclick = () => { a.stilWaehlen('mix'); this.blattZu(); };
  }

  feldBauen(f) {
    const zeile = el('div', 'feld');
    const lab = el('label');
    lab.textContent = f.l;
    if (f.h) lab.appendChild(el('span', 'hilfe')).textContent = f.h;
    zeile.appendChild(lab);
    const wert = this.einst.get(f.p);
    const setze = (v) => this.einst.set(f.p, v);
    if (f.t === 'schalter') {
      const s = el('label', 'schalter', '<input type="checkbox"><span></span>');
      const i = s.querySelector('input'); i.checked = !!wert; i.setAttribute('aria-label', f.l);
      i.onchange = () => setze(i.checked);
      zeile.appendChild(s);
    } else if (f.t === 'auswahl') {
      const s = el('select'); s.setAttribute('aria-label', f.l);
      for (const [v, n] of f.o) { const o = el('option'); o.value = String(v); o.textContent = n; s.appendChild(o); }
      s.value = String(wert);
      s.onchange = () => { const roh = s.value, zahl = Number(roh); setze(f.o.some(([v]) => typeof v === 'number') && !isNaN(zahl) ? zahl : roh); s.blur(); };
      zeile.appendChild(s);
    } else if (f.t === 'regler') {
      const box = el('div'); box.style.cssText = 'display:flex;align-items:center;gap:10px';
      const r = el('input'); r.type = 'range'; r.min = f.min; r.max = f.max; r.step = f.step; r.value = wert; r.setAttribute('aria-label', f.l);
      const w = el('span', 'wert'); w.textContent = f.f ? f.f(Number(wert)) : wert;
      r.oninput = () => { w.textContent = f.f ? f.f(Number(r.value)) : r.value; setze(Number(r.value)); };
      box.appendChild(r); box.appendChild(w);
      zeile.appendChild(box);
    }
    return zeile;
  }

  // ================================================================== Meldung
  toast(text, ms = 1900) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('zeigen');
    clearTimeout(this._toast);
    this._toast = setTimeout(() => t.classList.remove('zeigen'), ms);
  }
}
