// Buehne: zeichnet fallende Noten, Klaviatur, Linien, Akkordspur und Effekte auf ein Canvas.
// iPad-Fassung: Leuchten (Bloom) ohne ctx.filter – Safari kennt kein Canvas-Filter –, stattdessen
// stufenweise verkleinert und wieder vergroessert (wirkt wie Weichzeichnen). Aufloesung begrenzbar (Sparmodus).
import { istSchwarz, notenName } from './notennamen.js';
import { glowSprite, kroneSprite, Partikel, Pulse, Sternenhimmel, auroraZeichnen, metallTextur, rgba, mische } from './effekte.js';

export const THEMEN = {
  nacht: { name: 'Nacht (wie Synthesia)', rh: ['#93dd3a', '#d9fb8f'], lh: ['#2c7fe0', '#7fc0ff'], bg: ['#0a0b0f', '#17191f'], linie: '#e3262e', nutzer: '#ffd27a' },
  bernstein: { name: 'Bernstein & Petrol', rh: ['#f2a91a', '#ffdc7a'], lh: ['#0f9e99', '#63dbd3'], bg: ['#0b0c0f', '#17191d'], linie: '#e0198a', nutzer: '#ffffff' },
  aurora: { name: 'Aurora', rh: ['#5fe8b8', '#d2fff0'], lh: ['#8d6bff', '#d6c8ff'], bg: ['#05060c', '#10132a'], linie: '#7c5cff', nutzer: '#fff3b0' },
  gold: { name: 'Gold & Elfenbein', rh: ['#eebd55', '#fff2c8'], lh: ['#c4803f', '#f2c894'], bg: ['#0c0a07', '#1b160f'], linie: '#c9a227', nutzer: '#ffffff' },
  rose: { name: 'Rosé & Nachtblau', rh: ['#ff7fa9', '#ffd3e2'], lh: ['#4f86ff', '#aec8ff'], bg: ['#090912', '#15152b'], linie: '#ff4d8d', nutzer: '#fff3b0' },
  mono: { name: 'Graphit (ruhig)', rh: ['#e6e6e6', '#ffffff'], lh: ['#8590a2', '#c6ccd8'], bg: ['#09090a', '#151516'], linie: '#9aa3b2', nutzer: '#ffd27a' },
};

const SCHRIFT = '-apple-system,"SF Pro Display","Helvetica Neue",system-ui,sans-serif';
// Lage der schwarzen Tasten relativ zur Grenze zweier weisser Tasten (Anteil einer weissen Taste)
const SCHWARZ_VERSATZ = { 1: -0.08, 3: 0.08, 6: -0.11, 8: 0, 10: 0.11 };

export class Buehne {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.glow = document.createElement('canvas');
    this.gctx = this.glow.getContext('2d');
    this.glow2 = document.createElement('canvas');
    this.g2ctx = this.glow2.getContext('2d');
    this.glow3 = document.createElement('canvas');
    this.g3ctx = this.glow3.getContext('2d');
    this.partikel = new Partikel(1100);
    this.pulse = new Pulse();
    this.sterne = new Sternenhimmel();
    this.bereich = { lo: 21, hi: 108 };
    this.thema = THEMEN.nacht;
    this.opt = {};
    this.letzteUhr = performance.now();
    this.aktivVorher = new Set();
    this.W = 0; this.H = 0; this.dpr = 1;
    this.reserve = 0;                 // Platz unten fuer die Steuerleiste (CSS-Pixel)
    this.statischGueltig = false;
  }

  setReserve(px) { px = Math.round(px); if (px !== this.reserve) { this.reserve = px; this.statischGueltig = false; } }

  setThema(name) { this.thema = THEMEN[name] || THEMEN.nacht; this.statischGueltig = false; }
  setOptionen(opt) {
    const neuBau = !this.opt || opt.tastaturHoehe !== this.opt.tastaturHoehe || opt.tastenNamen !== this.opt.tastenNamen || opt.notenSystem !== this.opt.notenSystem
      || opt.vorzeichen !== this.opt.vorzeichen || opt.tonika !== this.opt.tonika || opt.maxDpr !== this.opt.maxDpr;
    this.opt = opt;
    if (neuBau) this.statischGueltig = false;
  }

  setBereich(lo, hi) {
    while (istSchwarz(lo)) lo--;
    while (istSchwarz(hi)) hi++;
    if (lo !== this.bereich.lo || hi !== this.bereich.hi) { this.bereich = { lo, hi }; this.statischGueltig = false; }
  }

  groesse() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(this.opt.maxDpr || 2, window.devicePixelRatio || 1);
    const W = Math.round(r.width), H = Math.round(r.height);
    if (W === this.W && H === this.H && dpr === this.dpr && this.statischGueltig) return;
    this.W = W; this.H = H; this.dpr = dpr;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.glow.width = Math.ceil(W / 4); this.glow.height = Math.ceil(H / 4);
    this.glow2.width = Math.ceil(W / 8); this.glow2.height = Math.ceil(H / 8);
    this.glow3.width = Math.ceil(W / 16); this.glow3.height = Math.ceil(H / 16);
    this.layout();
    this.statischBauen();
    this.sterne.groesse(W, H);
  }

  // ---------------------------------------------------------------------------- Geometrie
  layout() {
    const { W, H } = this;
    const fak = this.opt.tastaturHoehe ?? 1;
    const nutzH = H - this.reserve;
    this.tastH = Math.round(Math.max(90, Math.min(240, nutzH * 0.2)) * fak);
    this.leisteH = Math.round(Math.max(10, nutzH * 0.022));
    this.hitY = nutzH - this.tastH - this.leisteH;
    const { lo, hi } = this.bereich;
    const weisse = [];
    for (let p = lo; p <= hi; p++) if (!istSchwarz(p)) weisse.push(p);
    this.ww = W / weisse.length;
    this.tasten = new Map();
    weisse.forEach((p, i) => this.tasten.set(p, { p, x: i * this.ww, w: this.ww, schwarz: false }));
    const bw = this.ww * 0.6;
    for (let p = lo; p <= hi; p++) {
      if (!istSchwarz(p)) continue;
      const rechts = this.tasten.get(p + 1);
      if (!rechts) continue;
      const mitte = rechts.x + SCHWARZ_VERSATZ[p % 12] * this.ww;
      this.tasten.set(p, { p, x: mitte - bw / 2, w: bw, schwarz: true });
    }
    this.schwarzH = Math.round(this.tastH * 0.63);
  }

  tasteMitte(p) {
    const k = this.tasten.get(p);
    if (k) return k.x + k.w / 2;
    // ausserhalb des Bereichs: extrapolieren
    const { lo, hi } = this.bereich;
    if (p < lo) return -this.ww;
    return this.W + (p - hi) * this.ww;
  }

  notenBreite(p) { return istSchwarz(p) ? this.ww * 0.5 : this.ww * 0.78; }

  // ---------------------------------------------------------------------------- statische Ebenen
  statischBauen() {
    const { W, H, dpr } = this;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const g = c.getContext('2d'); g.scale(dpr, dpr); return [c, g]; };
    // Hintergrund
    const [bg, bgc] = mk(W, H);
    const grad = bgc.createLinearGradient(0, 0, 0, this.hitY);
    grad.addColorStop(0, this.thema.bg[0]); grad.addColorStop(1, this.thema.bg[1]);
    bgc.fillStyle = grad; bgc.fillRect(0, 0, W, H);
    const vig = bgc.createRadialGradient(W / 2, this.hitY * 0.6, Math.min(W, H) * 0.2, W / 2, this.hitY * 0.6, Math.max(W, H) * 0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    bgc.fillStyle = vig; bgc.fillRect(0, 0, W, this.hitY);
    this.bgCanvas = bg;
    // Weisse Tasten
    const th = this.tastH;
    const [wc, wg] = mk(W, th);
    for (const k of this.tasten.values()) {
      if (k.schwarz) continue;
      const x = k.x + 0.5, w = k.w - 1.2, r = Math.min(6, w * 0.12);
      const g = wg.createLinearGradient(0, 0, 0, th);
      g.addColorStop(0, '#cfcfca'); g.addColorStop(0.06, '#f4f4f0'); g.addColorStop(0.85, '#fbfbf8'); g.addColorStop(1, '#e2e1db');
      wg.fillStyle = g;
      rundeUnten(wg, x, 0, w, th - 2, r); wg.fill();
      wg.fillStyle = 'rgba(0,0,0,0.10)'; wg.fillRect(x + w - 1.5, 0, 1.5, th - 6);
      wg.fillStyle = 'rgba(0,0,0,0.18)'; rundeUnten(wg, x, th - 7, w, 5, r); wg.fill();
      if (this.opt.tastenNamen && this.opt.tastenNamen !== 'aus' && (this.opt.tastenNamen === 'alle' || k.p % 12 === 0)) {
        const fs = Math.max(9, Math.min(15, k.w * 0.34));
        wg.font = `600 ${fs}px ${SCHRIFT}`; wg.textAlign = 'center'; wg.textBaseline = 'alphabetic';
        wg.fillStyle = k.p % 12 === 0 ? 'rgba(40,40,46,0.72)' : 'rgba(40,40,46,0.45)';
        const name = this.opt.tastenNamen === 'alle' ? notenName(k.p, this.opt.notenSystem || 'de', this.opt.vorzeichen || 'b', k.p % 12 === 0) : `C${Math.floor(k.p / 12) - 1}`;
        wg.fillText(name, x + w / 2, th - 12);
      }
    }
    this.weissCanvas = wc;
    // Schwarze Tasten (transparenter Hintergrund)
    const [sc, sg] = mk(W, th);
    const sh = this.schwarzH;
    for (const k of this.tasten.values()) {
      if (!k.schwarz) continue;
      // Schatten auf die weissen Tasten
      const sch = sg.createLinearGradient(k.x, 0, k.x + k.w + 6, 0);
      sch.addColorStop(0, 'rgba(0,0,0,0.0)'); sch.addColorStop(0.5, 'rgba(0,0,0,0.22)'); sch.addColorStop(1, 'rgba(0,0,0,0)');
      sg.fillStyle = sch; sg.fillRect(k.x - 2, 0, k.w + 8, sh + 6);
      const r = Math.min(4, k.w * 0.15);
      const korpus = sg.createLinearGradient(0, 0, 0, sh);
      korpus.addColorStop(0, '#050506'); korpus.addColorStop(1, '#1d1d21');
      sg.fillStyle = korpus; rundeUnten(sg, k.x, 0, k.w, sh, r); sg.fill();
      // Oberflaeche mit Glanz
      const ox = k.x + k.w * 0.12, ow = k.w * 0.76, oh = sh * 0.86;
      const ob = sg.createLinearGradient(0, 0, 0, oh);
      ob.addColorStop(0, '#26262a'); ob.addColorStop(0.75, '#141416'); ob.addColorStop(1, '#3a3a40');
      sg.fillStyle = ob; rundeUnten(sg, ox, 0, ow, oh, r * 0.8); sg.fill();
      const gl = sg.createLinearGradient(ox, 0, ox + ow, 0);
      gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.10)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      sg.fillStyle = gl; sg.fillRect(ox, 2, ow, oh * 0.7);
      if (this.opt.tastenNamen === 'alle') {
        const fs = Math.max(8, Math.min(12, k.w * 0.36));
        sg.font = `600 ${fs}px ${SCHRIFT}`; sg.textAlign = 'center';
        sg.fillStyle = 'rgba(255,255,255,0.55)';
        sg.fillText(notenName(k.p, this.opt.notenSystem || 'de', this.opt.vorzeichen || 'b'), k.x + k.w / 2, oh - 8);
      }
    }
    this.schwarzCanvas = sc;
    this.metall = metallTextur(Math.max(64, W), Math.max(8, this.leisteH + this.reserve));
    this.statischGueltig = true;
  }

  // ---------------------------------------------------------------------------- Projektion (flach / Perspektive)
  proj(x, u) {
    const p = this.opt.perspektive || 0;
    if (p <= 0.001) return [x, this.hitY - u * this.hitY, 1];
    const k = 1.7 * p, umax = this.umax;
    const s = 1 / (1 + k * u), smax = 1 / (1 + k * umax);
    const g = (1 - s) / (1 - smax);
    const oben = this.H * 0.06;
    return [this.W / 2 + (x - this.W / 2) * s, this.hitY - (this.hitY - oben) * g, s];
  }

  // ---------------------------------------------------------------------------- Bild zeichnen
  zeichnen(s) {
    this.groesse();
    const { ctx, W, H, dpr, hitY } = this;
    const jetzt = performance.now();
    const dt = Math.min(0.05, (jetzt - this.letzteUhr) / 1000);
    this.letzteUhr = jetzt;
    const o = this.opt;
    const fx = o.effekte || {};
    const p = o.perspektive || 0;
    this.umax = p > 0 ? 1 + 1.3 * p : 1;
    const sicht = Math.max(0.8, o.sichtSekunden || 3.5);
    const pps = hitY / sicht;                         // Pixel je Sekunde (flach)
    const t = s.t;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.bgCanvas, 0, 0, W, H);
    if (fx.aurora) auroraZeichnen(ctx, W, hitY, jetzt / 1000, [this.thema.rh[0], this.thema.lh[0], this.thema.linie], 1.2);
    if (fx.sterne) this.sterne.zeichnen(ctx, jetzt / 1000, t, hitY);

    const g = this.gctx;
    g.setTransform(0.25, 0, 0, 0.25, 0, 0);
    g.clearRect(0, 0, W, H);

    // Oktav-/Spurlinien
    if (o.oktavLinien !== false) {
      ctx.save();
      ctx.lineWidth = 1;
      for (const k of this.tasten.values()) {
        if (k.schwarz) continue;
        const pc = k.p % 12;
        if (pc !== 0 && pc !== 5) continue;
        ctx.strokeStyle = pc === 0 ? 'rgba(255,255,255,0.085)' : 'rgba(255,255,255,0.04)';
        const [x0, y0] = this.proj(k.x, 0), [x1, y1] = this.proj(k.x, this.umax);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.restore();
    }
    // Takt- und Schlaglinien, Taktzahlen, Akkordspur
    this.linienZeichnen(s, t, pps);

    // Noten
    const aktiv = new Set();
    const sichtEnde = t + sicht * this.umax + 0.2;
    const noten = s.noten;
    let lo = 0, hi = noten.length;
    const fruehester = t - 12;
    while (lo < hi) { const mi = (lo + hi) >> 1; if (noten[mi].t < fruehester) lo = mi + 1; else hi = mi; }
    const zuZeichnen = [];
    const geister = [];
    for (let i = lo; i < noten.length; i++) {
      const n = noten[i];
      if (n.t > sichtEnde) break;
      if (n.te < t - 0.02) continue;
      if (n.hand === 'V') { if (s.geisterSichtbar) geister.push(n); continue; }
      if (!s.sichtbar(n)) continue;
      zuZeichnen.push(n);
      if (n.t <= t + 0.005 && n.te > t) aktiv.add(n);
    }
    for (const n of geister) this.geistZeichnen(n, s, t, pps);
    // schwarze Tasten-Noten zuletzt, damit sie ueber weissen liegen
    zuZeichnen.sort((a, b) => (istSchwarz(a.p) - istSchwarz(b.p)) || (a.t - b.t));
    // Gedaechtnis-Stufen: Noten nur kurz vorher oder gar nicht zeigen (Tasten leuchten trotzdem)
    const verstecken = o.notenVerstecken || 'aus';
    const kurzFenster = 0.75 * Math.max(0.5, s.speed || 1);
    for (const n of zuZeichnen) {
      if (verstecken === 'ganz') continue;
      if (verstecken === 'kurz' && n.t - t > kurzFenster) continue;
      this.noteZeichnen(n, s, t, pps);
    }

    // Lichtsaum ueber der Klaviatur
    const saum = ctx.createLinearGradient(0, hitY - 40, 0, hitY);
    saum.addColorStop(0, 'rgba(255,255,255,0)'); saum.addColorStop(1, 'rgba(255,255,255,0.035)');
    ctx.fillStyle = saum; ctx.fillRect(0, hitY - 40, W, 40);

    // Klaviatur
    this.klaviaturZeichnen(s, aktiv, t);

    // Effekte am Aufprall
    this.aufprallZeichnen(s, aktiv, t, dt, fx);

    // Bloom
    const bloom = fx.bloom ?? 0.6;
    if (bloom > 0.01) {
      // Weichzeichnen ohne Filter: 1/4 -> 1/8 -> 1/16 der Groesse, dann weich auf volle Groesse ziehen
      const g2 = this.g2ctx, g3 = this.g3ctx;
      g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, this.glow2.width, this.glow2.height);
      g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'high';
      g2.drawImage(this.glow, 0, 0, this.glow2.width, this.glow2.height);
      g3.setTransform(1, 0, 0, 1, 0, 0); g3.clearRect(0, 0, this.glow3.width, this.glow3.height);
      g3.imageSmoothingEnabled = true; g3.imageSmoothingQuality = 'high';
      g3.drawImage(this.glow2, 0, 0, this.glow3.width, this.glow3.height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = Math.min(1, bloom) * 0.55;
      ctx.drawImage(this.glow2, 0, 0, W, H);
      ctx.globalAlpha = Math.min(1, bloom) * 0.8;
      ctx.drawImage(this.glow3, 0, 0, W, H);
      ctx.restore();
    }
    this.aktivVorher = aktiv;
    return aktiv;
  }

  linienZeichnen(s, t, pps) {
    const { ctx, W } = this;
    const o = this.opt;
    const sicht = o.sichtSekunden || 3.5;
    const tMax = t + sicht * this.umax;
    if (o.taktLinien !== false && s.takte) {
      ctx.save();
      ctx.font = `600 12px ${SCHRIFT}`;
      ctx.textBaseline = 'bottom';
      for (const tk of s.takte) {
        if (tk.te < t - 0.1 || tk.t > tMax) continue;
        // Schlaglinien
        if (o.schlagLinien) {
          for (let b = 1; b < 4; b++) {
            const tb = s.zeitAusBeat(tk.b + b);
            if (tb < t || tb > tMax) continue;
            const u = (tb - t) * pps / this.hitY;
            const [x0, y] = this.proj(0, u), [x1] = this.proj(W, u);
            ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
          }
        }
        if (tk.t < t) continue;
        const u = (tk.t - t) * pps / this.hitY;
        const [x0, y, sk] = this.proj(0, u), [x1] = this.proj(W, u);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.font = `600 ${Math.round(12 * Math.max(0.6, sk))}px ${SCHRIFT}`;
        ctx.fillText(tk.label || String(tk.nr), x0 + 8, y - 3);
      }
      ctx.restore();
    }
    if (o.akkordSpur !== false && s.akkorde) {
      ctx.save();
      ctx.textBaseline = 'middle';
      for (const a of s.akkorde) {
        if (a.te < t || a.t > tMax) continue;
        const u = Math.max(0, (a.t - t) * pps / this.hitY);
        const [x0, y, sk] = this.proj(0, u);
        const text = s.akkordText(a);
        const fs = Math.round(15 * Math.max(0.65, sk));
        ctx.font = `700 ${fs}px ${SCHRIFT}`;
        const bw = ctx.measureText(text).width + 14;
        const x = x0 + 34, yy = Math.min(this.hitY - fs, y - fs * 0.9);
        const aktiv = a.t <= t && a.te > t;
        ctx.fillStyle = aktiv ? rgba(this.thema.linie, 0.85) : 'rgba(18,20,26,0.75)';
        ctx.strokeStyle = aktiv ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        rundRect(ctx, x, yy - fs * 0.75, bw, fs * 1.5, fs * 0.5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = aktiv ? '#ffffff' : 'rgba(255,255,255,0.82)';
        ctx.fillText(text, x + 7, yy + 1);
      }
      ctx.restore();
    }
  }

  noteZeichnen(n, s, t, pps) {
    const { ctx, hitY } = this;
    const persp = (this.opt.perspektive || 0) > 0.001;
    const u0 = Math.max(0, (n.t - t) * pps / hitY);
    const u1 = Math.min(this.umax, (n.te - t) * pps / hitY);
    if (u1 <= 0 || u0 >= this.umax) return;
    const [c1, c2] = s.farbe(n);
    const xm = this.tasteMitte(n.p);
    const w = this.notenBreite(n.p);
    const klingt = n.t <= t && n.te > t;
    const zustand = s.zustand ? s.zustand(n) : null;
    let unten, oben, xl0, xr0, xl1, xr1, sk0;
    if (!persp) {
      unten = hitY - u0 * hitY; oben = Math.min(unten - 6, hitY - u1 * hitY);
      xl0 = xl1 = xm - w / 2; xr0 = xr1 = xm + w / 2; sk0 = 1;
    } else {
      const a = this.proj(xm - w / 2, u0), b = this.proj(xm + w / 2, u0), c = this.proj(xm - w / 2, u1), d = this.proj(xm + w / 2, u1);
      unten = a[1]; oben = Math.min(unten - 3, c[1]);
      xl0 = a[0]; xr0 = b[0]; xl1 = c[0]; xr1 = d[0]; sk0 = a[2];
    }
    const h = unten - oben;
    const grad = ctx.createLinearGradient(0, oben, 0, unten);
    const hell = klingt ? 0.35 : 0;
    grad.addColorStop(0, mische(c2, '#ffffff', hell * 0.6));
    grad.addColorStop(1, mische(c1, '#ffffff', hell));
    ctx.save();
    if (n.l === 'acc' || n.l === 'harm' || n.l === 'fill') ctx.globalAlpha = 0.9;
    if (zustand === 'verpasst') ctx.globalAlpha = 0.45;
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (!persp) {
      const r = Math.min((xr0 - xl0) * 0.3, 8, h / 2);
      rundRect(ctx, xl0, oben, xr0 - xl0, h, r);
    } else {
      ctx.moveTo(xl0, unten); ctx.lineTo(xr0, unten); ctx.lineTo(xr1, oben); ctx.lineTo(xl1, oben); ctx.closePath();
    }
    ctx.fill();
    // Kante und Glanz
    ctx.strokeStyle = zustand === 'verpasst' ? 'rgba(255,70,70,0.9)' : zustand === 'getroffen' ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = zustand ? 2 : 1;
    ctx.stroke();
    if (h > 10) {
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      if (!persp) {
        const gw = (xr1 - xl1) * 0.18;
        ctx.fillRect(xl1 + (xr1 - xl1) * 0.16, oben + 3, gw, Math.max(2, h - 8));
      } else {
        // Glanzstreifen perspektivisch als schmales Viereck entlang der Note
        const a0 = xl0 + (xr0 - xl0) * 0.16, a1 = xl1 + (xr1 - xl1) * 0.16;
        const b0 = a0 + (xr0 - xl0) * 0.18, b1 = a1 + (xr1 - xl1) * 0.18;
        ctx.beginPath(); ctx.moveTo(a0, unten - 4); ctx.lineTo(b0, unten - 4); ctx.lineTo(b1, oben + 3); ctx.lineTo(a1, oben + 3); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
    // Leuchten fuer Bloom
    const g = this.gctx;
    g.globalAlpha = klingt ? 1 : 0.4;
    g.fillStyle = c1;
    if (!persp) g.fillRect(xl1, oben, xr0 - xl0, h);
    else { g.beginPath(); g.moveTo(xl0, unten); g.lineTo(xr0, unten); g.lineTo(xr1, oben); g.lineTo(xl1, oben); g.closePath(); g.fill(); }
    // Beschriftung
    const text = s.label ? s.label(n) : null;
    const bw = xr0 - xl0;
    if (text && bw >= 11) {
      const fs = Math.round(Math.max(9, Math.min(bw * (text.length > 2 ? 0.42 : 0.56), 20)) * Math.max(0.7, sk0));
      if (h >= fs + 4) {
        ctx.save();
        ctx.font = `800 ${fs}px ${SCHRIFT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2.5, fs * 0.2);
        ctx.strokeStyle = 'rgba(10,12,16,0.62)';
        const y = unten - Math.max(4, fs * 0.32);
        ctx.strokeText(text, xm + (persp ? (xl0 + xr0) / 2 - xm : 0), y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, xm + (persp ? (xl0 + xr0) / 2 - xm : 0), y);
        ctx.restore();
      }
    }
  }

  // Gesangslinie als Geisternote: durchscheinend, mit Silbe – zeigt beim Begleiten, was gesungen wird
  geistZeichnen(n, s, t, pps) {
    const { ctx, hitY } = this;
    const u0 = Math.max(0, (n.t - t) * pps / hitY);
    const u1 = Math.min(this.umax, (n.te - t) * pps / hitY);
    if (u1 <= 0 || u0 >= this.umax) return;
    const xm = this.tasteMitte(n.p + (s.geistVersatz || 0));
    const w = Math.max(this.ww * 0.7, 12);
    const a = this.proj(xm - w / 2, u0), b = this.proj(xm + w / 2, u0), c = this.proj(xm - w / 2, u1);
    const unten = a[1], oben = Math.min(unten - 4, c[1]);
    const klingt = n.t <= t && n.te > t;
    ctx.save();
    ctx.fillStyle = klingt ? 'rgba(255,240,190,0.22)' : 'rgba(255,240,190,0.05)';
    ctx.strokeStyle = klingt ? 'rgba(255,240,190,0.95)' : 'rgba(255,240,190,0.38)';
    ctx.setLineDash(n.s ? [] : [4, 3]);
    ctx.lineWidth = klingt ? 2 : 1.3;
    rundRect(ctx, a[0], oben, b[0] - a[0], unten - oben, Math.min(7, (unten - oben) / 2));
    ctx.fill(); ctx.stroke();
    const text = n.s ? s.geistText?.(n) : null;
    if (text) {
      const fs = Math.round(Math.max(11, Math.min(17, this.ww * 0.42)) * Math.max(0.75, a[2]));
      ctx.font = `700 ${fs}px ${SCHRIFT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const x = b[0] + 5, y = unten - 3;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = klingt ? '#ffffff' : 'rgba(255,255,255,0.82)';
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  klaviaturZeichnen(s, aktiv, t) {
    const { ctx, W, hitY, tastH } = this;
    ctx.drawImage(this.weissCanvas, 0, hitY, W, tastH);
    // Tastenfarben: gespielt vom Song (aktiv), vom Nutzer, Vorschau, Warte-Ziele
    const farbeTaste = new Map();
    for (const n of aktiv) {
      const [c1, c2] = s.farbe(n);
      const alt = farbeTaste.get(n.p);
      if (!alt || n.l === 'mel') farbeTaste.set(n.p, { c1, c2, art: 'song' });
    }
    if (s.nutzer) for (const [p, info] of s.nutzer) {
      const f = info.art === 'falsch' ? ['#ff3b3b', '#ff9a9a'] : info.art === 'richtig' ? ['#ffffff', '#ffffff'] : [this.thema.nutzer, '#ffffff'];
      farbeTaste.set(p, { c1: f[0], c2: f[1], art: info.art || 'nutzer', mischen: farbeTaste.get(p) });
    }
    const zeichneHell = (k, f) => {
      const g = ctx.createLinearGradient(0, hitY, 0, hitY + (k.schwarz ? this.schwarzH : tastH));
      if (k.schwarz) { g.addColorStop(0, mische(f.c1, '#000000', 0.35)); g.addColorStop(1, f.c1); }
      else { g.addColorStop(0, f.c1); g.addColorStop(0.75, f.c2); g.addColorStop(1, mische(f.c1, '#000000', 0.15)); }
      ctx.fillStyle = g;
      if (k.schwarz) { const r = Math.min(4, k.w * 0.15); rundeUnten(ctx, k.x + 1, hitY, k.w - 2, this.schwarzH - 2, r); }
      else { const r = Math.min(6, k.w * 0.12); rundeUnten(ctx, k.x + 1.5, hitY, k.w - 3, tastH - 4, r); }
      ctx.fill();
      // gedrueckt: dunkler Rand oben
      const sch = ctx.createLinearGradient(0, hitY, 0, hitY + 14);
      sch.addColorStop(0, 'rgba(0,0,0,0.35)'); sch.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sch; ctx.fillRect(k.x + 1, hitY, k.w - 2, 14);
      // Leuchten
      this.gctx.globalAlpha = 0.9; this.gctx.fillStyle = f.c1;
      this.gctx.fillRect(k.x, hitY, k.w, k.schwarz ? this.schwarzH : tastH * 0.9);
    };
    for (const [p, f] of farbeTaste) { const k = this.tasten.get(p); if (k && !k.schwarz) zeichneHell(k, f); }
    // Warte-Ziele und Vorschau (weisse Tasten)
    this.zielMarken(s, false, t);
    ctx.drawImage(this.schwarzCanvas, 0, hitY, W, tastH);
    for (const [p, f] of farbeTaste) { const k = this.tasten.get(p); if (k && k.schwarz) zeichneHell(k, f); }
    this.zielMarken(s, true, t);
    // Akkordtoene als Punkte
    if (this.opt.akkordTasten && s.akkordTone) {
      ctx.save();
      for (const k of this.tasten.values()) {
        if (!s.akkordTone.includes(k.p % 12)) continue;
        const y = hitY + (k.schwarz ? this.schwarzH - 12 : tastH - 30);
        ctx.fillStyle = k.schwarz ? 'rgba(255,255,255,0.55)' : rgba(this.thema.linie, 0.55);
        ctx.beginPath(); ctx.arc(k.x + k.w / 2, y, Math.max(2.5, k.w * 0.09), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Filzstreifen + Trefferlinie
    const filz = 6;
    const fg = ctx.createLinearGradient(0, hitY - filz, 0, hitY + 1);
    fg.addColorStop(0, mische(this.thema.linie, '#000000', 0.55)); fg.addColorStop(0.5, this.thema.linie); fg.addColorStop(1, mische(this.thema.linie, '#000000', 0.45));
    ctx.fillStyle = fg; ctx.fillRect(0, hitY - filz, W, filz + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, hitY - filz, W, 1);
    this.gctx.globalAlpha = 0.5; this.gctx.fillStyle = this.thema.linie; this.gctx.fillRect(0, hitY - filz, W, filz);
    // Metallleiste (reicht bis unter die Steuerleiste)
    ctx.drawImage(this.metall, 0, hitY + tastH, W, this.leisteH + this.reserve);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, hitY + tastH, W, 1);
  }

  zielMarken(s, schwarz, t) {
    const { ctx, hitY, tastH } = this;
    const puls = 0.55 + 0.45 * Math.sin(performance.now() / 160);
    const mark = (p, stark) => {
      const k = this.tasten.get(p);
      if (!k || k.schwarz !== schwarz) return;
      const h = k.schwarz ? this.schwarzH : tastH;
      ctx.save();
      ctx.strokeStyle = stark ? `rgba(255,255,255,${0.5 + 0.5 * puls})` : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = stark ? 3 : 1.5;
      rundeUnten(ctx, k.x + 3, hitY + 3, k.w - 6, h - 8, 4); ctx.stroke();
      if (stark) { ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.12 * puls})`; ctx.fill(); }
      ctx.restore();
    };
    if (s.warteZiele) for (const p of s.warteZiele) mark(p, true);
    if (s.vorschau) for (const p of s.vorschau) mark(p, false);
  }

  aufprallZeichnen(s, aktiv, t, dt, fx) {
    const { ctx, hitY } = this;
    const jetztMs = performance.now();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const n of aktiv) {
      const [c1] = s.farbe(n);
      const x = this.tasteMitte(n.p);
      const w = this.notenBreite(n.p);
      const seit = t - n.t;
      const blitz = Math.max(0, 1 - seit / 0.22);
      const flimmer = 0.85 + 0.15 * Math.sin(jetztMs / 47 + n.p);
      if (fx.aufprall !== false) {
        const ww = this.ww;
        const gs = glowSprite(c1);
        const gr = ww * (2.4 + 2.6 * blitz);
        ctx.globalAlpha = Math.min(1, (0.6 + 0.4 * blitz) * flimmer);
        ctx.drawImage(gs, x - gr / 2, hitY - gr / 2, gr, gr);
        // heller weisser Kern direkt auf der Trefferlinie
        const kern = glowSprite('#ffffff', 64);
        const kr0 = ww * (0.9 + 0.9 * blitz);
        ctx.globalAlpha = (0.5 + 0.5 * blitz) * flimmer;
        ctx.drawImage(kern, x - kr0, hitY - kr0 * 0.55, kr0 * 2, kr0 * 1.1);
        const kr = kroneSprite(c1);
        const kb = ww * (2.6 + 1.8 * blitz), kh = kb * 0.72;
        ctx.globalAlpha = (0.55 + 0.45 * blitz) * flimmer;
        ctx.drawImage(kr, x - kb / 2, hitY - kh * 0.92, kb, kh);
        this.gctx.globalAlpha = 1; this.gctx.fillStyle = c1;
        this.gctx.fillRect(x - ww, hitY - ww * 1.2, ww * 2, ww * 1.6);
      }
      if (fx.funken) {
        const rate = (n.l === 'mel' ? 55 : 22) * (0.5 + n.v / 127);
        const menge = Math.floor(rate * dt + Math.random());
        if (menge > 0) this.partikel.spawn(x + (Math.random() - 0.5) * w * 0.8, hitY - 2, c1, menge, 0.8 + blitz * 0.6);
      }
      if (fx.pulse && !this.aktivVorher.has(n)) this.pulse.neu(x, hitY, c1, w);
    }
    ctx.restore();
    this.partikel.schritt(dt);
    this.partikel.zeichnen(ctx);
    this.pulse.schritt(dt);
    this.pulse.zeichnen(ctx);
  }

  // Kleines Fest (Etappe geschafft): Funkenregen ueber die ganze Breite, unabhaengig von den Effekt-Schaltern
  feiern(staerke = 1) {
    const farben = [this.thema.rh[0], this.thema.rh[1], this.thema.lh[0], this.thema.lh[1], '#ffd36b', '#ffffff'];
    const n = Math.round(220 * staerke);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * this.W;
      this.partikel.spawn(x, this.hitY - 4, farben[i % farben.length], 1, 1.3 + Math.random() * 1.4 * staerke);
    }
  }

  // Koordinaten -> Taste (fuer Mausklicks auf die Klaviatur)
  tasteBei(x, y) {
    if (y < this.hitY || y > this.hitY + this.tastH) return null;
    if (y < this.hitY + this.schwarzH) {
      for (const k of this.tasten.values()) if (k.schwarz && x >= k.x && x <= k.x + k.w) return k.p;
    }
    for (const k of this.tasten.values()) if (!k.schwarz && x >= k.x && x < k.x + k.w) return k.p;
    return null;
  }
}

function rundRect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}

function rundeUnten(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.closePath();
}
