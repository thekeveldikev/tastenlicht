// Silbentrennung fuer Anzeige und Karaoke (Klavier-Studio und Lautschule nutzen dieselbe Trennung).

export function silbenTrennen(wort) {
  const vok = /(üä|uä|iä|öi|ei|ou|au|äu|eu|ie|ii|ee|aa|oo|uu|üü|ää|öö|[aeiouäöüy])/gi;
  const kerne = [];
  let m;
  while ((m = vok.exec(wort))) kerne.push(m.index);
  if (kerne.length <= 1) return [wort];
  const schnitte = [];
  for (let i = 1; i < kerne.length; i++) {
    let s = kerne[i];
    const davor = wort.slice(0, s).toLowerCase();
    if (/sch$/.test(davor) && s - 3 > kerne[i - 1]) s -= 3;
    else if (/(ch|ck|tz|pf|ng)$/.test(davor) && s - 2 > kerne[i - 1]) s -= /ng$/.test(davor) ? 1 : 2;
    else if (s - 1 > kerne[i - 1] && !/[aeiouäöüy]/i.test(wort[s - 1])) s -= 1;
    schnitte.push(s);
  }
  const out = [];
  let a = 0;
  for (const s of schnitte) { out.push(wort.slice(a, s)); a = s; }
  out.push(wort.slice(a));
  return out;
}

// Silben einer ganzen Zeile: Kurzwoerter ohne Vokal (d, dr, z) haengen an der naechsten Silbe, Summ-Laute zaehlen.
// Ergebnis: [{text, neuesWort, wort}] – wort = Index des Wortes in der Zeile (Kurzwoerter gehoeren zum Folgewort)
export function zeilenSilben(text) {
  const out = [];
  let vorsatz = '';
  let wortIndex = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const nackt = w.replace(/[.,!?;:]/g, '');
    const kurz = !/[aeiouäöüy]/i.test(nackt) && !/^h?m+h?$/i.test(nackt);
    if (kurz) { vorsatz += w + ' '; continue; }
    silbenTrennen(w).forEach((s, i) => out.push({ text: (i === 0 ? vorsatz : '') + s, neuesWort: i === 0, wort: wortIndex }));
    vorsatz = '';
    wortIndex++;
  }
  if (vorsatz && out.length) out[out.length - 1].text += ' ' + vorsatz.trim();
  return out;
}

// Woerter einer Zeile (Kurzwoerter an das Folgewort gebunden), passend zu zeilenSilben().wort
export function zeilenWoerter(text) {
  const out = [];
  let vorsatz = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const nackt = w.replace(/[.,!?;:]/g, '');
    const kurz = !/[aeiouäöüy]/i.test(nackt) && !/^h?m+h?$/i.test(nackt);
    if (kurz) { vorsatz += w + ' '; continue; }
    out.push(vorsatz + w);
    vorsatz = '';
  }
  if (vorsatz && out.length) out[out.length - 1] += ' ' + vorsatz.trim();
  return out;
}
