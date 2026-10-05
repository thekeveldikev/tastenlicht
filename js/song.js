import { tonartNach, transponiereAkkord, setzeTonika } from './notennamen.js';

// Song laden und vorbereiten: Zeitachse (Schlag <-> Sekunde), Noten mit Zeiten, Akkorde, Abschnitte, Liedtext.
// iPad-Fassung: alles liegt unter daten/ (im Netz verschluesselt, der Service Worker entschluesselt es).

export async function ladeSong(basis = 'daten/') {
  const antwort = await fetch(basis + 'song.json');
  if (!antwort.ok) throw new Error(`song.json fehlt (${antwort.status})`);
  const song = await antwort.json();
  song.basis = basis;
  song._grund = { spuren: song.spuren, pedal: song.pedal, akkorde: song.akkorde, abschnitte: song.abschnitte };
  song.fassungen ||= [{ id: 'song', name: 'Song (mit Melodie)' }];
  song.fassung = song.fassungen[0];
  song.anfang = 0;
  vorbereiten(song);
  song.zeilen = [];
  if (song.liedtext) {
    try {
      const txt = await (await fetch(basis + song.liedtext)).text();
      song.zeilen = liesLiedtext(txt);
      zeilenVerknuepfen(song);
    } catch (e) {
      console.warn('Liedtext nicht lesbar', e);
    }
  }
  return song;
}

// ------------------------------------------------------------------ Baukasten: je Liedteil ein anderer Stil
// wahl = { t0: 'intim2', t1: 'intim2', t2: 'orig2', … } – Schluessel = Nummer des Liedteils (t0 = Vorspiel)
// -> Fassung "mix" in song.fassungen
export function baukastenSetzen(song, wahl = {}) {
  const basis = song.fassungen.find((x) => x.id === 'begl1');
  if (!basis) return null;
  const teile = basis.abschnitte || [];
  const rh = [], lh = [], ped = [];
  teile.forEach((ab, i) => {
    const a = (ab.von - 1) * 4;                                    // Vorspiel: von -1 -> Schlag -8
    const e = i + 1 < teile.length ? (teile[i + 1].von - 1) * 4 : Infinity;
    const id = wahl[`t${i}`] ?? wahl[ab.name];
    const f = song.fassungen.find((x) => x.id === id && x.art === 'begleitung' && x.id !== 'mix') || song.fassungen.find((x) => x.id === 'begl3') || basis;
    for (const sp of f.spuren) {
      for (const n of sp.noten) {
        if (n.b < a - 1e-6 || n.b >= e - 1e-6) continue;
        (sp.hand === 'L' ? lh : rh).push({ ...n, d: Math.min(n.d, e - n.b + 0.02) });
      }
    }
    for (const p of f.pedal || basis.pedal || []) {
      if (p.b >= a - 0.1 && p.b < e - 1e-6) ped.push({ ...p, d: Math.min(p.d, e - p.b - 0.04) });
    }
  });
  const sortiere = (l) => l.sort((x, y) => x.b - y.b || x.p - y.p);
  const mix = {
    id: 'mix', name: 'Mein Arrangement', art: 'begleitung', stil: 'mix', stilName: 'Mein Arrangement', stufe: 0, stufeName: '',
    beschreibung: 'je Liedteil dein Lieblingsstil', anfang_b: basis.anfang_b, erbe: 'begl1', pedal: ped,
    spuren: [{ id: 'rh', name: 'Rechte Hand', hand: 'R', noten: sortiere(rh) }, { id: 'lh', name: 'Linke Hand', hand: 'L', noten: sortiere(lh) }],
  };
  song.fassungen = [...song.fassungen.filter((x) => x.id !== 'mix'), mix];
  return mix;
}

// ------------------------------------------------------------------ Fassungen (Song mit Melodie / Begleitung in Stufen)
// transposition: Halbtoene (z. B. -3 = in deine Stimmlage). Die Grunddaten bleiben unveraendert, gespielt wird eine Kopie.
export function setzeFassung(song, id, transposition = song.transposition || 0) {
  const f = song.fassungen.find((x) => x.id === id) || song.fassungen[0];
  const g = song._grund;
  const gesang = g.spuren.find((s) => s.id === 'gesang');
  const k = Math.round(transposition) || 0;
  const ton = tonartNach(k);
  song.transposition = k;
  song.tonartName = ton.name;
  song.kreuzTonart = ton.kreuz;
  setzeTonika(ton.pc, ton.kreuz);        // Stufen, Stufen-Notennamen und Akkorderkennung folgen der Tonart
  song.fassung = f;
  const kopie = (s) => ({ ...s, noten: s.noten.map((n) => ({ ...n, p: n.p + k })) });
  // Stil-Fassungen erben Akkorde, Liedteile (und ggf. Pedal) von einer Grundfassung ("erbe": "begl1")
  const erbe = (f.erbe && song.fassungen.find((x) => x.id === f.erbe)) || {};
  song.spuren = [...(f.spuren || g.spuren.filter((s) => s.id !== 'gesang')).map(kopie), kopie(gesang)];
  song.pedal = f.pedal || erbe.pedal || g.pedal;
  song.akkorde = (f.akkorde || erbe.akkorde || g.akkorde).map((a) => ({ ...a, sym: transponiereAkkord(a.sym, k, ton.kreuz) }));
  song.abschnitte = (f.abschnitte || erbe.abschnitte || g.abschnitte).map((a) => ({ ...a }));
  song.anfang = f.anfang_b != null ? zeitAusBeat(song, f.anfang_b) : 0;
  vorbereiten(song);
  if (song.zeilen?.length) zeilenVerknuepfen(song);
  return f;
}

// ------------------------------------------------------------------ Zeitachse
export function zeitAusBeat(song, b) {
  const be = song.beats;
  const n = be.length;
  if (b <= 0) return be[0] + b * (be[1] - be[0]);
  if (b >= n - 1) return be[n - 1] + (b - (n - 1)) * (be[n - 1] - be[n - 2]);
  const i = Math.floor(b);
  return be[i] + (b - i) * (be[i + 1] - be[i]);
}

export function beatAusZeit(song, t) {
  const be = song.beats;
  const n = be.length;
  if (t <= be[0]) return (t - be[0]) / (be[1] - be[0]);
  if (t >= be[n - 1]) return n - 1 + (t - be[n - 1]) / (be[n - 1] - be[n - 2]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (be[m] <= t) lo = m; else hi = m; }
  return lo + (t - be[lo]) / (be[lo + 1] - be[lo]);
}

export function taktVonBeat(b) { return Math.floor(b / 4) + 1; }

function vorbereiten(song) {
  const ped = (song.pedal || []).map((p) => [p.b, p.b + p.d]).sort((a, c) => a[0] - c[0]);
  const pedalEnde = (bEnde) => {
    for (const [a, e] of ped) if (bEnde > a + 0.02 && bEnde < e) return e;
    return null;
  };
  let id = 0;
  song.alleNoten = [];
  for (const spur of song.spuren) {
    for (const n of spur.noten) {
      n.id = id++;
      n.spur = spur.id;
      n.hand = spur.hand;
      n.t = zeitAusBeat(song, n.b);
      n.te = zeitAusBeat(song, n.b + n.d);
      const pe = spur.hand === 'V' ? null : pedalEnde(n.b + n.d);
      n.tr = pe != null ? Math.max(n.te, zeitAusBeat(song, pe)) : n.te;   // Klingende Zeit mit Pedal
      song.alleNoten.push(n);
    }
    spur.noten.sort((a, c) => a.t - c.t || a.p - c.p);
  }
  song.alleNoten.sort((a, c) => a.t - c.t || a.p - c.p);
  song.takte = [];
  const anzahlTakte = Math.floor((song.beats.length - 1) / 4);
  const vorTakte = song.fassung?.anfang_b != null ? Math.round(-song.fassung.anfang_b / 4) : 0;
  for (let k = -vorTakte; k < anzahlTakte; k++) {
    song.takte.push({ nr: k + 1, label: k < 0 ? `V${k + vorTakte + 1}` : String(k + 1), b: k * 4, t: zeitAusBeat(song, k * 4), te: zeitAusBeat(song, k * 4 + 4) });
  }
  song.taktAnzahl = anzahlTakte;
  for (const a of song.akkorde) { a.t = zeitAusBeat(song, a.b); a.te = zeitAusBeat(song, a.b + a.d); }
  for (const s of song.abschnitte) { s.t = zeitAusBeat(song, (s.von - 1) * 4); s.te = zeitAusBeat(song, s.bis * 4); }
  const klavier = song.alleNoten.filter((n) => n.hand !== 'V');
  song.tonumfang = { min: Math.min(...klavier.map((n) => n.p)), max: Math.max(...klavier.map((n) => n.p)) };
  song.ende = Math.min(song.dauer, Math.max(...klavier.map((n) => n.tr)) + 1.5);
}

// ------------------------------------------------------------------ Liedtext (Zeitmarke mm:ss.xx, darunter die Zeile)
export function liesLiedtext(txt) {
  const zeilen = txt.replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < zeilen.length; i++) {
    const m = /^\s*\[?(\d+):(\d+(?:[.,]\d+)?)\]?\s*(.*)$/.exec(zeilen[i]);
    if (!m) continue;
    const t = parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(',', '.'));
    let text = m[3].trim();
    if (!text) { // Format: Zeitmarke allein, Text in der naechsten nicht-leeren Zeile
      let j = i + 1;
      while (j < zeilen.length && !zeilen[j].trim()) j++;
      if (j < zeilen.length && !/^\s*\[?\d+:\d+/.test(zeilen[j])) { text = zeilen[j].trim(); i = j; }
    }
    if (text) out.push({ nr: out.length + 1, t, text });
  }
  for (let i = 0; i < out.length; i++) out[i].te = i + 1 < out.length ? out[i + 1].t : out[i].t + 6;
  return out;
}

export function istSummen(text) {
  return /^[\s,.!?'-]*((h?m+h?|h?u+h?|uh|ah+|oh+|la+)[\s,.!?'-]*)+$/i.test(text);
}

// Gesangsnoten je Zeile; Ende der Zeile = letzte Gesangsnote + kurzer Nachhall
function zeilenVerknuepfen(song) {
  const ges = song.spuren.find((s) => s.id === 'gesang');
  for (const z of song.zeilen) {
    z.noten = ges ? ges.noten.filter((n) => n.z === z.nr) : [];
    z.silben = z.noten.filter((n) => n.s);
    z.summen = istSummen(z.text);
    if (z.noten.length) {
      z.ts = Math.min(z.t, z.noten[0].t);
      z.tEnde = Math.max(...z.noten.map((n) => n.te));
    } else {
      z.ts = z.t;
      z.tEnde = Math.min(z.te, z.t + 4);
    }
  }
}

export function zeileBei(song, t) {
  let akt = null;
  for (const z of song.zeilen) {
    if (z.ts - 0.35 <= t) akt = z; else break;
  }
  if (akt && t > akt.tEnde + 1.2) {
    const naechste = song.zeilen.find((z) => z.ts > t);
    return { aktuell: null, naechste };
  }
  const naechste = akt ? song.zeilen[akt.nr] : song.zeilen[0];
  return { aktuell: akt, naechste };
}

export function abschnittBei(song, t) {
  let a = song.abschnitte[0];
  for (const s of song.abschnitte) if (s.t <= t + 1e-6) a = s;
  return a;
}

export function akkordBei(song, t) {
  let lo = 0, hi = song.akkorde.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (song.akkorde[m].t <= t + 1e-6) { best = m; lo = m + 1; } else hi = m - 1; }
  return { index: best, akkord: best >= 0 ? song.akkorde[best] : null, naechster: song.akkorde[best + 1] || null };
}

export function zeitFormat(s) {
  if (!isFinite(s)) return '0:00';
  const neg = s < 0;
  s = Math.abs(s);
  const m = Math.floor(s / 60);
  const sek = Math.floor(s % 60);
  return `${neg ? '-' : ''}${m}:${String(sek).padStart(2, '0')}`;
}
