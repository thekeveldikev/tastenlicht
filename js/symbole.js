// Eigene SVG-Symbole (keine Emoji/Schriftsymbole – die malt jedes System anders).
const P = {
  play: '<path class="fuell" d="M8 5.2v13.6L18.8 12z"/>',
  pause: '<path class="fuell" d="M6.8 5h3.6v14H6.8zM13.6 5h3.6v14h-3.6z"/>',
  anfang: '<path d="M6 5v14"/><path class="fuell" d="M18.5 5.4v13.2L9 12z"/>',
  schleife: '<path d="M17 2.5l3 3-3 3"/><path d="M4 11V9.5a4 4 0 0 1 4-4h12"/><path d="M7 21.5l-3-3 3-3"/><path d="M20 13v1.5a4 4 0 0 1-4 4H4"/>',
  metronom: '<path d="M9.2 3h5.6L18.5 21h-13z"/><path d="M12 15.5l5-9"/><path d="M8 17.5h8"/>',
  text: '<path d="M3.5 18.5L8.5 6l5 12.5"/><path d="M5.4 14h6.2"/><path d="M15.5 13.2c.5-1.2 1.5-1.8 2.7-1.8 1.7 0 2.8 1 2.8 2.8v4.3"/><path d="M21 16c-1-.5-5.3-.8-5.3 1.2 0 1.6 2.6 2 4.3.5"/>',
  zahnrad: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/><circle cx="12" cy="12" r="6.6"/>',
  hilfe: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6"/><circle class="fuell" cx="12" cy="16.9" r="1.05"/>',
  vollbild: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  lautschule: '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  klavier: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M13 5v14M18 5v14"/><path class="fuell" d="M6.5 5h3v8h-3zM11.5 5h3v8h-3zM16.5 5h3v8h-3z"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M6 12h12M12 6v12"/>',
  mikro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  lautsprecher: '<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  stopp: '<rect class="fuell" x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  aufnahme: '<circle class="fuell" cx="12" cy="12" r="6"/>',
  haken: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  kreuz: '<path d="M6 6l12 12M18 6L6 18"/>',
  weiter: '<path d="M9 5l7 7-7 7"/>',
  zurueck: '<path d="M15 5l-7 7 7 7"/>',
  wiederholen: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  schildkroete: '<path d="M4 15c0-4 3.6-7 8-7s8 3 8 7z"/><path d="M8 15v3M16 15v3M20 13.5h1.5"/><path d="M9 11.5l3 3.5 3-3.5"/>',
  ohr: '<path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 2.4-1.3 3.6-2.6 4.8-1 .9-1.4 1.8-1.4 3.2a3 3 0 0 1-5.6 1.5"/><path d="M9.5 9.8a2.5 2.5 0 0 1 5 0c0 1.2-.8 1.7-1.6 2.3"/><path d="M3 6.5c.6-1.4 1.5-2.5 2.6-3.3M21 6.5c-.6-1.4-1.5-2.5-2.6-3.3"/>',
  karten: '<rect x="3" y="7" width="13" height="13" rx="2"/><path d="M8 4h11a2 2 0 0 1 2 2v11"/>',
  stern: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.8z"/>',
  ordner: '<path d="M3.5 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9.5A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7z"/>',
  speichern: '<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  welle: '<path d="M3 12h2l2-6 3 12 3-9 2 5 2-2h4"/>',
  pfad: '<circle cx="5" cy="19" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.6 17.6c2-1 2.6-3.2 3.8-4.4M13.6 10.4c1.2-1.2 1.8-3.4 3.8-4.4"/>',
  blatt: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 12h7M9 15.5h7M9 19h4"/>',
  auge: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  // iPad-Fassung
  teilen: '<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6.5 10.5H5v10h14v-10h-1.5"/>',
  schloss: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 6.5-6 6.5-2.5 0-4-1.2-5.2-3L3.6 14a1.5 1.5 0 0 1 2.4-1.8L8 14.5"/>',
  liste: '<path d="M9 6h11M9 12h11M9 18h11"/><circle class="fuell" cx="4.5" cy="6" r="1.2"/><circle class="fuell" cx="4.5" cy="12" r="1.2"/><circle class="fuell" cx="4.5" cy="18" r="1.2"/>',
  wolke: '<path d="M7 18.5h10.5a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.6-1.3A4 4 0 0 0 7 18.5z"/><path d="M12 10.5v6M9.5 14l2.5 2.5 2.5-2.5"/>',
  noten: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  pedal: '<path d="M7 20h10l1.5-6.5H5.5z"/><path d="M12 13.5V8"/><path d="M8.5 8h7"/>',
  sonne: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  // Text-Teil (iPhone und Boni)
  kopfhoerer: '<path d="M4 15.5V12a8 8 0 0 1 16 0v3.5"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.6"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6"/>',
  puzzle: '<path d="M5 8.5h3.4a2.1 2.1 0 1 1 3.7 0h3.4v3.4a2.1 2.1 0 1 1 0 3.7v3.4H12a2.1 2.1 0 1 0-3.7 0H5v-3.4a2.1 2.1 0 1 0 0-3.7z"/>',
  frage: '<path d="M4.5 5h15v10.5h-7.2L8 19.5v-4H4.5z"/><path d="M10.2 8.6a1.9 1.9 0 1 1 2.7 1.7c-.5.3-.9.7-.9 1.3v.3"/><circle class="fuell" cx="12" cy="13.6" r=".95"/>',
  flamme: '<path d="M12 21c-3.6 0-6-2.5-6-5.7 0-3.3 2.5-4.8 3.4-8 1 1.5 1.6 2.4 2.7 3 .2-2.5 1.3-4.7 3-6.5.3 2.7 2.9 5.4 2.9 9.6 0 4.7-2.4 7.6-6 7.6z"/>',
  haus: '<path d="M3.5 11.5L12 4l8.5 7.5"/><path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5"/>',
  stift: '<path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="M13.8 6.8l3.4 3.4"/>',
  liedblatt: '<rect class="fuell" x="3" y="3.5" width="6" height="4.2" rx="1.2"/><rect class="fuell" x="13.5" y="3.5" width="5" height="4.2" rx="1.2"/><path d="M3 11.2h18"/><rect class="fuell" x="8" y="13.6" width="5.5" height="4.2" rx="1.2"/><path d="M3 21h13"/>',
  einfuegen: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="M9 11h6M9 14.5h6"/>',
  einklappen: '<path d="M6 14.5l6-6 6 6"/>',
  ausklappen: '<path d="M6 9.5l6 6 6-6"/>',
  zusammen: '<rect x="3" y="8" width="5" height="8" rx="1.5"/><rect x="9.5" y="8" width="5" height="8" rx="1.5"/><rect x="16" y="8" width="5" height="8" rx="1.5"/><path d="M3 20h18"/>',
  treppe: '<path d="M3.5 19.5h4v-4h4v-4h4v-4h5"/><path d="M17 4.5h3.5V8"/>',
  klickAus: '<path d="M9.2 3h5.6L18.5 21h-13z"/><path d="M8 17.5h8"/><path d="M3.5 3.5l17 17"/>',
  vor: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
  flagge: '<path d="M5.5 21V4"/><path d="M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
  rueck: '<path d="M15 5.5L8.5 12l6.5 6.5"/>',
};

export function symbol(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
}

export function setzeSymbol(el, name, text = '') {
  if (!el) return;
  el.innerHTML = symbol(name) + (text ? `<span>${text}</span>` : '');
}
