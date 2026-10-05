// Effekt-Bausteine: vorgerenderte Leucht-Sprites, Partikelpool, Pulsringe, Hintergruende.
// Alles additiv ('lighter') gezeichnet, ohne teures shadowBlur.

const spriteCache = new Map();

const rgbCache = new Map();
export function farbeRgb(farbe) {
  let r = rgbCache.get(farbe);
  if (r) return r;
  const m = /^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(farbe);
  if (m) r = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    const h = String(farbe).replace('#', '');
    const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    r = [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  if (r.some((x) => Number.isNaN(x))) r = [255, 255, 255];
  rgbCache.set(farbe, r);
  return r;
}

const hex2 = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
export function mische(farbe, ziel, anteil) {
  const a = farbeRgb(farbe), b = farbeRgb(ziel);
  return `#${hex2(a[0] + (b[0] - a[0]) * anteil)}${hex2(a[1] + (b[1] - a[1]) * anteil)}${hex2(a[2] + (b[2] - a[2]) * anteil)}`;
}

export function rgba(hex, alpha) {
  const [r, g, b] = farbeRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function leinwand(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Weiches rundes Leuchten: weisser Kern -> Farbe -> transparent
export function glowSprite(farbe, groesse = 128) {
  const key = `glow:${farbe}:${groesse}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = leinwand(groesse, groesse), g = c.getContext('2d');
  const r = groesse / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, rgba(farbe, 0.95));
  grad.addColorStop(0.35, rgba(farbe, 0.35));
  grad.addColorStop(0.7, rgba(farbe, 0.08));
  grad.addColorStop(1, rgba(farbe, 0));
  g.fillStyle = grad; g.fillRect(0, 0, groesse, groesse);
  spriteCache.set(key, c);
  return c;
}

// Lichtkrone beim Aufprall (feine Strahlen nach oben, wie ein Funkenkranz)
export function kroneSprite(farbe, b = 160, h = 110) {
  const key = `krone:${farbe}:${b}:${h}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = leinwand(b, h), g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  const cx = b / 2, cy = h * 0.92;
  const strahlen = 23;
  for (let i = 0; i < strahlen; i++) {
    const winkel = -Math.PI / 2 + (i / (strahlen - 1) - 0.5) * Math.PI * 0.95;
    const laenge = h * (0.35 + 0.6 * Math.pow(Math.sin((i * 7.13) % Math.PI), 2)) * (1 - Math.abs(winkel + Math.PI / 2) / 2.2);
    const breite = 1.2 + 1.6 * Math.random();
    const ex = cx + Math.cos(winkel) * laenge, ey = cy + Math.sin(winkel) * laenge;
    const grad = g.createLinearGradient(cx, cy, ex, ey);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, rgba(farbe, 0.6));
    grad.addColorStop(1, rgba(farbe, 0));
    g.strokeStyle = grad; g.lineWidth = breite; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
  }
  const kern = g.createRadialGradient(cx, cy, 0, cx, cy, h * 0.45);
  kern.addColorStop(0, 'rgba(255,255,255,0.9)');
  kern.addColorStop(0.3, rgba(farbe, 0.45));
  kern.addColorStop(1, rgba(farbe, 0));
  g.fillStyle = kern;
  g.beginPath(); g.ellipse(cx, cy, h * 0.5, h * 0.3, 0, 0, Math.PI * 2); g.fill();
  spriteCache.set(key, c);
  return c;
}

export function punktSprite(farbe, groesse = 24) {
  const key = `punkt:${farbe}:${groesse}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = leinwand(groesse, groesse), g = c.getContext('2d');
  const r = groesse / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, rgba(farbe, 0.9));
  grad.addColorStop(1, rgba(farbe, 0));
  g.fillStyle = grad; g.fillRect(0, 0, groesse, groesse);
  spriteCache.set(key, c);
  return c;
}

// ------------------------------------------------------------------------------ Partikel (fester Pool)
export class Partikel {
  constructor(max = 900) {
    this.max = max;
    this.p = new Float32Array(max * 8);   // x, y, vx, vy, leben, max, groesse, farbIndex
    this.n = 0;
    this.farben = [];
  }
  farbIndex(farbe) { let i = this.farben.indexOf(farbe); if (i < 0) { this.farben.push(farbe); i = this.farben.length - 1; } return i; }
  spawn(x, y, farbe, menge = 1, staerke = 1) {
    const fi = this.farbIndex(farbe);
    for (let k = 0; k < menge; k++) {
      if (this.n >= this.max) return;
      const o = this.n * 8;
      this.p[o] = x + (Math.random() - 0.5) * 6;
      this.p[o + 1] = y;
      this.p[o + 2] = (Math.random() - 0.5) * 70 * staerke;
      this.p[o + 3] = -(90 + Math.random() * 260) * staerke;
      this.p[o + 5] = this.p[o + 4] = 0.45 + Math.random() * 0.9;
      this.p[o + 6] = 2 + Math.random() * 4.5;
      this.p[o + 7] = fi;
      this.n++;
    }
  }
  schritt(dt) {
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 8;
      const leben = this.p[o + 4] - dt;
      if (leben <= 0) continue;
      const z = j * 8;
      if (z !== o) for (let k = 0; k < 8; k++) this.p[z + k] = this.p[o + k];
      this.p[z + 4] = leben;
      this.p[z + 2] *= (1 - 1.2 * dt);
      this.p[z + 3] = this.p[z + 3] * (1 - 0.9 * dt) + 40 * dt;
      this.p[z] += this.p[z + 2] * dt + Math.sin((leben + i) * 9) * 8 * dt;
      this.p[z + 1] += this.p[z + 3] * dt;
      j++;
    }
    this.n = j;
  }
  zeichnen(ctx) {
    if (!this.n) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sprites = this.farben.map((f) => punktSprite(f));
    for (let i = 0; i < this.n; i++) {
      const o = i * 8;
      const a = this.p[o + 4] / this.p[o + 5];
      const s = this.p[o + 6] * (0.6 + 0.8 * a);
      ctx.globalAlpha = Math.min(1, a * 1.3);
      ctx.drawImage(sprites[this.p[o + 7]], this.p[o] - s, this.p[o + 1] - s, s * 2, s * 2);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------ Pulsringe beim Anschlag
export class Pulse {
  constructor() { this.liste = []; }
  neu(x, y, farbe, breite) { if (this.liste.length < 80) this.liste.push({ x, y, farbe, r0: breite * 0.5, t: 0 }); }
  schritt(dt) { for (const p of this.liste) p.t += dt; this.liste = this.liste.filter((p) => p.t < 0.6); }
  zeichnen(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.liste) {
      const k = p.t / 0.6;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = p.farbe;
      ctx.lineWidth = 2.5 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r0 + k * p.r0 * 4, (p.r0 + k * p.r0 * 4) * 0.35, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------ Hintergruende
export class Sternenhimmel {
  constructor() { this.sterne = []; this.w = 0; this.h = 0; }
  groesse(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.sterne = Array.from({ length: Math.round((w * h) / 5200) }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() < 0.08 ? 1.6 : 0.5 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2, tempo: 0.5 + Math.random() * 2, tiefe: 0.2 + Math.random() * 0.8,
    }));
  }
  zeichnen(ctx, zeit, songzeit, hoehe) {
    ctx.save();
    for (const s of this.sterne) {
      const y = (((s.y + songzeit * 6 * s.tiefe) % hoehe) + hoehe) % hoehe;   // auch bei negativer Songzeit (Vorspiel)
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(zeit * s.tempo + s.phase));
      ctx.globalAlpha = a * s.tiefe;
      ctx.fillStyle = '#dfe8ff';
      ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export function auroraZeichnen(ctx, w, h, zeit, farben, staerke = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  farben.forEach((f, i) => {
    const x = w * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(zeit * 0.07 + i * 2.1)));
    const y = h * (0.25 + 0.25 * Math.sin(zeit * 0.05 + i * 1.3));
    const r = Math.max(w, h) * (0.35 + 0.1 * Math.sin(zeit * 0.11 + i));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(f, 0.10 * staerke));
    g.addColorStop(0.5, rgba(f, 0.04 * staerke));
    g.addColorStop(1, rgba(f, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.restore();
}

// Gebuerstetes Metall (fuer die Leiste unter den Tasten) einmal als Textur erzeugen
export function metallTextur(w, h) {
  const c = leinwand(w, h), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1b1c20'); grad.addColorStop(0.5, '#101114'); grad.addColorStop(1, '#08090b');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  for (let i = 0; i < h * 3; i++) {
    const y = Math.random() * h;
    g.globalAlpha = 0.03 + Math.random() * 0.06;
    g.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
    g.fillRect(0, y, w, Math.random() < 0.8 ? 1 : 2);
  }
  g.globalAlpha = 1;
  const glanz = g.createLinearGradient(0, 0, w, 0);
  glanz.addColorStop(0, 'rgba(255,255,255,0)'); glanz.addColorStop(0.5, 'rgba(255,255,255,0.05)'); glanz.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glanz; g.fillRect(0, 0, w, h);
  return c;
}
