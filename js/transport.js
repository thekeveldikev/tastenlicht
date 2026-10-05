// Transport: Master-Uhr, Tempo, Schleife, Einzaehler, Metronom, Notenplanung, Warte-Halt.
// iPad-Fassung: Kopie der Desktop-Uhr; etwas mehr Vorlauf beim Planen (iOS-Zeitgeber schwanken staerker).
import { zeitAusBeat, beatAusZeit } from './song.js';

export class Transport {
  constructor(engine, song) {
    this.e = engine;
    this.song = song;
    this.pos = 0;                  // Songzeit in Sekunden (Zeitachse der Aufnahme)
    this.speed = 1;
    this.spielt = false;
    this.basisPos = 0;
    this.basisCtx = 0;
    this.loop = { a: 0, b: song.ende, aktiv: false };
    this.filter = () => true;      // welche Noten der Computer spielt
    this.anschlag = (n) => n.v;    // Anschlagsstaerke (fuer Lautstaerke je Ebene)
    this.geplantBis = 0;
    this.geplant = [];             // {stimme, n}
    this.medium = null;            // aktive Originalspur {el, gain}
    this.mediumPegel = 0.9;
    this.metronom = false;
    this.metronomPegel = 0.8;
    this.einzaehlBis = -Infinity;  // Songzeit, bis zu der eingezaehlt wird
    this.startZeit = 0;            // Ende des Einzaehlens
    this.naechsterKlick = 0;       // Schlagindex
    this.halteBei = null;          // Warte-Modus: hier anhalten
    this.wartet = false;
    this.hoerer = { loop: new Set(), ende: new Set(), zustand: new Set() };
    this.verstimmungCent = 0;
    this.loopEinzaehlen = 0;       // Schlaege Einzaehlen vor jeder Wiederholung (Uebeweg)
    this.klangZiel = 'app';        // 'app' | 'midi' (E-Piano) | 'beide'
    this.ausgabe = null;           // (p, v, zeitMs, dauerMs) -> Note an das E-Piano
    this.ausgabeStopp = null;
    this._takt = setInterval(() => this.planen(), 25);
  }

  on(art, fn) { this.hoerer[art].add(fn); return () => this.hoerer[art].delete(fn); }
  melde(art, ...a) { for (const f of this.hoerer[art]) f(...a); }

  get jetztCtx() { return this.e.ctx.currentTime; }

  zeitJetzt() {
    if (!this.spielt || this.wartet) return this.pos;
    return this.basisPos + (this.jetztCtx - this.basisCtx) * this.speed;
  }

  rebase(pos = this.zeitJetzt()) { this.basisPos = pos; this.basisCtx = this.jetztCtx; this.pos = pos; }

  // --------------------------------------------------------------------------- Steuerung
  async play({ einzaehlen = 0 } = {}) {
    if (this.spielt) return;
    const marke = (this._playMarke = (this._playMarke || 0) + 1);
    await this.e.aufwecken();
    // waehrend des Aufweckens pausiert/gesprungen oder doppelt gestartet? Dann nicht mehr losspielen
    if (this.spielt || marke !== this._playMarke) return;
    let start = this.pos;
    if (start >= this.song.ende - 0.05) start = this.loop.aktiv ? this.loop.a : this.song.anfang;
    if (this.loop.aktiv && (start < this.loop.a - 0.01 || start >= this.loop.b)) start = this.loop.a;
    this.startZeit = start;
    let vor = start;
    if (einzaehlen > 0) {
      const b = beatAusZeit(this.song, start);
      vor = zeitAusBeat(this.song, b - einzaehlen);
      this.einzaehlBis = start;
      this.naechsterKlick = Math.ceil(b - einzaehlen - 1e-6);
    } else {
      this.einzaehlBis = -Infinity;
      this.naechsterKlick = Math.ceil(beatAusZeit(this.song, start) - 1e-6);
    }
    this.spielt = true;
    this.wartet = false;
    this.rebase(vor);
    this._letzte = vor;
    this.geplantBis = start;
    if (this.medium && einzaehlen <= 0 && start >= 0) this.mediumStarten(start);
    this.melde('zustand', 'play');
  }

  pause() {
    this._playMarke = (this._playMarke || 0) + 1;   // ein noch ausstehendes play() verfaellt
    if (!this.spielt) return;
    this.pos = Math.max(this.startZeit, this.zeitJetzt());
    if (this.pos < this.song.anfang) this.pos = this.song.anfang;
    this.spielt = false;
    this.wartet = false;
    this.alleGeplantenStoppen();
    if (this.medium) this.medium.el.pause();
    this.melde('zustand', 'pause');
  }

  umschalten(opts) { if (this.spielt) this.pause(); else this.play(opts); }

  seek(t, { weiter = true } = {}) {
    t = Math.max(this.song.anfang, Math.min(t, this.song.ende));
    const lief = this.spielt;
    this.alleGeplantenStoppen();
    this.pos = t;
    this._letzte = t;
    this.startZeit = t;
    this.einzaehlBis = -Infinity;
    this.geplantBis = t;
    this.naechsterKlick = Math.ceil(beatAusZeit(this.song, t) - 1e-6);
    this.wartet = false;
    if (lief && weiter) {
      this.rebase(t);
      if (this.medium) {
        if (t >= 0) this.mediumStarten(t);
        else { this.medium.el.pause(); this.medium.el.currentTime = 0; }
      }
    } else {
      this.spielt = false;
      if (this.medium) { this.medium.el.pause(); this.medium.el.currentTime = Math.max(0, t); }
    }
    this.melde('zustand', 'seek');
  }

  setSpeed(s) {
    s = Math.max(0.1, Math.min(2, s));
    const alt = this.speed;
    if (this.spielt) this.rebase();
    this.speed = s;
    if (this.medium) this.medium.el.playbackRate = s;
    // Kleine Schritte (Tempo-Regler, Tempoleiter) lassen alles weiterklingen – vorher wurde bei jedem Pixel
    // jeder Ton abgeschnitten. Nur bei grossen Spruengen die noch nicht erklungenen Noten neu planen.
    if (this.spielt && Math.abs(s - alt) > 0.15) {
      const c = this.jetztCtx;
      this.geplant = this.geplant.filter((g) => {
        if (g.wann <= c + 0.005) return true;
        try { g.stimme.src.stop(c); } catch { /* egal */ }
        return false;
      });
      if (this.ausgabe) this.ausgabeStopp?.();   // MIDI: schon verschickte Anschlaege lassen sich nur so zuruecknehmen
      this.geplantBis = Math.max(this.zeitJetzt(), this.startZeit);
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

  setMedium(m) {
    if (this.medium && this.medium !== m) { this.medium.el.pause(); this.medium.gain.gain.setTargetAtTime(0, this.jetztCtx, 0.03); }
    this.medium = m;
    if (m) {
      m.el.playbackRate = this.speed;
      m.gain.gain.setTargetAtTime(this.mediumPegel, this.jetztCtx, 0.03);
      if (this.spielt && this.zeitJetzt() >= this.startZeit) this.mediumStarten(this.zeitJetzt());
      else m.el.currentTime = Math.max(0, this.pos);
    }
  }

  setMediumPegel(v) { this.mediumPegel = v; if (this.medium) this.medium.gain.gain.setTargetAtTime(v, this.jetztCtx, 0.03); }

  mediumStarten(t) {
    const el = this.medium.el;
    el.playbackRate = this.speed;
    if (Math.abs(el.currentTime - t) > 0.02) el.currentTime = Math.max(0, t);
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
  }

  // --------------------------------------------------------------------------- Warte-Modus
  setHalt(t) { this.halteBei = t; }
  freigeben() {
    if (!this.wartet) { this.halteBei = null; return; }
    this.halteBei = null;
    this.wartet = false;
    this.rebase(this.pos);
    if (this.medium) this.mediumStarten(this.pos);
  }

  // --------------------------------------------------------------------------- pro Bild aufrufen
  update() {
    if (!this.spielt) return this.pos;
    let t = this.zeitJetzt();
    // Originalspur: Uhr sanft auf die Spur ziehen (Regelschleife)
    const m = this.medium;
    if (m && !this.wartet) {
      const dauer = isFinite(m.el.duration) ? m.el.duration : Infinity;
      if (m.el.paused && !m.el.error && t >= 0 && t >= this.startZeit - 0.001 && t < dauer - 0.2) {
        // nach dem Einzaehlen bzw. Vorspiel (Zeit vor 0:00) setzt die Originalspur ein
        this.einzaehlBis = -Infinity;
        this.mediumStarten(t);
      } else if (!m.el.paused && !m.el.seeking && m.el.readyState >= 3) {
        const d = m.el.currentTime - t;
        if (Math.abs(d) > 0.25) { this.basisPos += d; t += d; } else { this.basisPos += d * 0.06; t += d * 0.06; }
      }
    }
    if (this.halteBei != null && t >= this.halteBei) {
      t = this.halteBei;
      if (!this.wartet) {
        this.wartet = true;
        this.pos = t;
        if (m) m.el.pause();
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
        // ein Zuhoerer (Uebeweg: Station geschafft) moechte nach diesem Durchgang anhalten
        this.pause();
        this.pos = this.loop.a;
        return this.pos;
      }
      if (this.loopEinzaehlen > 0) {
        // ruhige Pause: zurueck an den Anfang und einen Takt einzaehlen
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
    if (!this.spielt || this.wartet) return;
    const jetzt = this.zeitJetzt();
    let horizont = jetzt + 0.32 * this.speed;
    if (this.loop.aktiv) horizont = Math.min(horizont, this.loop.b);
    if (this.halteBei != null) horizont = Math.min(horizont, this.halteBei - 1e-4);
    const von = Math.max(this.geplantBis, this.startZeit);
    if (horizont > von) {
      const noten = this.song.alleNoten;
      // binaere Suche nach der ersten Note ab "von"
      let lo = 0, hi = noten.length;
      while (lo < hi) { const mi = (lo + hi) >> 1; if (noten[mi].t < von) lo = mi + 1; else hi = mi; }
      for (let i = lo; i < noten.length && noten[i].t < horizont; i++) {
        const n = noten[i];
        if (!this.filter(n)) continue;              // Gesangslinie (Hand V) nur, wenn die Gesangsfuehrung an ist
        const wann = this.basisCtx + (n.t - this.basisPos) / this.speed;
        const dauer = (n.tr - n.t) / this.speed;
        const v = this.anschlag(n);
        const zumPiano = this.ausgabe && this.klangZiel !== 'app';
        if (!zumPiano || this.klangZiel === 'beide') {
          const st = this.e.sampler.spiele(n.p, v, wann, dauer);
          this.geplant.push({ stimme: st, n, wann });
        }
        if (zumPiano) this.ausgabe(n.p, v, this.ctxZuMs(wann), dauer * 1000);
      }
      this.geplantBis = horizont;
    }
    // Metronom und Einzaehler auf den echten Schlaegen der Aufnahme
    const hb = beatAusZeit(this.song, horizont);
    while (this.naechsterKlick <= hb) {
      const k = this.naechsterKlick;
      const tk = zeitAusBeat(this.song, k);
      if (tk >= jetzt - 0.05) {
        const imEinzaehlen = tk < this.einzaehlBis - 1e-4;
        if (imEinzaehlen || this.metronom) {
          const wann = this.basisCtx + (tk - this.basisPos) / this.speed;
          this.e.klick(wann, ((k % 4) + 4) % 4 === 0, imEinzaehlen ? 1 : this.metronomPegel);
        }
      }
      this.naechsterKlick++;
    }
    // aufraeumen
    const c = this.jetztCtx;
    if (this.geplant.length > 400) this.geplant = this.geplant.filter((g) => g.wann > c - 10);
  }

  // AudioContext-Zeit -> performance.now()-Millisekunden (fuer Web-MIDI-Zeitstempel): wann der App-Klang
  // tatsaechlich aus dem Lautsprecher kommt. getOutputTimestamp enthaelt die Ausgabelatenz schon –
  // nur im Ersatzweg wird sie dazugerechnet (vorher doppelt: das E-Piano kam ~60 ms zu spaet).
  ctxZuMs(wann) {
    const ts = this.e.ctx.getOutputTimestamp ? this.e.ctx.getOutputTimestamp() : null;
    if (ts && ts.performanceTime) return ts.performanceTime + (wann - ts.contextTime) * 1000;
    const latenz = (this.e.ctx.outputLatency || this.e.ctx.baseLatency || 0) * 1000;
    return performance.now() + (wann - this.e.ctx.currentTime) * 1000 + latenz;
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

  zerstoeren() { clearInterval(this._takt); }
}
