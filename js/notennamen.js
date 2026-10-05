// Notennamen in verschiedenen Systemen. Tonart Des-Dur -> standardmaessig b-Vorzeichen.

const EN_B = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const EN_K = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DE_B = ['C', 'Des', 'D', 'Es', 'E', 'F', 'Ges', 'G', 'As', 'A', 'B', 'H'];
const DE_K = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'Ais', 'H'];
const SO_B = ['Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const SO_K = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
export function istSchwarz(p) { return [1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12); }

// Tonklassen fuer Akkordsymbole – mit b UND # (Transposition in Kreuz-Tonarten erzeugt "F#", "C#" …)
const PCX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 };
const AKK_RE = /^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/;

// Aktuelle Tonika (Standard Des-Dur) – setzeFassung stellt sie beim Transponieren um
let TONIKA = 1, KREUZ = false;
export function setzeTonika(pc, kreuz = false) { TONIKA = ((pc % 12) + 12) % 12; KREUZ = !!kreuz; }

export function notenName(p, system = 'de', vorzeichen = 'b', mitOktave = false, zeichen = false) {
  const pc = ((p % 12) + 12) % 12;
  let n;
  switch (system) {
    case 'en': n = (vorzeichen === '#' ? EN_K : EN_B)[pc]; break;
    case 'solfege': n = (vorzeichen === '#' ? SO_K : SO_B)[pc]; break;
    case 'stufe': n = stufe(pc); break;
    case 'zahl': n = String(p); break;
    default: n = (vorzeichen === '#' ? DE_K : DE_B)[pc];
  }
  if (zeichen && system !== 'de') n = n.replace(/([A-G]|[a-z])b$/, '$1♭').replace('#', '♯');
  if (mitOktave) n += String(Math.floor(p / 12) - 1);
  return n;
}

function stufe(pc) {
  const rel = (pc - TONIKA + 12) % 12;  // relativ zur Tonika (Des-Dur bzw. transponiert)
  return ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'][rel];
}

export function oktavName(p) { return `C${Math.floor(p / 12) - 1}`; }

// Akkordsymbole: intern englisch mit b ("Gbmaj9"). Darstellung waehlbar.
const AKK_DE = { C: 'C', Db: 'Des', D: 'D', Eb: 'Es', E: 'E', F: 'F', Gb: 'Ges', G: 'G', Ab: 'As', A: 'A', Bb: 'B', B: 'H', Cb: 'Ces',
  'C#': 'Cis', 'D#': 'Dis', 'F#': 'Fis', 'G#': 'Gis', 'A#': 'Ais' };

export function akkordName(sym, system = 'en', zeichen = false) {
  if (!sym) return '';
  if (system === 'de') {
    const m = /^([A-G][b#]?)(.*?)(?:\/([A-G][b#]?))?$/.exec(sym);
    if (!m) return sym;
    return (AKK_DE[m[1]] || m[1]) + m[2] + (m[3] ? '/' + (AKK_DE[m[3]] || m[3]) : '');
  }
  if (zeichen) return sym.replace(/([A-G])b/g, '$1♭').replace(/#/g, '♯');
  return sym;
}

// Akkordsymbol -> Tonklassen (0 = C). Versteht die Symbole der Klavierfassung (sus2, add9, maj9(#11), /Bass …)
export function akkordTone(sym) {
  const m = AKK_RE.exec(sym || '');
  if (!m) return [];
  const r = PCX[m[1]];
  let q = m[2] || '';
  let iv = [0, 4, 7];
  if (/^m(?!aj)/.test(q)) iv = [0, 3, 7];
  if (/sus2/.test(q)) iv = [0, 2, 7];
  if (/sus4/.test(q)) iv = [0, 5, 7];
  if (/maj7|maj9/.test(q)) iv.push(11);
  else if (/(^|[^j])(7|9|11)/.test(q.replace('add9', ''))) iv.push(10);
  if (/9/.test(q)) iv.push(2);
  if (/11/.test(q) && !/#11/.test(q)) iv.push(5);
  if (/#11/.test(q)) iv.push(6);
  if (/(^|m)6/.test(q)) iv.push(9);
  const pcs = new Set(iv.map((i) => (r + i) % 12));
  if (m[3]) pcs.add(PCX[m[3]]);
  return [...pcs];
}

// Transponieren: Tonart (Des-Dur + k Halbtoene) und Akkordsymbole
const DUR_DE = ['C', 'Des', 'D', 'Es', 'E', 'F', 'Ges', 'G', 'As', 'A', 'B', 'H'];
const KREUZ_TONARTEN = new Set([7, 2, 9, 4, 11]);          // G, D, A, E, H -> Kreuz-Schreibweise
export function tonartNach(k) {
  const pc = ((1 + k) % 12 + 12) % 12;
  return { pc, name: `${DUR_DE[pc]}-Dur`, kreuz: KREUZ_TONARTEN.has(pc) };
}

export function transponiereAkkord(sym, k, kreuz = false) {
  if (!k || !sym) return sym;
  const m = AKK_RE.exec(sym);
  if (!m) return sym;
  const NB =['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const NK = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const N = kreuz ? NK : NB;
  const neu = (r) => N[((PCX[r] + k) % 12 + 12) % 12];
  return neu(m[1]) + m[2] + (m[3] ? '/' + neu(m[3]) : '');
}

// Live-Akkorderkennung: gehaltene Tasten -> Akkordname (Schreibweise wie die Fassung: b, in Kreuz-Tonarten #)
const ERK_NAMEN_B = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const ERK_NAMEN_K = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ERK_TYPEN = [
  ['', [0, 4, 7]], ['m', [0, 3, 7]], ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]], ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]],
  ['7', [0, 4, 7, 10]], ['(add9)', [0, 2, 4, 7]], ['m(add9)', [0, 2, 3, 7]], ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]],
  ['maj9', [0, 2, 4, 7, 11]], ['m9', [0, 2, 3, 7, 10]], ['m11', [0, 3, 5, 7, 10]], ['dim', [0, 3, 6]], ['aug', [0, 4, 8]], ['5', [0, 7]],
  ['maj7(#11)', [0, 4, 6, 7, 11]], ['7sus4', [0, 5, 7, 10]],
];

export function erkenneAkkord(toene) {
  const ps = [...new Set(toene)].sort((a, b) => a - b);
  if (ps.length < 2) return null;
  const pcs = new Set(ps.map((p) => p % 12));
  const bass = ps[0] % 12;
  let best = null;
  for (let r = 0; r < 12; r++) {
    if (!pcs.has(r)) continue;
    for (const [typ, iv] of ERK_TYPEN) {
      const t = new Set(iv.map((i) => (r + i) % 12));
      let treffer = 0, extra = 0, fehlend = 0;
      for (const pc of pcs) (t.has(pc) ? treffer++ : extra++);
      for (const pc of t) if (!pcs.has(pc)) fehlend++;
      const punkte = treffer * 2 - extra * 2.2 - fehlend * 1.1 + (bass === r ? 0.6 : 0) - iv.length * 0.05;
      if (!best || punkte > best.punkte) best = { punkte, r, typ };
    }
  }
  if (!best) return null;
  const N = KREUZ ? ERK_NAMEN_K : ERK_NAMEN_B;
  return N[best.r] + best.typ + (bass !== best.r ? '/' + N[bass] : '');
}

// Stufenbezeichnung (roemisch) relativ zur aktuellen Tonika fuer das Akkord-HUD
const ROEM = { 1: 'I', 2: 'bII', 3: 'II', 4: 'bIII', 5: 'III', 6: 'IV', 7: '#IV', 8: 'V', 9: 'bVI', 10: 'VI', 11: 'bVII', 0: 'VII' };

export function akkordStufe(sym, tonika = TONIKA) {
  const m = /^([A-G][b#]?)(m(?!aj))?/.exec(sym || '');
  if (!m || PCX[m[1]] == null) return '';
  const rel = (PCX[m[1]] - tonika + 12) % 12;
  const r = ROEM[(rel + 1) % 12 === 0 ? 0 : rel + 1] || '';
  return m[2] ? r.toLowerCase() : r;
}
