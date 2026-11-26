// Transport: Master-Uhr, Tempo, Schleife, Einzaehler, Metronom, Notenplanung, Warte-Halt, mitlaufende Aufnahme.
// iPad-Fassung (neu 26.11.2026):
//   * Einzaehlen: die Stelle bleibt stehen, es klickt (und die Anzeige zaehlt), dann laeuft alles zugleich los.
//   * Weiterspielen mitten im Ton: Toene, die an der Startstelle noch klingen, werden mit angeschlagen.
//   * Aufnahme bei 100 %: als dekodierter Puffer auf derselben Audio-Uhr wie das Klavier – stichgenau, ohne
//     Nachziehen. Bei anderem Tempo (Tonhoehe bleibt) das Audio-Element: stiller Vorlauf, die Uhr wartet, bis die
//     Aufnahme an der Stelle ist; danach nur bei groben Abweichungen nachspulen, kleine sanft ausgleichen.
//   * spurVersatz: Feinabgleich (Sekunden; Stelle in der Aufnahme = Songzeit + Versatz,
//     negativ = Aufnahme klingt spaeter, also das Klavier frueher).
import { zeitAusBeat, beatAusZeit } from './song.js';

export class Transport {
  constructor(engine, song) {
    this.e = engine;
    this.song = song;
    this.pos = 0;                  // Songzeit in Sekunden (Zeitachse der Aufnahme)
    this.speed = 1;
    this.spielt = false;
    this.basisPos = 0;             // Songzeit ...
    this.basisCtx = 0;             // ... zu dieser AudioContext-Zeit (liegt sie in der Zukunft, steht die Uhr bis dahin)
    this.loop = { a: 0, b: song.ende, aktiv: false };
    this.filter = () => true;      // welche Noten der Computer spielt
    this.anschlag = (n) => n.v;    // Anschlagsstaerke (fuer Lautstaerke je Ebene)
    this.stummAb = Infinity;       // Noten ab dieser Songzeit nicht spielen (Liedblatt: "Aufnahme" / "Stumm")
    this.geplantBis = 0;
    this.geplant = [];             // {stimme, n, wann}
    this.medium = null;            // aktive Aufnahme {el, gain, puffer?}
    this.mediumPegel = 0.9;
    this.spurVersatz = 0;
    this.metronom = false;
    this.metronomPegel = 0.8;
    this.zaehl = null;             // laufendes Einzaehlen {ende, schlag, n}
    this.zaehlKlicks = [];
    this.startZeit = 0;            // Stelle, an der zuletzt gestartet wurde
    this.einzaehlBis = -Infinity;  // (alt, fuer Anzeigen) Ende des Einzaehlens in Songzeit
    this.naechsterKlick = 0;       // Schlagindex
    this.nachklang = false;        // beim naechsten Planen klingende Toene an der Startstelle anschlagen
    this.halteBei = null;          // Warte-Modus: hier anhalten
    this.wartet = false;
    this.hoerer = { loop: new Set(), ende: new Set(), zustand: new Set() };
    this.verstimmungCent = 0;
    this.loopEinzaehlen = 0;       // Schlaege Einzaehlen vor jeder Wiederholung (Uebeweg)
    this.einzaehlKlick = true;     // Einzaehlen hoerbar (sonst nur die Anzeige 4-3-2-1)
    this.klangZiel = 'app';        // 'app' | 'midi' (E-Piano) | 'beide'
    this.ausgabe = null;
    this.ausgabeStopp = null;
    // Aufnahme
    this.pufferQuelle = null;      // laufende AudioBufferSource (Puffer-Modus)
    this.medStart = null;          // Element-Modus: Uhr wartet, bis die Aufnahme an der Stelle ist {ziel, seit}
    this.anlauf = 0;               // Element gestartet, laeuft aber noch nicht (ctx-Zeit)
    this.anlaufZeit = 0.15;        // geschaetzte Anlaufzeit des Audio-Elements (lernt mit)
    this.korrigiert = 0;
    this.ema = 0;
    this._takt = setInterval(() => this.planen(), 25);
  }

  on(art, fn) { this.hoerer[art].add(fn); return () => this.hoerer[art].delete(fn); }
  melde(art, ...a) { for (const f of this.hoerer[art]) f(...a); }

  get jetztCtx() { return this.e.ctx.currentTime; }

  zeitJetzt() {
    if (!this.spielt || this.wartet) return this.pos;
    return this.basisPos + Math.max(0, this.jetztCtx - this.basisCtx) * this.speed;
  }

  // AudioContext-Zeit, zu der Songzeit t erklingt (bei laufender bzw. geplanter Uhr)
  ctxFuer(t) { return this.basisCtx + (t - this.basisPos) / this.speed; }

  rebase(pos = this.zeitJetzt(), ctx = this.jetztCtx) { this.basisPos = pos; this.basisCtx = ctx; this.pos = pos; }

  // Wie viele Schlaege noch eingezaehlt werden (0 = keiner)
  einzaehlRest() {
    if (!this.spielt || !this.zaehl) return 0;
    const rest = this.zaehl.ende - this.jetztCtx;
    return rest > 0 ? Math.ceil(rest / this.zaehl.schlag - 1e-3) : 0;
  }

  // laeuft gleich los (Einzaehlen oder Aufnahme laeuft an)?
  laeuftAn() { return this.spielt && (this.einzaehlRest() > 0 || !!this.medStart); }

  // --------------------------------------------------------------------------- Steuerung
  async play({ einzaehlen = 0 } = {}) {
    if (this.spielt) return;
    const marke = (this._playMarke = (this._playMarke || 0) + 1);
    await this.e.aufwecken();
    if (this.spielt || marke !== this._playMarke) return;
    let start = this.pos;
    if (start >= this.song.ende - 0.05) start = this.loop.aktiv ? this.loop.a : this.song.anfang;
    if (this.loop.aktiv && (start < this.loop.a - 0.01 || start >= this.loop.b)) start = this.loop.a;
    const c = this.jetztCtx;
    let los = c + 0.05;                               // kleiner Vorlauf: der erste Ton ist sauber geplant
    this.zaehlKlickeStoppen();
    if (einzaehlen > 0) {
      const b = beatAusZeit(this.song, start);
      const schlag = Math.max(0.2, (zeitAusBeat(this.song, b) - zeitAusBeat(this.song, b - 1)) / this.speed);
      los = c + 0.12 + einzaehlen * schlag;
      this.zaehl = { ende: los, schlag, n: einzaehlen };
      if (this.einzaehlKlick) {
        for (let i = 0; i < einzaehlen; i++) {
          const k = this.e.klick(los - (einzaehlen - i) * schlag, i % 4 === 0, 1);
          if (k) this.zaehlKlicks.push(k);
        }
      }
      this.einzaehlBis = start;
    } else {
      this.zaehl = null;
      this.einzaehlBis = -Infinity;
    }
    this.startZeit = start;
    this.pos = start;
    this._letzte = start;
    this.geplantBis = start;
    this.naechsterKlick = Math.ceil(beatAusZeit(this.song, start) - 1e-6);
    this.basisPos = start;
    this.basisCtx = los;
    this.spielt = true;
    this.wartet = false;
    this.nachklang = true;
    this.mediumBeiStart(start, los);
    this.melde('zustand', 'play');
  }

  pause() {
    this._playMarke = (this._playMarke || 0) + 1;   // ein noch ausstehendes play() verfaellt
    if (!this.spielt) return;
    this.pos = Math.max(this.song.anfang, this.zeitJetzt());
    this.spielt = false;
    this.wartet = false;
    this.zaehl = null;
    this.einzaehlBis = -Infinity;
    this.zaehlKlickeStoppen();
    this.alleGeplantenStoppen();
    this.mediumStopp();
    this.melde('zustand', 'pause');
  }

  umschalten(opts) { if (this.spielt) this.pause(); else this.play(opts); }

  seek(t, { weiter = true } = {}) {
    t = Math.max(this.song.anfang, Math.min(t, this.song.ende));
    const lief = this.spielt;
    this.alleGeplantenStoppen();
    this.zaehlKlickeStoppen();
    this.zaehl = null;
    this.einzaehlBis = -Infinity;
    this.pos = t;
    this._letzte = t;
    this.startZeit = t;
    this.geplantBis = t;
    this.naechsterKlick = Math.ceil(beatAusZeit(this.song, t) - 1e-6);
    this.wartet = false;
    this.mediumStopp();
    if (lief && weiter) {
      const los = this.jetztCtx + 0.04;
      this.basisPos = t;
      this.basisCtx = los;
      this.nachklang = true;
      this.mediumBeiStart(t, los);
    } else {
      this.spielt = false;
      if (this.medium) { try { this.medium.el.currentTime = Math.max(0, t + this.spurVersatz); } catch { /* egal */ } }
    }
    this.melde('zustand', 'seek');
  }

  // Andere Noten (Fassung, Stimmen, Transposition) bei laufender Uhr: nur das Klavier neu planen, die Aufnahme laeuft durch
  neuPlanen() {
    this.alleGeplantenStoppen();
    if (!this.spielt || this.wartet) return;
    const t = this.zeitJetzt();
    this.startZeit = t;
    this.geplantBis = t;
    this.nachklang = true;
  }

  setSpeed(s) {
    s = Math.max(0.1, Math.min(2, s));
    const alt = this.speed;
    if (alt === s) return;
    const lief = this.spielt && !this.wartet;
    if (lief) {
      // Uhr bei der aktuellen Stelle neu ansetzen (auch waehrend sie noch steht)
      const c = this.jetztCtx;
      if (c >= this.basisCtx) this.rebase(this.zeitJetzt(), c);
    }
    this.speed = s;
    // Kleine Schritte lassen alles weiterklingen; bei grossen Spruengen die noch nicht erklungenen Noten neu planen.
    if (lief && Math.abs(s - alt) > 0.15) {
      const c = this.jetztCtx;
      this.geplant = this.geplant.filter((g) => {
        if (g.wann <= c + 0.005) return true;
        try { g.stimme.src.stop(c); } catch { /* egal */ }
        return false;
      });
      if (this.ausgabe) this.ausgabeStopp?.();
      this.geplantBis = Math.max(this.zeitJetzt(), this.startZeit);
    }
    // Aufnahme: Wechsel zwischen Puffer (100 %) und Element (anderes Tempo)
    if (this.medium) {
      this.medium.el.playbackRate = s;
      if (lief) {
        const warPuffer = !!this.pufferQuelle;
        if (warPuffer !== this.pufferModus() || (!warPuffer && !this.medStart)) this.mediumNeu();
      }
    }
    this.melde('zustand', 'tempo');
  }

  setLoop(a, b, aktiv = true) {
    if (b < a) [a, b] = [b, a];
    this.loop = { a: Math.max(this.song.anfang, a), b: Math.min(this.song.ende, Math.max(b, a + 0.5)), aktiv };
    this.melde('zustand', 'loop');
  }

  loopAus() { this.loop.aktiv = false; this.melde('zustand', 'loop'); }

  // aus einem 'loop'-Zuhoerer heraus: nach diesem Durchgang nicht wieder von vorn beginnen
  loopStoppen() { this._loopStopp = true; }

  // --------------------------------------------------------------------------- Aufnahme
  setMedium(m) {
    if (this.medium && this.medium !== m) {
      this.mediumStopp();
      this.medium.gain.gain.setTargetAtTime(0, this.jetztCtx, 0.03);
      this.medium.pufferFrei?.();
    }
    this.medium = m;
    if (!m) return;
    m.el.playbackRate = this.speed;
    m.gain.gain.cancelScheduledValues(this.jetztCtx);
    m.gain.gain.setTargetAtTime(this.mediumPegel, this.jetztCtx, 0.03);
    if (this.spielt && !this.wartet) this.mediumNeu();
    else { try { m.el.currentTime = Math.max(0, this.pos + this.spurVersatz); } catch { /* egal */ } }
  }

  setMediumPegel(v) {
    this.mediumPegel = v;
    if (this.medium && !this.medStart) this.medium.gain.gain.setTargetAtTime(v, this.jetztCtx, 0.03);
  }

  setSpurVersatz(s) {
    this.spurVersatz = s || 0;
    this.mediumNeu();
  }

  pufferModus() { return !!(this.medium && this.medium.puffer && Math.abs(this.speed - 1) < 0.001); }

  // Aufnahme anhalten (Puffer stoppen, Element pausieren), Pegel wieder herstellen
  mediumStopp() {
    if (this.pufferQuelle) { try { this.pufferQuelle.stop(); } catch { /* egal */ } this.pufferQuelle = null; }
    const m = this.medium;
    if (!m) return;
    if (!m.el.paused) { try { m.el.pause(); } catch { /* egal */ } }
    if (this.medStart) {
      m.gain.gain.cancelScheduledValues(this.jetztCtx);
      m.gain.gain.setValueAtTime(this.mediumPegel, this.jetztCtx);
    }
    this.medStart = null;
    this.anlauf = 0;
    this._einsatz = null;
  }

  // Start (oder Neustart nach Sprung): Uhr laeuft ab "los" an Songzeit t
  mediumBeiStart(t, los) {
    const m = this.medium;
    if (!m) return;
    if (this.pufferModus()) { this.pufferStarten(t, los); return; }
    const soll = t + this.spurVersatz;
    if (soll < 0) return;                              // Vorspiel: die Aufnahme setzt bei 0:00 ein (siehe pflegen)
    // stiller Vorlauf: die Aufnahme laeuft leise kurz vor der Stelle los, die Uhr wartet, bis sie dort ist
    const el = m.el;
    const vor = 0.25;
    try { el.currentTime = Math.max(0, soll - vor * this.speed); } catch { /* egal */ }
    m.gain.gain.cancelScheduledValues(this.jetztCtx);
    m.gain.gain.setValueAtTime(0, this.jetztCtx);
    this.medStart = { ziel: soll, seit: this.jetztCtx, gestartet: 0 };
    const warten = Math.max(0, (los - vor / 1 - this.anlaufZeit - this.jetztCtx) * 1000);
    clearTimeout(this._startTimer);
    this._startTimer = setTimeout(() => {
      if (!this.medStart || this.medium !== m) return;
      this.medStart.gestartet = this.jetztCtx;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    }, warten);
  }

  // Aufnahme neu ansetzen (Spur-, Tempo-, Versatzwechsel): steht die Uhr noch (Einzaehlen), wie beim Start
  mediumNeu() {
    if (!this.medium || !this.spielt || this.wartet) return;
    this.mediumStopp();
    if (this.jetztCtx < this.basisCtx) this.mediumBeiStart(this.basisPos, this.basisCtx);
    else this.mediumLaufendStarten(this.zeitJetzt());
  }

  // Aufnahme zu einer laufenden Uhr dazuschalten (Tempowechsel, Spurwechsel, Feinabgleich)
  mediumLaufendStarten(t) {
    const m = this.medium;
    if (!m) return;
    if (this.pufferModus()) {
      // laufende Uhr: Songzeit genau zum Startzeitpunkt der Quelle
      const los = Math.max(this.jetztCtx + 0.03, this.basisCtx);
      this.pufferStarten(this.basisPos + Math.max(0, los - this.basisCtx) * this.speed, los);
      return;
    }
    const soll = t + this.spurVersatz;
    if (soll < 0) return;
    try { m.el.currentTime = soll + this.anlaufZeit * this.speed; } catch { /* egal */ }
    this.anlauf = this.jetztCtx;
    const p = m.el.play();
    if (p && p.catch) p.catch(() => {});
  }

  // Puffer-Modus (100 %): Aufnahme auf der Audio-Uhr, die Songzeit t erklingt zur ctx-Zeit "los"
  pufferStarten(t, los) {
    const m = this.medium, c = this.jetztCtx;
    if (this.pufferQuelle) { try { this.pufferQuelle.stop(); } catch { /* egal */ } this.pufferQuelle = null; }
    const soll = t + this.spurVersatz;                 // Stelle in der Aufnahme
    if (soll >= m.puffer.duration - 0.02) return;      // hinter dem Ende der Aufnahme
    const src = this.e.ctx.createBufferSource();
    src.buffer = m.puffer;
    src.connect(m.gain);
    m.gain.gain.cancelScheduledValues(c);
    m.gain.gain.setValueAtTime(this.mediumPegel, c);
    if (soll >= 0) src.start(Math.max(c, los), soll + Math.max(0, c - los) * this.speed);
    else src.start(Math.max(c, los + (-soll) / this.speed), 0);
    this.pufferQuelle = src;
    src.onended = () => { if (this.pufferQuelle === src) this.pufferQuelle = null; };
  }

  // Element-Modus pflegen: Start abwarten, Vorspiel -> Einsatz bei 0:00, grobe Abweichungen nachspulen
  elementPflegen(c) {
    const m = this.medium, el = m.el, v = this.spurVersatz;
    const ms = this.medStart;
    if (ms) {
      const da = ms.gestartet && !el.paused && el.readyState >= 2 && el.currentTime >= ms.ziel - 0.02;
      if (da) {
        if (c < this.basisCtx) return;               // Aufnahme ist frueh dran (Einzaehlen laeuft noch): still weiterlaufen
        const ist = el.currentTime - v;               // hier ist die Aufnahme gerade
        // Anlaufzeit lernen (fuer den naechsten Start)
        const gemessen = c - ms.gestartet - 0.25;
        if (gemessen > 0 && gemessen < 1) this.anlaufZeit = Math.max(0.03, Math.min(0.6, this.anlaufZeit * 0.6 + gemessen * 0.4));
        if (ist - this.basisPos > 0.03) { this.basisPos = ist; this.geplantBis = Math.max(this.geplantBis, ist); }
        this.basisCtx = c;
        m.gain.gain.cancelScheduledValues(c);
        m.gain.gain.setValueAtTime(0, c);
        m.gain.gain.linearRampToValueAtTime(this.mediumPegel, c + 0.012);
        this.medStart = null;
        this.korrigiert = c;
        this.ema = 0;
      } else if (c >= this.basisCtx) {
        this.basisCtx = c;                            // Aufnahme noch nicht so weit: Uhr festhalten
        if (c - ms.seit > 3) {                        // laeuft nicht an (z. B. gesperrt) – ohne sie weiter
          this.medStart = null;
          m.gain.gain.cancelScheduledValues(c);
          m.gain.gain.setValueAtTime(this.mediumPegel, c);
        }
      }
      return;
    }
    if (c < this.basisCtx) return;
    const t = this.zeitJetzt();
    const soll = t + v;
    const dauer = isFinite(el.duration) ? el.duration : Infinity;
    if (soll < 0) {
      // Vorspiel: kurz vor 0:00 anlaufen lassen, damit die Aufnahme puenktlich einsetzt
      if (!el.paused && el.currentTime > 0.3) { try { el.pause(); el.currentTime = 0; } catch { /* egal */ } }
      if (el.paused && soll > -(this.anlaufZeit + 0.03) * this.speed && !this.anlauf) {
        try { el.currentTime = 0; } catch { /* egal */ }
        this.anlauf = c;
        this._einsatz = { seit: c };
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
      }
      this.anlaufLernen(c, el);
      return;
    }
    if (soll >= dauer - 0.15) return;
    if (el.paused) {
      if (!this.anlauf || c - this.anlauf > 2) this.mediumLaufendStarten(t);
      return;
    }
    this.anlaufLernen(c, el);
    if (this.anlauf) this.anlauf = 0;
    if (el.seeking || el.readyState < 3) return;
    const d = el.currentTime - soll;                  // > 0: Aufnahme voraus
    if (this._einsatz && this._einsatz.fertig) {
      // Einsatz nach dem Vorspiel: einen Rest-Versatz einmal gleich ausgleichen (das Klavier rueckt nach)
      this._einsatz = null;
      if (Math.abs(d) > 0.025 && Math.abs(d) < 0.3) { this.basisPos += d; this.ema = 0; return; }
    }
    if (Math.abs(d) > 0.18 && c - this.korrigiert > 1.5) {
      // grob daneben (Nachladen, Sprung): Aufnahme an die Uhr spulen – das Klavier bleibt im Takt
      try { el.currentTime = soll + 0.08 * this.speed; } catch { /* egal */ }
      this.korrigiert = c;
      this.ema = 0;
      return;
    }
    // kleine Abweichung: geglaettet und sanft ausgleichen (Klavier folgt der Aufnahme)
    this.ema = this.ema * 0.9 + d * 0.1;
    if (Math.abs(this.ema) > 0.012 && Math.abs(d) < 0.18) this.basisPos += this.ema * 0.03;
  }

  // Anlaufzeit des Audio-Elements messen: wann lief es nach play() wirklich los?
  anlaufLernen(c, el) {
    const e = this._einsatz;
    if (!e || e.fertig || el.paused || el.currentTime < 0.02) return;
    const losGelaufen = c - el.currentTime / this.speed;
    const gemessen = losGelaufen - e.seit;
    if (gemessen > -0.05 && gemessen < 1) this.anlaufZeit = Math.max(0.02, Math.min(0.6, this.anlaufZeit * 0.5 + Math.max(0, gemessen) * 0.5));
    e.fertig = true;
  }

  // --------------------------------------------------------------------------- Warte-Modus
  setHalt(t) { this.halteBei = t; }
  freigeben() {
    if (!this.wartet) { this.halteBei = null; return; }
    this.halteBei = null;
    this.wartet = false;
    const los = this.jetztCtx + 0.03;
    this.basisPos = this.pos;
    this.basisCtx = los;
    this.mediumBeiStart(this.pos, los);
  }

  // --------------------------------------------------------------------------- pro Bild (und beim Planen) aufrufen
  pflegen() {
    if (!this.spielt || this.wartet) return;
    const c = this.jetztCtx;
    if (this.zaehl && c >= this.zaehl.ende) { this.zaehl = null; this.einzaehlBis = -Infinity; this.zaehlKlicks = []; }
    if (!this.medium) return;
    // Puffer-Modus (100 %, fertig dekodiert): laeuft die Quelle nicht, stichgenau ansetzen – auch wenn eben noch
    // das Audio-Element einsprang oder gerade anlief
    if (!this.pufferQuelle && this.pufferModus()) {
      if (this.medStart || !this.medium.el.paused) this.mediumStopp();
      const los = Math.max(c + 0.03, this.basisCtx);
      const t = this.basisPos + (los - this.basisCtx) * this.speed;
      if (t + this.spurVersatz < this.medium.puffer.duration - 0.1) this.pufferStarten(t, los);
      return;
    }
    if (!this.pufferQuelle && !this.pufferModus()) this.elementPflegen(c);
  }

  update() {
    if (!this.spielt) return this.pos;
    this.planen();
    if (!this.spielt) return this.pos;
    let t = this.zeitJetzt();
    if (this.halteBei != null && t >= this.halteBei) {
      t = this.halteBei;
      if (!this.wartet) {
        this.wartet = true;
        this.pos = t;
        this.mediumStopp();
      }
    }
    this.pos = t;
    const gekreuzt = (this._letzte ?? -Infinity) < this.loop.b;   // wirklich ueber das Schleifenende gespielt?
    this._letzte = t;
    if (this.loop.aktiv && t >= this.loop.b && !gekreuzt) {
      // hinter die Schleife gesprungen: still an den Anfang, das ist kein Durchgang
      this.seek(this.loop.a);
      return this.pos;
    }
    if (this.loop.aktiv && t >= this.loop.b) {
      this._loopStopp = false;
      this.melde('loop');
      if (this._loopStopp) {
        this.pause();
        this.pos = this.loop.a;
        return this.pos;
      }
      if (this.loopEinzaehlen > 0) {
        this.pause();
        this.pos = this.loop.a;
        this.play({ einzaehlen: this.loopEinzaehlen });
      } else this.seek(this.loop.a);
      return this.pos;
    }
    if (t >= this.song.ende) {
      this.pause();
      this.pos = this.song.ende;
      this.melde('ende');
    }
    return this.pos;
  }

  // --------------------------------------------------------------------------- Planung (alle 25 ms)
  planen() {
    this.pflegen();
    if (!this.spielt || this.wartet || this.medStart) return;
    const c = this.jetztCtx;
    const jetzt = this.zeitJetzt();
    let horizont = jetzt + 0.32 * this.speed;
    if (this.loop.aktiv) horizont = Math.min(horizont, this.loop.b);
    if (this.halteBei != null) horizont = Math.min(horizont, this.halteBei - 1e-4);
    const zumPiano = this.ausgabe && this.klangZiel !== 'app';
    const spielen = (n, wann, dauer, v) => {
      if (!zumPiano || this.klangZiel === 'beide') {
        const st = this.e.sampler.spiele(n.p, v, wann, dauer);
        this.geplant.push({ stimme: st, n, wann });
      }
      if (zumPiano) this.ausgabe(n.p, v, this.ctxZuMs(wann), dauer * 1000);
    };
    // Toene, die an der Startstelle noch klingen (mitten im Ton angehalten oder gesprungen): mit anschlagen
    if (this.nachklang) {
      this.nachklang = false;
      const s = this.startZeit, noten = this.song.alleNoten;
      let lo = 0, hi = noten.length;
      while (lo < hi) { const mi = (lo + hi) >> 1; if (noten[mi].t < s - 0.005) lo = mi + 1; else hi = mi; }
      const wann = Math.max(c + 0.005, this.ctxFuer(s));
      for (let i = lo - 1; i >= 0 && noten[i].t > s - 12; i--) {
        const n = noten[i];
        if (n.tr - s < 0.15 || n.t >= this.stummAb || !this.filter(n)) continue;
        spielen(n, wann, (n.tr - s) / this.speed, Math.round(this.anschlag(n) * 0.78));
      }
    }
    const von = Math.max(this.geplantBis, this.startZeit);
    if (horizont > von) {
      const noten = this.song.alleNoten;
      let lo = 0, hi = noten.length;
      while (lo < hi) { const mi = (lo + hi) >> 1; if (noten[mi].t < von) lo = mi + 1; else hi = mi; }
      for (let i = lo; i < noten.length && noten[i].t < horizont; i++) {
        const n = noten[i];
        if (n.t >= this.stummAb || !this.filter(n)) continue;
        const wann = this.ctxFuer(n.t);
        if (wann < c - 0.02) continue;              // verpasst (z. B. nach einer Korrektur): nicht verspaetet nachholen
        spielen(n, Math.max(wann, c), (n.tr - n.t) / this.speed, this.anschlag(n));
      }
      this.geplantBis = horizont;
    }
    // Metronom auf den echten Schlaegen der Aufnahme
    const hb = beatAusZeit(this.song, horizont);
    while (this.naechsterKlick <= hb) {
      const k = this.naechsterKlick;
      const tk = zeitAusBeat(this.song, k);
      if (tk >= jetzt - 0.05 && this.metronom) this.e.klick(this.ctxFuer(tk), ((k % 4) + 4) % 4 === 0, this.metronomPegel);
      this.naechsterKlick++;
    }
    if (this.geplant.length > 400) this.geplant = this.geplant.filter((g) => g.wann > c - 10);
  }

  // AudioContext-Zeit -> performance.now()-Millisekunden (fuer Web-MIDI-Zeitstempel)
  ctxZuMs(wann) {
    const ts = this.e.ctx.getOutputTimestamp ? this.e.ctx.getOutputTimestamp() : null;
    if (ts && ts.performanceTime) return ts.performanceTime + (wann - ts.contextTime) * 1000;
    const latenz = (this.e.ctx.outputLatency || this.e.ctx.baseLatency || 0) * 1000;
    return performance.now() + (wann - this.e.ctx.currentTime) * 1000 + latenz;
  }

  zaehlKlickeStoppen() {
    const c = this.jetztCtx;
    for (const k of this.zaehlKlicks) { try { k.stop(c); } catch { /* egal */ } }
    this.zaehlKlicks = [];
  }

  alleGeplantenStoppen() {
    this.ausgabeStopp?.();
    const c = this.jetztCtx;
    for (const g of this.geplant) {
      if (g.wann > c + 0.005) {
        try { g.stimme.src.stop(c); } catch { /* egal */ }
      } else this.e.sampler.stoppe(g.stimme, c, 0.06);
    }
    this.geplant = [];
  }

  zerstoeren() { clearInterval(this._takt); clearTimeout(this._startTimer); }
}
