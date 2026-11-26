// Klangmaschine (iPad-Fassung): Sampler (Klavier-Samples, 3 Anschlagsstufen), Hall, Metronom, Originalspuren.
// iOS: Ton erst nach einer Beruehrung (aufwecken), Audio-Session "playback" (hoerbar auch im Stummmodus, iOS 17+).

export function audioSitzung(art = 'playback') {
  try { if (navigator.audioSession) navigator.audioSession.type = art; } catch { /* aeltere iOS-Versionen */ }
}

export class AudioEngine {
  constructor() {
    audioSitzung('playback');
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -6; this.limiter.knee.value = 6; this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.004; this.limiter.release.value = 0.2;
    this.master = c.createGain();
    this.master.connect(this.limiter).connect(c.destination);

    this.klavierBus = c.createGain();
    this.hallSend = c.createGain();
    this.hall = c.createConvolver();
    this.hall.buffer = this.hallErzeugen(2.6);
    this.hallRueck = c.createGain();
    this.klavierBus.connect(this.master);
    this.klavierBus.connect(this.hallSend).connect(this.hall).connect(this.hallRueck).connect(this.master);
    this.hallSend.gain.value = 0.25;

    this.spurBus = c.createGain(); this.spurBus.connect(this.master);
    this.klickBus = c.createGain(); this.klickBus.connect(this.master);
    this.effektBus = c.createGain(); this.effektBus.connect(this.master);

    this.sampler = new Sampler(this);
    this.medien = new Map();
  }

  get jetzt() { return this.ctx.currentTime; }

  // muss aus einer Beruehrung heraus aufgerufen werden (iOS); "interrupted" nach Anruf/Siri ebenso
  async aufwecken() {
    audioSitzung('playback');
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch { /* egal */ } }
    if (!this._entsperrt) {
      // ein stiller Ton entsperrt die Ausgabe auf aelteren iPads endgueltig
      try { const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); this._entsperrt = true; } catch { /* egal */ }
    }
  }

  hallErzeugen(sek) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * sek);
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let k = 0; k < 2; k++) {
      const d = buf.getChannelData(k);
      let tief = 0;
      for (let i = 0; i < n; i++) {
        const t = i / c.sampleRate;
        // fruehe Reflexionen + dichter, nach oben dunkler werdender Nachhall
        const huelle = Math.pow(1 - i / n, 2.2) * Math.exp(-t * 1.6);
        const r = (Math.random() * 2 - 1);
        tief += (r - tief) * (0.18 + 0.5 * (1 - t / sek));
        d[i] = tief * huelle * (t < 0.012 ? t / 0.012 : 1);
      }
      for (const [ms, g] of [[11, 0.5], [17, 0.35], [23, 0.3], [31, 0.22], [43, 0.16]]) {
        const j = Math.floor((ms + k * 3) / 1000 * c.sampleRate);
        if (j < n) d[j] += g;
      }
    }
    return buf;
  }

  setHall(anteil) { this.hallSend.gain.setTargetAtTime(Math.max(0, Math.min(1, anteil)) * 0.55, this.jetzt, 0.05); }
  setPegel(bus, wert) {
    const ziel = { master: this.master, klavier: this.klavierBus, spur: this.spurBus, klick: this.klickBus, effekt: this.effektBus }[bus];
    if (ziel) ziel.gain.setTargetAtTime(Math.max(0, wert), this.jetzt, 0.03);
  }

  klick(wann, betont = false, lautstaerke = 1) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.value = betont ? 1760 : 1175;
    f.type = 'highpass'; f.frequency.value = 600;
    g.gain.setValueAtTime(0.0001, wann);
    g.gain.exponentialRampToValueAtTime((betont ? 0.55 : 0.35) * lautstaerke, wann + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, wann + 0.06);
    o.connect(f).connect(g).connect(this.klickBus);
    o.start(wann); o.stop(wann + 0.08);
    // zum Abbrechen (Einzaehlen gestoppt): stumm schalten statt stop() (zweimal stop() wirft in alten Safaris)
    return { stop: (t) => { try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); } catch { /* egal */ } } };
  }

  // Kurzer, heller Ton fuer Rueckmeldungen (richtig/falsch) – leise, abschaltbar
  signal(art = 'gut') {
    const c = this.ctx, w = this.jetzt + 0.01;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(art === 'gut' ? 1318.5 : 220, w);
    if (art !== 'gut') o.frequency.exponentialRampToValueAtTime(180, w + 0.15);
    g.gain.setValueAtTime(0.0001, w);
    g.gain.exponentialRampToValueAtTime(art === 'gut' ? 0.08 : 0.12, w + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, w + 0.18);
    o.connect(g).connect(this.effektBus);
    o.start(w); o.stop(w + 0.2);
  }

  // Originalspuren als <audio> mit tonhoehenerhaltendem Tempo. url ist eine blob:-Adresse (einmal geladen,
  // dann aus dem Speicher – kein staendiges Nachladen und Entschluesseln). Lautstaerke ueber WebAudio,
  // weil iOS el.volume ignoriert; klappt das nicht, laeuft das Element direkt.
  medium(name, url) {
    if (this.medien.has(name)) { const m = this.medien.get(name); m.pufferLaden(); return m; }
    const el = new Audio();
    el.preload = 'auto';
    el.preservesPitch = true;
    el.webkitPreservesPitch = true;
    el.setAttribute('playsinline', '');
    el.src = url;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    try { this.ctx.createMediaElementSource(el).connect(g).connect(this.spurBus); } catch (e) { console.warn('Spur ohne WebAudio', e); }
    const m = { name, el, gain: g, puffer: null, bereit: new Promise((ok) => { el.addEventListener('canplaythrough', ok, { once: true }); el.addEventListener('error', ok, { once: true }); }) };
    // Zusaetzlich als Puffer dekodieren (mono): bei 100 % Tempo laeuft die Aufnahme dann auf derselben Audio-Uhr
    // wie das Klavier – stichgenau. Bis der Puffer fertig ist (etwa 1 s), springt das Audio-Element ein.
    // Nur die gerade gewaehlte Aufnahme haelt ihren Puffer (Speicher auf dem iPad); beim Zurueckwechseln neu dekodieren.
    m._gen = 0;
    m.pufferLaden = () => {
      if (m.puffer || m._lade) return;
      const gen = ++m._gen;
      m._lade = (async () => {
        const roh = await (await fetch(url)).arrayBuffer();
        const ab = await new Promise((ok, f) => { const r = this.ctx.decodeAudioData(roh, ok, f); if (r && r.then) r.then(ok, f); });
        if (gen !== m._gen) return;
        if (ab.numberOfChannels === 1) { m.puffer = ab; return; }
        const mono = this.ctx.createBuffer(1, ab.length, ab.sampleRate);
        const z = mono.getChannelData(0), k = ab.numberOfChannels;
        for (let c = 0; c < k; c++) { const d = ab.getChannelData(c); for (let i = 0; i < d.length; i++) z[i] += d[i] / k; }
        if (gen === m._gen) m.puffer = mono;
      })().catch((e) => console.warn('Aufnahme nicht dekodierbar – nur Audio-Element', e)).finally(() => { if (gen === m._gen) m._lade = null; });
    };
    m.pufferFrei = () => { m._gen++; m._lade = null; m.puffer = null; };
    m.pufferLaden();
    this.medien.set(name, m);
    return m;
  }
}

// ---------------------------------------------------------------------------------------------- Sampler
export class Sampler {
  constructor(engine) {
    this.e = engine;
    this.puffer = new Map();       // "p_layer" -> AudioBuffer
    this.manifest = null;
    this.basis = '';
    this.verfuegbar = [];          // Tonhoehen mit Samples im Satz
    this.geladen = new Set();      // tatsaechlich geladene Tonhoehen
    this.stimmen = [];
    this.verstimmungCent = 0;
    this.modus = 'synth';          // 'samples' sobald geladen
    this.satzName = null;
    this.ladeAuftrag = 0;
  }

  // iPad: der ganze Satz (jede kleine Terz, A0–C8). Erst die mittlere Anschlagstufe fuer alle Toene – dann ist
  // das Klavier spielbereit (das Versprechen loest sich) –, danach leise und laut im Hintergrund.
  async ladeSatz(name = 'klavier', _bereich = null, fortschritt = () => {}) {
    const auftrag = ++this.ladeAuftrag;
    this.alleStoppen();
    if (name === 'synth') { this.modus = 'synth'; this.satzName = 'synth'; fortschritt(1); return true; }
    const basis = 'audio/klavier/';
    let manifest;
    try {
      const r = await fetch(basis + 'manifest.json');
      if (!r.ok) throw new Error(r.status);
      manifest = await r.json();
    } catch (e) {
      if (auftrag !== this.ladeAuftrag) return null;        // inzwischen anderer Klang gewaehlt: kein Fehler melden
      console.warn('Klaviersatz fehlt, Ersatzklang aktiv:', name, e);
      this.modus = 'synth'; this.satzName = 'synth';
      fortschritt(1);
      return false;
    }
    if (auftrag !== this.ladeAuftrag) return null;
    this.manifest = manifest; this.basis = basis; this.satzName = name;
    // je Ladeauftrag eigene Speicher: ein noch laufendes ladeTon des alten Satzes schreibt so nicht hinein
    const puffer = (this.puffer = new Map()), start = (this.start = new Map());
    this.geladen = new Set();
    this.verfuegbar = Object.keys(manifest.notes).map(Number).sort((a, b) => a - b);
    const stufen = manifest.layers.map((l) => String(l.id));
    const mitte = (this.mitte = stufen[Math.floor(stufen.length / 2)]);
    const liste = this.verfuegbar.map((p) => [p, mitte]);
    for (const s of stufen) if (s !== mitte) for (const p of this.verfuegbar) liste.push([p, s]);
    let i = 0, fertig = 0;
    const erste = this.verfuegbar.length;
    let bereitOk;
    const bereit = new Promise((ok) => { bereitOk = ok; });
    const arbeiter = async () => {
      while (i < liste.length) {
        if (auftrag !== this.ladeAuftrag) return;
        const [p, s] = liste[i++];
        await this.ladeEins(p, s, puffer, start, basis);
        fertig++;
        if (fertig <= erste) fortschritt(fertig / erste);
        if (fertig === erste) { this.modus = this.geladen.size ? 'samples' : 'synth'; bereitOk(this.modus === 'samples'); }
      }
    };
    Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]).then(() => { if (fertig < erste) bereitOk(this.geladen.size > 0); });
    const ok = await bereit;
    return auftrag === this.ladeAuftrag ? ok : null;
  }

  async ladeEins(p, stufe, puffer, start, basis) {
    const info = this.manifest?.notes[p]?.[stufe];
    if (!info) return;
    try {
      const r = await fetch(basis + info.file);
      if (!r.ok) throw new Error(r.status);
      const buf = await this.e.ctx.decodeAudioData(await r.arrayBuffer());
      // Anschlag selbst finden: MP3-Decoder setzen je nach Geraet unterschiedlich viel Stille davor
      const d = buf.getChannelData(0);
      let k = 0;
      while (k < d.length && Math.abs(d[k]) < 0.002) k++;
      start.set(`${p}_${stufe}`, Math.max(0, k / buf.sampleRate - 0.001));
      puffer.set(`${p}_${stufe}`, buf);
      this.geladen.add(p);
    } catch (e) { console.warn('Sample nicht ladbar', p, stufe, e); }
  }

  naechsterTon(p) {
    let best = null, bd = 1e9;
    for (const q of this.geladen) { const d = Math.abs(q - p); if (d < bd) { bd = d; best = q; } }
    return best;                                   // iPad: der ganze Satz wird geladen, kein Nachladen noetig
  }

  schicht(v) {
    const lay = this.manifest?.layers || [{ id: 1, velocity: 36 }, { id: 2, velocity: 72 }, { id: 3, velocity: 112 }];
    let best = lay[0];
    for (const l of lay) if (Math.abs(l.velocity - v) < Math.abs(best.velocity - v)) best = l;
    return best;
  }

  freigabeZeit(p) {
    const ungedaempft = this.manifest?.undamped_from;
    if (ungedaempft && p >= ungedaempft) return 1.6;     // oberste Toene haben keine Daempfer: klingen natuerlich aus
    const r = this.manifest?.release || { low: 0.35, mid: 0.22, high: 0.12 };
    return p < 48 ? r.low : p <= 83 ? r.mid : r.high;
  }

  // Spielt einen Ton. dauer = bis zum Loslassen (Sekunden) oder null (Loslassen spaeter per stoppe()).
  spiele(p, v, wann = this.e.jetzt, dauer = null, ziel = null) {
    const c = this.e.ctx;
    wann = Math.max(wann, c.currentTime);
    if (this.modus !== 'samples') return this.synth(p, v, wann, dauer, ziel);
    const sp = this.naechsterTon(p);
    if (sp == null) return this.synth(p, v, wann, dauer, ziel);
    let lay = this.schicht(v);
    let key = `${sp}_${lay.id}`;
    if (!this.puffer.has(key)) { key = `${sp}_${this.mitte}`; lay = (this.manifest.layers.find((l) => String(l.id) === this.mitte) || lay); }
    const buf = this.puffer.get(key);
    if (!buf) return this.synth(p, v, wann, dauer, ziel);
    const versatz = this.start.get(key) || 0;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.detune.value = (p - sp) * 100 + this.verstimmungCent;
    const g = c.createGain();
    const pegel = Math.min(1.6, Math.max(0.3, Math.pow(v / lay.velocity, 0.9))) * 0.9;
    g.gain.setValueAtTime(0, wann);
    g.gain.linearRampToValueAtTime(pegel, wann + 0.001);  // 1 ms Einblendung (Opus verschmiert den Anschlag minimal)
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-0.35, Math.min(0.35, (p - 64) / 90));
    src.connect(g).connect(pan).connect(ziel || this.e.klavierBus);
    src.start(wann, versatz);
    const stimme = { src, g, pegel, p, start: wann, ende: Infinity, tau: this.freigabeZeit(p) / 3 };
    if (dauer != null) this.stoppe(stimme, wann + Math.max(0.03, dauer));
    else src.stop(wann + buf.duration - versatz);
    src.onended = () => { const i = this.stimmen.indexOf(stimme); if (i >= 0) this.stimmen.splice(i, 1); };
    this.stimmen.push(stimme);
    if (this.stimmen.length > 80) this.stoppe(this.stimmen[0], c.currentTime, 0.03);   // iPad: etwas weniger Stimmen
    return stimme;
  }

  stoppe(stimme, wann = this.e.jetzt, tau = null) {
    if (!stimme || stimme.ende <= wann) return;
    stimme.ende = wann;
    const t = tau ?? stimme.tau;
    try {
      // Den Pegel halten, den die Huellkurve ZUM ZEITPUNKT wann hat. gain.value ist bei geplanten Noten noch der
      // Grundwert 1.0 (die Huellkurve startet erst spaeter) – das gab beim Ersatzklang einen lauten Knall.
      const g = stimme.g.gain;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(wann);
      else { g.cancelScheduledValues(wann); g.setValueAtTime(wann > this.e.ctx.currentTime + 0.01 ? stimme.pegel : g.value, wann); }
      g.setTargetAtTime(0, wann, t);
      stimme.src.stop(wann + t * 7 + 0.02);
    } catch { /* bereits gestoppt */ }
  }

  alleStoppen(weich = 0.04) {
    const jetzt = this.e.jetzt;
    for (const s of [...this.stimmen]) {
      try {
        if (s.g.gain.cancelAndHoldAtTime) s.g.gain.cancelAndHoldAtTime(jetzt); else s.g.gain.cancelScheduledValues(jetzt);
        s.g.gain.setTargetAtTime(0, jetzt, weich);
        s.src.stop(jetzt + weich * 6);
      } catch { /* egal */ }
    }
    this.stimmen = [];
  }

  // Ersatzklang (falls keine Samples): weiches additives Klavier
  synth(p, v, wann, dauer, ziel) {
    const c = this.e.ctx;
    const f = 440 * Math.pow(2, (p - 69 + this.verstimmungCent / 100) / 12);
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(16000, f * (3 + v / 20)), wann);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), wann + 1.5);
    const pegel = 0.12 * Math.pow(v / 100, 1.3);
    g.gain.setValueAtTime(0.0001, wann);
    g.gain.exponentialRampToValueAtTime(pegel, wann + 0.006);
    g.gain.setTargetAtTime(pegel * 0.35, wann + 0.01, 0.35);
    g.gain.setTargetAtTime(0.0001, wann + 0.4, p < 48 ? 2.5 : p < 72 ? 1.6 : 0.9);
    const oszis = [];
    for (const [mul, amp, typ] of [[1, 1, 'sine'], [2, 0.35, 'sine'], [3, 0.12, 'triangle'], [4.01, 0.06, 'sine']]) {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = typ; o.frequency.value = f * mul; og.gain.value = amp;
      o.connect(og).connect(lp);
      o.start(wann); o.stop(wann + 8);
      oszis.push(o);
    }
    lp.connect(g).connect(ziel || this.e.klavierBus);
    const stimme = { src: { stop: (t) => oszis.forEach((o) => { try { o.stop(t); } catch { /* egal */ } }) }, g, pegel, p, start: wann, ende: Infinity, tau: 0.08 };
    if (dauer != null) this.stoppe(stimme, wann + Math.max(0.03, dauer));
    this.stimmen.push(stimme);
    setTimeout(() => { const i = this.stimmen.indexOf(stimme); if (i >= 0) this.stimmen.splice(i, 1); }, (wann - c.currentTime + 9) * 1000);
    return stimme;
  }
}
