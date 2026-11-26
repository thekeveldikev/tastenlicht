// Sicherung: alle Lernstaende und Einstellungen dieses Geraets als Datei speichern (Teilen-Menue: Dateien, AirDrop …)
// und wieder laden. Schutz gegen Verlust (iOS raeumt den Speicher von Web-Apps, die lange nicht geoeffnet wurden)
// und zum Umziehen auf ein neues Geraet. Das Geheimwort ist NICHT dabei (liegt getrennt im Tresor des Service Workers).
// Leck-Schutz: oeffentliche Datei – keine Liedinhalte.
import { symbol } from './symbole.js';

const PRAEFIX = 'tl:';
const heute = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function sammeln() {
  const daten = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PRAEFIX)) daten[k] = localStorage.getItem(k);
  }
  return { art: 'tastenlicht-sicherung', version: 1, erstellt: new Date().toISOString(), daten };
}

async function speichern(toast) {
  const inhalt = JSON.stringify(sammeln(), null, 1);
  const name = `Tastenlicht-Sicherung-${heute()}.json`;
  const datei = new File([inhalt], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [datei] })) {
      await navigator.share({ files: [datei], title: 'Tastenlicht-Sicherung' });
      toast('Sicherung übergeben – am besten in „Dateien“ sichern.', 2600);
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(datei);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('Sicherung gespeichert.', 2000);
}

function laden(toast) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    let d = null;
    try { d = JSON.parse(await f.text()); } catch { d = null; }
    if (!d || d.art !== 'tastenlicht-sicherung' || !d.daten || typeof d.daten !== 'object') { toast('Das ist keine Tastenlicht-Sicherung.', 2600); return; }
    const n = Object.keys(d.daten).filter((k) => k.startsWith(PRAEFIX)).length;
    const wann = d.erstellt ? new Date(d.erstellt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'unbekannt';
    if (!confirm(`Sicherung vom ${wann} laden?\n${n} Einträge – die Lernstände auf diesem Gerät werden dadurch ersetzt.`)) return;
    for (const [k, v] of Object.entries(d.daten)) if (k.startsWith(PRAEFIX) && typeof v === 'string') { try { localStorage.setItem(k, v); } catch { /* voll */ } }
    toast('Sicherung geladen – die App startet neu …', 2000);
    setTimeout(() => location.reload(), 1200);
  };
  inp.click();
}

export function sicherungBaustein(toast = () => {}) {
  const box = document.createElement('div');
  box.className = 'sicherung-baustein';
  box.innerHTML = `<p class="text-hilfe">Alle Lernstände und Einstellungen als Datei – zum Aufheben oder für ein neues Gerät.</p>
    <div class="sicherung-reihe"><button type="button" class="knopf sb-speichern">${symbol('speichern')}<span>Sicherung speichern</span></button>
    <button type="button" class="knopf sb-laden">${symbol('ordner')}<span>Sicherung laden</span></button></div>`;
  box.querySelector('.sb-speichern').onclick = () => speichern(toast);
  box.querySelector('.sb-laden').onclick = () => laden(toast);
  return box;
}
