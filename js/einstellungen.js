// Einstellungen der iPad-Fassung: Standardwerte + Speicherung im Geraet (localStorage der Home-Bildschirm-App).
// Gespeicherte Werte werden nur uebernommen, wenn ihr Typ zum Standard passt.

const kopie = (o) => JSON.parse(JSON.stringify(o));

export class Einstellungen {
  constructor(name, standard) {
    this.name = name;
    this.standard = kopie(standard);
    this.werte = kopie(standard);
    this.hoerer = new Set();
    this._timer = null;
  }

  laden() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem('tl:' + this.name) || 'null'); } catch { g = null; }
    if (g && typeof g === 'object') this.werte = tiefMischen(kopie(this.standard), g);
    return this;
  }

  get(pfad) { return pfad.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.werte); }

  set(pfad, wert, { still = false } = {}) {
    const teile = pfad.split('.');
    const letzter = teile[teile.length - 1];
    let o = this.werte;
    for (let i = 0; i < teile.length - 1; i++) { if (o[teile[i]] == null) o[teile[i]] = {}; o = o[teile[i]]; }
    if (o[letzter] === wert) return;
    o[letzter] = wert;
    if (!still) for (const h of this.hoerer) h(pfad, wert);
    this.speichernSpaeter();
  }

  beiAenderung(fn) { this.hoerer.add(fn); return () => this.hoerer.delete(fn); }

  zuruecksetzen() {
    this.werte = kopie(this.standard);
    for (const h of this.hoerer) h('*', null);
    this.speichernSpaeter();
  }

  speichernSpaeter() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.speichernJetzt(), 400);
  }

  speichernJetzt() {
    clearTimeout(this._timer);
    try { localStorage.setItem('tl:' + this.name, JSON.stringify(this.werte)); } catch { /* voll oder gesperrt */ }
  }
}

function tiefMischen(ziel, quelle) {
  for (const [k, v] of Object.entries(quelle)) {
    if (!(k in ziel)) continue;
    const z = ziel[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && z && typeof z === 'object' && !Array.isArray(z)) tiefMischen(z, v);
    else if (z === null || (typeof z === typeof v && Array.isArray(z) === Array.isArray(v) && v !== null)) ziel[k] = v;
  }
  return ziel;
}

// Kleiner Speicher fuer Lernstaende (JSON je Schluessel)
export const speicher = {
  lesen(name, ersatz = null) { try { const v = JSON.parse(localStorage.getItem('tl:' + name) || 'null'); return v ?? ersatz; } catch { return ersatz; } },
  schreiben(name, wert) { try { localStorage.setItem('tl:' + name, JSON.stringify(wert)); return true; } catch { return false; } },
};
