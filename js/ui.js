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
// Regler: gefuellter Anteil als CSS-Variable (die Spur malt bis dahin farbig)
export const reglerFuellen = (r) => {
  if (!r) return;
  const min = Number(r.min) || 0, max = Number(r.max) || 100, v = Number(r.value);
  r.style.setProperty('--p', `${Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100)).toFixed(1)}%`);
};
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
        <div class="mitte"><div class="status glas">
          <span class="pille" id="uiAbschnitt"></span>
          <span class="pille leise" id="uiTakt"></span>
          <span class="pille schlaege" id="uiSchlaege"><i class="eins"></i><i></i><i></i><i></i></span>
          <span class="pille leise" id="uiTempo"></span>
        </div></div>
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
        <div class="co-kopf">
          <div class="co-titel"><small id="coTeil"></small><b id="coEtappe"></b></div>
          <button class="knopf rund klein" id="coMini" aria-label="Übe-Karte einklappen"></button>
          <button class="knopf rund klein" id="coPfad" aria-label="Lernpfad"></button>
          <button class="knopf rund klein" id="coZu" aria-label="Übeweg beenden"></button>
        </div>
        <div class="co-weg">
          <button class="knopf rund klein" id="coZurueck" aria-label="Voriger Schritt"></button>
          <div class="co-punkte" id="coPunkte"></div>
          <button class="knopf rund klein" id="coVor" aria-label="Nächster Schritt"></button>
        </div>
        <div class="co-stationen" id="coStationen"></div>
        <p class="co-nachricht" id="coNachricht"></p>
        <div class="co-haupt">
          <button class="knopf rund co-los" id="coLos" aria-label="Abspielen"></button>
          <button class="knopf co-ja" id="coJa"></button>
          <button class="knopf co-nein" id="coNein"></button>
        </div>
        <div class="co-mehr">
          <div class="co-zeile"><span class="co-lab">Abschnitte</span>
            <div class="segmente klein" id="coLaenge"><button data-wert="kurz">Kurz</button><button data-wert="mittel">Mittel</button><button data-wert="lang">Länger</button></div></div>
          <div class="co-zeile"><span class="co-lab">Einzählen</span>
            <div class="segmente klein" id="coZaehl"><button data-wert="aus">Aus</button><button data-wert="still">Still</button><button data-wert="klick">Klick</button></div></div>
          <div class="co-zeile">
            <button class="co-chip" id="coSchleife"></button>
            <div class="co-tempo"><button class="knopf rund klein" id="coLangsamer" aria-label="Langsamer"></button><b id="coTempo"></b><button class="knopf rund klein" id="coSchneller" aria-label="Schneller"></button></div>
          </div>
          <div class="co-zeile co-extras">
            <button class="co-chip" id="coAnhoeren"></button>
            <button class="co-chip" id="coZusammen"></button>
            <button class="co-chip" id="coTextUeben"></button>
            <button class="co-chip" id="coWackel"></button>
          </div>
        </div>
        <div class="co-fuss" id="coFuss"></div>
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
    setzeSymbol($('coJa'), 'haken', 'Geschafft');
    setzeSymbol($('coNein'), 'wiederholen', 'Nochmal');
    setzeSymbol($('coLos'), 'play');
    setzeSymbol($('coZurueck'), 'rueck');
    setzeSymbol($('coVor'), 'vor');
    setzeSymbol($('coLangsamer'), 'minus');
    setzeSymbol($('coSchneller'), 'plus');
    setzeSymbol($('coSchleife'), 'schleife', 'Schleife');
    setzeSymbol($('coAnhoeren'), 'kopfhoerer', 'Anhören');
    setzeSymbol($('coTextUeben'), 'lautschule', 'Text');
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
    $('coJa').onclick = () => { this.engine.aufwecken(); uw.geschafft(); };
    $('coNein').onclick = () => { this.engine.aufwecken(); uw.nochmal(); };
    $('coLos').onclick = () => a.umschalten();
    $('coZurueck').onclick = () => uw.schritt(-1);
    $('coVor').onclick = () => uw.schritt(1);
    $('coMini').onclick = () => e.set('uebeweg.mini', !e.get('uebeweg.mini'));
    $('coSchleife').onclick = () => e.set('uebeweg.schleife', !e.get('uebeweg.schleife'));
    $('coLangsamer').onclick = () => uw.tempoAendern(-0.05);
    $('coSchneller').onclick = () => uw.tempoAendern(0.05);
    $('coAnhoeren').onclick = () => { this.engine.aufwecken(); uw.vorspielen(); };
    $('coZusammen').onclick = () => { this.engine.aufwecken(); uw.teilZusammen(); };
    $('coWackel').onclick = () => uw.wackelUmschalten();
    for (const b of $('coLaenge').querySelectorAll('button')) b.onclick = () => e.set('uebeweg.abschnitt', b.dataset.wert);
    for (const b of $('coZaehl').querySelectorAll('button')) b.onclick = () => this.einzaehlSetzen(b.dataset.wert);
    uw.on((art, x) => {
      if (art === 'start') { $('coach').classList.remove('versteckt'); $('btnUebeweg').classList.add('an'); }
      if (art === 'ende') { $('coach').classList.add('versteckt'); $('btnUebeweg').classList.remove('an'); if (this.offenesBlatt === 'pfad') this.blattZu(); }
      if (art === 'stationFertig') { this.buehne.feiern(x.etappeFertig ? 1.0 : 0.45); this.toast(x.etappeFertig ? `${x.etappe.typ === 'abschnitt' ? `${x.etappe.teil}, ${this.uw.taktText(x.etappe)}` : x.etappe.titel}: alles einmal durchgespielt` : `${x.station.titel}: einmal durchgespielt`, 2200); }
      if (art === 'fertig') { this.buehne.feiern(1.6); this.toast('Der ganze Übeweg ist einmal durchgespielt!', 3200); }
      if (art === 'tagesziel') { this.buehne.feiern(1.0); this.toast(`Tagesziel erreicht: ${x} ${x === 1 ? 'Minute' : 'Minuten'} geübt. Stark!`, 3200); }
      if (art === 'pause') this.toast('Schon 25 Minuten am Stück – kurz aufstehen, Schultern lockern, etwas trinken.', 6000);
      this.coachRender();
      if (this.offenesBlatt === 'pfad') this.pfadRender();
    });
  }

  // Einzaehlen: aus | still (nur 4-3-2-1 sehen) | klick (hoerbar)
  einzaehlArt() {
    const e = this.einst;
    if (!(Number(e.get('spiel.einzaehlen')) > 0)) return 'aus';
    return e.get('spiel.einzaehlKlick') === false ? 'still' : 'klick';
  }

  einzaehlSetzen(art) {
    const e = this.einst;
    if (art === 'aus') e.set('spiel.einzaehlen', 0);
    else {
      if (!(Number(e.get('spiel.einzaehlen')) > 0)) e.set('spiel.einzaehlen', 1);
      e.set('spiel.einzaehlKlick', art === 'klick');
    }
    this.toast(art === 'aus' ? 'Einzählen aus' : art === 'still' ? 'Einzählen still – nur die Zahlen' : 'Einzählen mit Klick', 1500);
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
    if (this.uw.aktiv) this.coachRender();
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
    if (spielt !== this._spielt) { this._spielt = spielt; setzeSymbol($('btnPlay'), spielt ? 'pause' : 'play'); setzeSymbol($('coLos'), spielt ? 'pause' : 'play'); $('coLos').classList.toggle('spielt', spielt); }
    // Kopf
    const ab = abschnittBei(s, t);
    if (ab !== this._ab) { this._ab = ab; $('uiAbschnitt').textContent = ab ? ab.name : ''; $('uiAbschnitt').style.setProperty('--farbe', ab ? ab.farbe : '#888'); }
    const b = beatAusZeit(s, t);
    const vorT = s.fassung?.anfang_b != null ? Math.round(-s.fassung.anfang_b / 4) : 0;
    const anzahl = s.taktAnzahl || s.takte.length;
    const zaehltEin = tr.einzaehlRest() > 0;
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
      reglerFuellen($('tempoRegler'));
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
    this.einzaehlerUpdate();
    this.zeitleisteZeichnen(t);
    if (this.uw.aktiv) {
      const fragt = this.uw.wartetAufUrteil;
      if (fragt !== this._fragt) { this._fragt = fragt; $('coJa').classList.toggle('fragt', fragt); }
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
    const hudL = $('akkordHud').classList.contains('versteckt') ? window.innerWidth - 12 : $('akkordHud').getBoundingClientRect().left - 10;
    if (window.innerHeight > window.innerWidth && hudL - (r.right + 10) < 320) {
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

  einzaehlerUpdate() {
    const z = document.getElementById('einzaehler');
    const rest = this.tr.einzaehlRest();
    if (rest >= 1 && rest <= 8) {
      if (z.textContent !== String(rest)) { z.textContent = String(rest); z.classList.remove('schlag'); void z.offsetWidth; z.classList.add('schlag'); }
      z.classList.add('an');
      return;
    }
    z.classList.remove('an');
  }

  // ================================================================== Zeitleiste
  // Tippen = springen · waagerecht ziehen = spulen (laeuft danach weiter) · lange druecken, dann ziehen = Schleife
  // · doppelt tippen = Liedteil als Schleife
  zeitleisteEinrichten() {
    const cv = document.getElementById('zeitleiste');
    this.zl = { cv, ctx: cv.getContext('2d'), zieh: null, letzterTipp: 0 };
    const zuZeit = (x) => this.song.anfang + (Math.max(0, Math.min(cv.clientWidth, x)) / cv.clientWidth) * (this.song.ende - this.song.anfang);
    const xVon = (ev) => ev.clientX - cv.getBoundingClientRect().left;
    cv.addEventListener('pointerdown', (ev) => {
      try { cv.setPointerCapture(ev.pointerId); } catch { /* egal */ }
      const x = xVon(ev);
      const z = { x0: x, x1: x, art: 'tipp', lief: this.tr.spielt };
      z.timer = setTimeout(() => {
        if (this.zl.zieh !== z || z.art !== 'tipp') return;
        z.art = 'schleife';                            // lange gedrueckt: jetzt zieht der Finger eine Schleife auf
        try { navigator.vibrate?.(12); } catch { /* egal */ }
        this.toast('Schleife: jetzt zur Seite ziehen', 1500);
      }, 480);
      this.zl.zieh = z;
    });
    cv.addEventListener('pointermove', (ev) => {
      const z = this.zl.zieh;
      if (!z) return;
      z.x1 = xVon(ev);
      if (z.art === 'tipp' && Math.abs(z.x1 - z.x0) > 8) {
        clearTimeout(z.timer);
        z.art = 'spulen';
        if (this.tr.spielt) this.tr.pause();
      }
      if (z.art === 'spulen') this.aktionen.springen(zuZeit(z.x1));
    });
    const ende = (ev) => {
      const z = this.zl.zieh;
      this.zl.zieh = null;
      if (!z) return;
      clearTimeout(z.timer);
      if (ev.type === 'pointercancel') return;
      if (z.art === 'spulen') { if (z.lief) this.tr.play(); return; }   // nach dem Spulen sofort weiter (ohne Einzaehlen)
      if (z.art === 'schleife') {
        if (Math.abs(z.x1 - z.x0) > 12) {
          const a = this.aufTakt(zuZeit(Math.min(z.x0, z.x1)), false), b = this.aufTakt(zuZeit(Math.max(z.x0, z.x1)), true);
          this.aktionen.schleifeSetzen(a, b);
          this.toast('Schleife gesetzt');
        } else {
          const ab = abschnittBei(this.song, zuZeit(z.x0));
          this.aktionen.schleifeSetzen(ab.t, ab.te);
          this.toast(`Schleife: ${ab.name}`);
        }
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
    };
    cv.addEventListener('pointerup', ende);
    cv.addEventListener('pointercancel', ende);
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
    const rund = (x0, y0, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, r); else ctx.rect(x0, y0, w, h); };
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    rund(0, 0, W, H, 10); ctx.fill();
    ctx.font = '650 12.5px ui-rounded, -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const px = x(Math.max(A0, t));
    for (const ab of this.song.abschnitte) {
      const x0 = x(ab.t), x1 = x(Math.min(ab.te, L));
      const w = Math.max(1, x1 - x0 - 3);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, ab.farbe + '66'); g.addColorStop(1, ab.farbe + '30');
      ctx.fillStyle = g; rund(x0 + 1.5, 3, w, H - 6, 7); ctx.fill();
      // gespielter Teil etwas heller
      if (px > x0) { ctx.fillStyle = ab.farbe + '40'; rund(x0 + 1.5, 3, Math.min(w, px - x0 - 1.5), H - 6, 7); ctx.fill(); }
      ctx.fillStyle = ab.farbe; ctx.fillRect(x0 + 6, H - 6, Math.max(0, w - 9), 2);
      if (x1 - x0 > 40) {
        // Name auf die Breite des Liedteils kuerzen (sonst ueberlappen lange Namen im Hochformat)
        let name = ab.name;
        const platz = x1 - x0 - 16;
        if (ctx.measureText(name).width > platz) { while (name.length > 2 && ctx.measureText(name + '…').width > platz) name = name.slice(0, -1); name = name.trimEnd() + '…'; }
        ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillText(name, x0 + 9, H / 2 - 1);
      }
    }
    // Uebeweg-Etappe markieren
    if (this.uw.aktiv && this.uw.etappe) {
      const e = this.uw.etappe;
      const a = x(zeitAusBeat(this.song, e.vonB)), b = x(zeitAusBeat(this.song, e.bisB));
      ctx.fillStyle = 'rgba(255,211,107,0.9)'; rund(a, 0, Math.max(4, b - a), 3, 1.5); ctx.fill();
    }
    const lp = this.tr.loop;
    const zs = this.zl.zieh && this.zl.zieh.art === 'schleife' ? this.zl.zieh : null;   // Schleife wird gerade aufgezogen
    if (lp.aktiv || zs) {
      let a = x(lp.a), b = x(lp.b);
      if (zs && Math.abs(zs.x1 - zs.x0) > 12) { a = Math.min(zs.x0, zs.x1); b = Math.max(zs.x0, zs.x1); }
      else if (!lp.aktiv) { a = b = -10; }
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; rund(a, 0, b - a, H, 8); ctx.fill();
      ctx.fillStyle = '#ff4a50'; rund(a - 1, 0, 3, H, 1.5); ctx.fill(); rund(b - 2, 0, 3, H, 1.5); ctx.fill();
    }
    // Abspielkopf: Linie mit Leuchten und Knopf
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    rund(px - 1.5, 1, 3, H - 2, 1.5); ctx.fill();
    ctx.beginPath(); ctx.arc(px, 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ================================================================== Coach (Uebeweg)
  coachRender() {
    const $ = (id) => document.getElementById(id);
    const uw = this.uw, e0 = this.einst;
    if (!uw.aktiv) return;
    const e = uw.etappe, st = uw.station;
    if (!e) return;
    const z = uw.zustand(e);
    const co = $('coach');
    co.classList.toggle('mini', !!e0.get('uebeweg.mini'));
    co.style.setProperty('--teil', e.farbe || '#ffd36b');
    setzeSymbol($('coMini'), e0.get('uebeweg.mini') ? 'ausklappen' : 'einklappen');
    $('coMini').setAttribute('aria-label', e0.get('uebeweg.mini') ? 'Übe-Karte ausklappen' : 'Übe-Karte einklappen');
    $('coTeil').textContent = e.typ === 'ganz' ? 'Finale' : e.teil;
    $('coEtappe').textContent = e.typ === 'abschnitt' ? `${uw.taktText(e).replace(/^Vorspiel, /, '')}${st ? ` · ${st.kurz}` : ''}`
      : e.typ === 'durchlauf' ? `Alle zusammen${st ? ` · ${st.kurz}` : ''}` : e.typ === 'verbinden' ? `${e.nr - 1} + ${e.nr} verbinden` : `${e.titel}${st ? ` · ${st.kurz}` : ''}`;
    // Abschnitte des Liedteils als Punkte (antippen = dorthin)
    const punkte = $('coPunkte');
    punkte.innerHTML = '';
    for (const { e: x, i } of uw.teilListe(e)) {
      const zx = uw.zustand(x);
      const teilweise = !zx.fertig && Object.values(zx.stationen).some((v) => v.fertig);
      const b = el('button', `co-punkt${x.typ === 'durchlauf' ? ' alle' : ''}${zx.fertig ? ' fertig' : teilweise ? ' teil' : ''}${i === uw.daten.aktuell ? ' jetzt' : ''}${zx.wackel ? ' wackel' : ''}`);
      b.setAttribute('aria-label', x.typ === 'durchlauf' ? 'Alle zusammen' : `${x.titel}, ${uw.taktText(x)}`);
      if (x.typ === 'durchlauf') b.innerHTML = symbol('zusammen');
      else b.textContent = String(x.nr);
      b.onclick = () => { this.engine.aufwecken(); uw.springen(i); };
      punkte.appendChild(b);
    }
    // Stationen: Hand frei waehlbar, Haken = einmal durchgespielt
    const box = $('coStationen');
    box.innerHTML = '';
    for (const s of e.stationen) {
      const fertig = z.stationen[s.id].fertig;
      const b = el('button', `co-st${fertig ? ' fertig' : ''}${s === st ? ' jetzt' : ''}${s.pflicht ? '' : ' frei'}`);
      b.innerHTML = `<span>${esc(s.kurz)}</span>${fertig ? symbol('haken') : ''}`;
      b.onclick = () => { this.engine.aufwecken(); uw.stationWaehlen(s.id); };
      box.appendChild(b);
    }
    $('coNachricht').textContent = uw.nachricht;
    const zs = st ? z.stationen[st.id] : null;
    $('coTempo').textContent = `${Math.round(((zs && zs.tempo) || (st && st.tempo) || 1) * 100)} %`;
    for (const b of $('coLaenge').querySelectorAll('button')) b.classList.toggle('an', b.dataset.wert === uw.laengeId());
    const za = this.einzaehlArt();
    for (const b of $('coZaehl').querySelectorAll('button')) b.classList.toggle('an', b.dataset.wert === za);
    const schleife = !!e0.get('uebeweg.schleife');
    $('coSchleife').classList.toggle('an', schleife);
    $('coSchleife').querySelector('span').textContent = schleife ? (uw.runde ? `Schleife · Runde ${uw.runde + 1}` : 'Schleife an') : 'Schleife aus';
    $('coJa').classList.toggle('fragt', uw.wartetAufUrteil);
    // Alle zusammen (bzw. zurueck zu den Abschnitten)
    const zi = uw.zusammenIndex(e);
    $('coZusammen').classList.toggle('versteckt', zi < 0);
    setzeSymbol($('coZusammen'), e.typ === 'durchlauf' ? 'rueck' : 'zusammen', e.typ === 'durchlauf' ? 'Zu den Abschnitten' : 'Alle zusammen');
    $('coAnhoeren').classList.toggle('an', uw.anhoeren);
    setzeSymbol($('coWackel'), 'flagge', z.wackel ? 'Gemerkt' : 'Merken');
    $('coWackel').classList.toggle('an', !!z.wackel);
    const tz = uw.ersteZeile(e);
    $('coTextUeben').classList.toggle('versteckt', !tz);
    $('coTextUeben').onclick = () => this.aktionen.textOeffnen(tz ? tz.nr : null);
    const p = uw.fortschritt(), h = uw.heute(), faellig = uw.faellige().length;
    const ziel = e0.get('uebeweg.tagesZiel') || 0, min = Math.floor(h.sekunden / 60), serie = uw.serie();
    const zielHtml = ziel ? `<i class="tagesziel${min >= ziel ? ' voll' : ''}"><i style="width:${Math.min(100, (h.sekunden / 60 / ziel) * 100).toFixed(1)}%"></i></i>${min} / ${ziel} min` : `heute ${min} min`;
    $('coFuss').innerHTML = `<span>${p.fertig} von ${p.gesamt} Schritten${faellig ? ` · <b class="faellig">${faellig} wiederholen</b>` : ''}</span><span>${zielHtml}${serie ? ` · ${serie} ${serie === 1 ? 'Tag' : 'Tage'} in Folge` : ''}</span>`;
  }

  pfadRender() {
    const uw = this.uw, box = document.getElementById('blattInhalt');
    if (!uw.aktiv) { uw.laden(); uw.planBauen(); }        // immer der Plan der aktuellen Fassung
    if (!uw.etappen.length) { box.innerHTML = '<p class="text-hilfe">Starte den Übeweg, dann erscheint hier dein Lernpfad.</p>'; return; }
    const p = uw.fortschritt();
    box.innerHTML = `<div class="pfad-kopf"><div><b>${p.fertig}</b><span> von ${p.gesamt} Schritten einmal durchgespielt</span></div><div class="pfadleiste"><i style="width:${(p.anteil * 100).toFixed(1)}%"></i></div>
      <p class="text-hilfe">Haken heißt: einmal durchgespielt – nicht, dass es perfekt sitzen muss. Antippen springt dorthin.</p></div>`;
    const wl = uw.wackelListe();
    if (wl.length) {
      const b = el('button', 'knopf gold pfad-wackel');
      setzeSymbol(b, 'flagge', `Gemerkte Stellen üben (${wl.length})`);
      b.onclick = () => { if (!uw.aktiv) this.aktionen.uebewegUmschalten(); uw.naechsteWackelstelle(); this.blattZu(); };
      box.appendChild(b);
    }
    let teil = null, gruppe = null;
    uw.etappen.forEach((e, i) => {
      if (e.teil !== teil) {
        teil = e.teil;
        gruppe = el('section', 'pfad-gruppe');
        gruppe.style.setProperty('--teil', e.farbe);
        const alle = uw.etappen.filter((x) => x.teil === teil);
        const fertig = alle.filter((x) => uw.zustand(x).fertig).length;
        gruppe.innerHTML = `<header><i></i><b></b><span>${fertig}/${alle.length}</span></header>`;
        gruppe.querySelector('b').textContent = teil;
        box.appendChild(gruppe);
      }
      const z = uw.zustand(e);
      const zeile = el('button', `etp ${e.typ}${z.fertig ? ' fertig' : ''}${i === uw.daten.aktuell ? ' jetzt' : ''}`);
      const kreis = e.typ === 'abschnitt' ? String(e.nr) : e.typ === 'verbinden' ? symbol('plus') : e.typ === 'durchlauf' ? symbol('zusammen') : symbol('stern');
      const ersteZ = uw.ersteZeile(e);
      const titel = e.typ === 'abschnitt' ? uw.taktText(e) : e.typ === 'durchlauf' ? 'Alle zusammen' : e.typ === 'verbinden' ? `${e.nr - 1} + ${e.nr} verbinden` : e.titel;
      const laufZ = !ersteZ && e.typ === 'abschnitt' ? uw.laufendeZeile(e) : null;
      const unter = e.typ === 'abschnitt' ? (ersteZ ? ersteZ.text.split(/\s+/).slice(0, 4).join(' ') + ' …' : laufZ ? '… ' + laufZ.text.split(/\s+/).slice(-3).join(' ') : 'ohne Gesang') : e.typ === 'verbinden' ? 'Übergang üben' : e.typ === 'durchlauf' ? 'der ganze Liedteil am Stück' : 'von vorn bis hinten';
      const pips = e.stationen.map((s) => `<i class="${z.stationen[s.id].fertig ? 'voll' : ''}${s.pflicht ? '' : ' frei'}" title="${esc(s.titel)}">${esc(s.kurz[0])}</i>`).join('');
      zeile.innerHTML = `<span class="kreis">${z.fertig ? symbol('haken') : kreis}</span><span class="tx"><b></b><span></span></span><span class="pips">${pips}</span>`;
      zeile.querySelector('b').textContent = titel;
      if (uw.istFaellig(e)) zeile.querySelector('b').insertAdjacentHTML('beforeend', '<span class="faellig-tag">wiederholen</span>');
      if (z.wackel) zeile.querySelector('b').insertAdjacentHTML('beforeend', `<span class="wackel-tag">${symbol('flagge')}gemerkt</span>`);
      zeile.querySelector('.tx > span').textContent = unter;
      zeile.onclick = () => { if (!uw.aktiv) this.aktionen.uebewegUmschalten(); uw.springen(i); this.blattZu(); };
      gruppe.appendChild(zeile);
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
      F({ p: 'spiel.einzaehlen', l: 'Einzählen beim Start', t: 'segment', o: [[0, 'Aus'], [1, '1 Takt'], [2, '2 Takte']] });
      F({ p: 'spiel.einzaehlKlick', l: 'Einzählen hörbar (Klick)', t: 'schalter', h: 'Aus: die Zahlen 4-3-2-1 erscheinen, aber es klickt nicht' });
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
      F({ p: 'klang.spurVersatz', l: 'Aufnahme und Klavier abgleichen', t: 'regler', min: -300, max: 300, step: 10, f: (v) => (!v ? 'genau' : v < 0 ? `Klavier ${-v} ms früher` : `Klavier ${v} ms später`), h: 'Nur falls es bei dir hörbar versetzt klingt: klingt das Klavier zu spät, nach links schieben; zu früh, nach rechts.' });
      F({ p: 'klang.metronom', l: 'Metronom', t: 'regler', min: 0, max: 1.2, step: 0.05, f: (v) => `${Math.round(v * 100)} %` });
      F({ p: 'klang.hall', l: 'Raumhall', t: 'regler', min: 0, max: 1, step: 0.05, f: (v) => `${Math.round(v * 100)} %` });
      F({ p: 'klang.gesangsfuehrung', l: 'Gesangsführung', t: 'regler', min: 0, max: 1, step: 0.05, f: (v) => (v ? `${Math.round(v * 100)} %` : 'aus'), h: 'Spielt die Gesangsmelodie leise mit (zum Singenlernen)' });
    } else if (r === 'uebeweg') {
      T('Abschnitte');
      F({ p: 'uebeweg.abschnitt', l: 'Länge', t: 'segment', o: [['kurz', 'Kurz'], ['mittel', 'Mittel'], ['lang', 'Länger']], h: 'Kurz = 1 Takt, Mittel = 2 Takte, Länger = 4 Takte. Auch direkt in der Übe-Karte.' });
      F({ p: 'uebeweg.reihenfolge', l: 'Reihenfolge', t: 'auswahl', o: [['abschnitt', 'Abschnitt für Abschnitt'], ['hand', 'Hand für Hand']], h: 'Hand für Hand: erst alle Abschnitte eines Liedteils links, dann alle zusammen links, dann rechts …' });
      T('Wiederholen');
      F({ p: 'uebeweg.schleife', l: 'Schleife', t: 'schalter', h: 'An: der Abschnitt läuft immer wieder, bis du „Geschafft“ oder „Weiter“ tippst. Aus: nach jedem Durchgang anhalten.' });
      F({ p: 'uebeweg.treppe', l: 'Tempo-Treppe in der Schleife', t: 'schalter', h: 'Jede Runde 5 % schneller – bis zum Zieltempo' });
      F({ p: 'uebeweg.pauseEinzaehlen', l: 'Einzählen vor jeder Runde', t: 'schalter', h: 'Kurze Atempause mit 4-3-2-1 (Klick je nach Einstellung „Einzählen hörbar“)' });
      T('Tempo und Ziel');
      F({ p: 'uebeweg.startTempo', l: 'Starttempo', t: 'regler', min: 30, max: 100, step: 5, f: (v) => `${v} %` });
      F({ p: 'uebeweg.zielTempo', l: 'Zieltempo', t: 'regler', min: 50, max: 120, step: 5, f: (v) => `${v} %` });
      F({ p: 'uebeweg.tagesZiel', l: 'Tagesziel', t: 'regler', min: 0, max: 60, step: 5, f: (v) => (v ? `${v} min` : 'aus') });
      const b = el('button', 'knopf', 'Haken dieser Fassung zurücksetzen');
      b.style.marginTop = '18px';
      b.onclick = () => { if (confirm('Alle Haken des Übewegs für diese Fassung entfernen?')) { if (!this.uw.aktiv) this.aktionen.uebewegUmschalten(); this.uw.zuruecksetzenAlles(); this.toast('Übeweg zurückgesetzt'); } };
      box.appendChild(b);
    } else {
      T('Auf dem iPad');
      F({ p: 'geraet.wachHalten', l: 'Bildschirm beim Üben wach halten', t: 'schalter' });
      F({ p: 'geraet.start', l: 'Beim Öffnen zeigen', t: 'auswahl', o: [['auto', 'Automatisch (iPad: Startseite)'], ['start', 'Startseite'], ['klavier', 'Klavier'], ['liedblatt', 'Liedblatt'], ['text', 'Text lernen']] });
      F({ p: 'geraet.pedal', l: 'Bluetooth-Pedal / Tastatur', t: 'auswahl', o: [['geklappt', 'rechts = Geschafft, links = Nochmal'], ['takt', 'rechts/links = Takt vor/zurück']], h: 'Seitenwender-Pedale senden Pfeiltasten; Leertaste = Start/Stopp, Enter = Geschafft' });
      box.insertAdjacentHTML('beforeend', `
        <div class="abschnittstitel">Bedienung</div>
        <p class="text-hilfe"><b>Noten antippen</b>: Start/Stopp. <b>Noten ziehen</b>: vor- und zurückspulen. <b>Tasten unten</b> sind spielbar.<br>
        <b>Zeitleiste</b>: antippen = springen, waagerecht ziehen = spulen, lange drücken und ziehen = Schleife, doppelt tippen = Liedteil als Schleife.<br>
        <b>Noten</b>: doppelt links/rechts tippen = 10 Sekunden zurück/vor, zwei Finger = zoomen, lange drücken = 2-Takt-Schleife.<br>
        <b>Übeweg</b>: kurze Abschnitte, erst links, dann rechts, dann beide. „Geschafft“ heißt: einmal durchgespielt. Hand, Länge, Schleife und Einzählen sind jederzeit in der Übe-Karte umstellbar; „Alle zusammen“ spielt den ganzen Liedteil am Stück, „Anhören“ spielt den Abschnitt einmal vor. Der Pfeil oben klappt die Karte klein.<br>
        <b>Tastatur</b>: Leertaste = Start/Stopp, Enter = Geschafft, N = Nochmal, H = Anhören, S = Schleife, Z = Alle zusammen, F = Stelle merken, G = zur gemerkten Stelle, U = Übeweg.</p>
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
    } else if (f.t === 'segment') {
      zeile.classList.add('feld-segment');
      const s = el('div', 'segmente');
      s.setAttribute('aria-label', f.l);
      for (const [v, n] of f.o) {
        const b = el('button', String(v) === String(wert) ? 'an' : '');
        b.textContent = n;
        b.onclick = () => { setze(v); for (const x of s.children) x.classList.toggle('an', x === b); };
        s.appendChild(b);
      }
      zeile.appendChild(s);
    } else if (f.t === 'regler') {
      const box = el('div'); box.style.cssText = 'display:flex;align-items:center;gap:10px';
      const r = el('input'); r.type = 'range'; r.min = f.min; r.max = f.max; r.step = f.step; r.value = wert; r.setAttribute('aria-label', f.l);
      reglerFuellen(r);
      const w = el('span', 'wert'); w.textContent = f.f ? f.f(Number(wert)) : wert;
      r.oninput = () => { reglerFuellen(r); w.textContent = f.f ? f.f(Number(r.value)) : r.value; setze(Number(r.value)); };
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
