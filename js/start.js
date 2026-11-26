// Startseite: Ueberblick ueber heute (Uebezeit, Serie, Woche), grosse Kacheln fuer alle Bereiche und die Begleit-Stile.
// Der erste Tipp gibt auf iOS auch den Ton frei (ersetzt die alte Startkarte).
// Leck-Schutz: oeffentliche Datei – Titel, Kuenstlerin und Liedteile kommen zur Laufzeit aus daten/.
import { symbol } from './symbole.js';
import { standText } from './update.js';

const tagName = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const TIPPS = [
  'Doppelt ganz links oder rechts auf die fallenden Noten tippen: 10 Sekunden zurück oder vor. Mehrmals tippen springt weiter.',
  'Zwei Finger auf den Noten auseinanderziehen: Die Noten werden größer und langsamer. Zusammenziehen zeigt mehr auf einmal.',
  'Lange auf die Noten drücken: Die nächsten 2 Takte laufen als Schleife. Nochmal lange drücken hebt sie auf.',
  'Im Liedblatt einen Akkord antippen: Du hörst ihn und siehst den Griff. „Ab hier“ spielt von dort.',
  'Liedblatt › Anpassen: Akkorde ersetzen, eine Silbe früher oder später setzen und Notizen wie „hier atmen“ schreiben.',
  '„Akkorde auswendig“ verdeckt alle Akkorde. Spiel mit – erst beim Wechsel taucht der richtige Akkord auf.',
  'Die Bühne zeigt nur Text und Akkorde, groß und mitlaufend. Ein Bluetooth-Pedal blättert, Leertaste startet.',
  'Text › Unterwegs baut eine Spur für Kopfhörer: hören, nachsprechen, Kontrolle – auch bei gesperrtem Bildschirm.',
  'Text › Ich & Original nimmt dich auf und spielt dich direkt nach der Aufnahme ab. So hörst du, was noch nicht sitzt.',
  'Das Stil-Karussell spielt einen Liedteil immer wieder – jeder Durchgang in einem anderen Begleit-Stil.',
  'Taste B öffnet das Liedblatt, K wechselt den Stil, Umschalt+K die Stufe, J zeigt nur die Akkorde.',
  'Einstellungen › Hilfe › Sicherung: Lernstände als Datei speichern – zum Aufheben oder für ein neues Gerät.',
  'Die Tonart gilt überall: im Liedblatt „C“ wählen, dann spielt auch das Klavier in C-Dur (fast nur weiße Tasten).',
  'Neue Version? Oben erscheint ein Hinweis „Aktualisieren“ – deine Lernstände bleiben dabei erhalten.',
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class StartSeite {
  constructor({ wurzel, song, einst, speicher, engine, aktionen, handy = false }) {
    Object.assign(this, { wurzel, song, einst, speicher, engine, aktionen, handy });
    this.sichtbar = false;
  }

  // ------------------------------------------------------------------------------------ Zahlen
  stand() {
    const text = this.speicher.lesen('text_fortschritt', null) || {};
    const uwTage = this.speicher.lesen('uebeweg_tage', {}) || {};
    const tTage = text.tage || {};
    const sek = (k) => ((tTage[k] && tTage[k].sekunden) || 0) + ((uwTage[k] && uwTage[k].sekunden) || 0);
    const heute = tagName();
    const woche = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = tagName(d);
      woche.push({ tag: i === 0 ? 'heute' : WOCHENTAGE[d.getDay()], klavier: ((uwTage[k] && uwTage[k].sekunden) || 0) / 60, text: ((tTage[k] && tTage[k].sekunden) || 0) / 60 });
    }
    let serie = 0;
    const d = new Date();
    if (sek(tagName(d)) < 60) d.setDate(d.getDate() - 1);
    while (sek(tagName(d)) >= 60 && serie < 3650) { serie++; d.setDate(d.getDate() - 1); }
    const zeilen = (this.song.zeilen || []).filter((z) => !z.summen);
    const zf = text.zeilen || {};
    const sicher = zeilen.filter((z) => (zf[z.nr] && zf[z.nr].sterne) >= 4).length;
    const faellig = zeilen.filter((z) => !zf[z.nr] || (zf[z.nr].faellig || 0) <= Date.now()).length;
    const uw = this.speicher.lesen(`uebeweg_${this.song.fassung.id}`, null);
    const etappenFertig = uw && uw.etappen ? Object.values(uw.etappen).filter((e) => e && e.fertig).length : 0;
    const ziel = Number(this.einst.get('uebeweg.tagesZiel')) || 15;
    const zl = this.einst.get('zuletzt') || {};
    const ab = zl.pos > 4 ? (this.song.abschnitte || []).filter((x) => x.t <= zl.pos).pop() : null;
    const weiter = zl.pos > 4 ? `Weiter bei ${Math.floor(zl.pos / 60)}:${String(Math.floor(zl.pos % 60)).padStart(2, '0')}${ab ? ` · ${ab.name.replace(/\s*–.*$/, '').replace(/\s*\(.*\)$/, '')}` : ''}` : null;
    // Uebeweg: wo es weitergeht (Liedteil, Takt, Hand)
    let uwWeiter = null;
    if (uw && uw.aktuellVonB != null) {
      const takt = Math.floor(uw.aktuellVonB / 4) + 1;
      const teil = takt < 1 ? 'Vorspiel' : ((this.song.abschnitte || []).find((x) => x.von <= takt && takt <= x.bis) || {}).name;
      const hand = { L: 'links', R: 'rechts', B: 'beide Hände', T: 'im Tempo', S: 'singen' }[uw.aktuellSt] || '';
      const zus = String(uw.aktuellId || '').startsWith('d');
      uwWeiter = `Weiter: ${teil ? teil.replace(/\s*–.*$/, '') : ''}${zus ? ' · alle zusammen' : takt >= 1 ? ` · Takt ${takt}` : ''}${hand ? ` · ${hand}` : ''}`;
    }
    return { weiter, uwWeiter, heuteMin: sek(heute) / 60, ziel, serie, woche, sicher, zeilenGesamt: zeilen.length, faellig, uwBegonnen: !!(uw && uw.etappen && Object.keys(uw.etappen).length), etappenFertig };
  }

  gruss() {
    const h = new Date().getHours();
    return h < 5 ? 'Noch wach?' : h < 11 ? 'Guten Morgen' : h < 14 ? 'Schönen Mittag' : h < 18 ? 'Guten Tag' : h < 22 ? 'Guten Abend' : 'Späte Übestunde';
  }

  // ------------------------------------------------------------------------------------ Aufbau
  zeigen() {
    this.sichtbar = true;
    this.bauen();
    this.wurzel.classList.remove('versteckt');
    requestAnimationFrame(() => this.wurzel.classList.add('st-da'));
  }

  verstecken() {
    this.sichtbar = false;
    this.wurzel.classList.remove('st-da');
    this.wurzel.classList.add('versteckt');
  }

  bauen() {
    const s = this.song, z = this.stand();
    const stile = s.stile || [];
    const stil = stile.find((x) => x.id === s.fassung.stil);
    const anteil = Math.min(1, z.heuteMin / z.ziel);
    const U = 2 * Math.PI * 52;
    const maxMin = Math.max(z.ziel, ...z.woche.map((w) => w.klavier + w.text), 1);
    const woche = z.woche.map((w) => {
      const hk = (w.klavier / maxMin) * 100, ht = (w.text / maxMin) * 100;
      return `<div class="st-tag${w.tag === 'heute' ? ' st-tag-heute' : ''}"><div class="st-saeule"><i class="st-k" style="height:${hk.toFixed(1)}%"></i><i class="st-t" style="height:${ht.toFixed(1)}%"></i></div><small>${w.tag}</small></div>`;
    }).join('');
    const kachel = (id, sym, titel, unter, klasse = '', marke = '') =>
      `<button type="button" class="st-kachel ${klasse}" data-a="${id}"><span class="st-ksym">${symbol(sym)}</span><span class="st-ktext"><b>${esc(titel)}</b><small>${esc(unter)}</small></span>${marke ? `<span class="st-marke">${esc(marke)}</span>` : ''}</button>`;
    const fassungText = stil ? `${stil.name} · Stufe ${s.fassung.stufe}` : s.fassung.name;
    const uwStand = this.aktionen.uebewegStand?.() || null;
    this.wurzel.innerHTML = `
<div class="st-app">
  <header class="st-kopf">
    <div class="st-gruss">${esc(this.gruss())}</div>
    <h1 class="st-titel"></h1>
    <div class="st-unter"></div>
  </header>
  <section class="st-heute glas">
    <div class="st-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="st-ring-grund" cx="60" cy="60" r="52"/><circle class="st-ring-wert${anteil <= 0 ? ' st-null' : ''}" cx="60" cy="60" r="52" stroke-dasharray="${(U * anteil).toFixed(1)} ${U.toFixed(1)}"/></svg>
      <div class="st-ring-text"><b>${Math.floor(z.heuteMin)}</b><small>von ${z.ziel} min</small></div>
    </div>
    <div class="st-zahlen">
      <div><b>${z.serie}</b><small>${z.serie === 1 ? 'Tag' : 'Tage'} am Stück</small></div>
      <div><b>${z.sicher}<span>/${z.zeilenGesamt}</span></b><small>Zeilen sicher</small></div>
      <div><b>${z.etappenFertig}</b><small>Übe-Schritte durch</small></div>
    </div>
    <div class="st-woche" aria-label="Übezeit der letzten 7 Tage">${woche}</div>
    <div class="st-legende"><span><i class="st-k"></i>Klavier</span><span><i class="st-t"></i>Text</span></div>
  </section>
  <section class="st-tipp glas"><div class="st-tipp-kopf">${symbol('hilfe')}<b>Tipp</b><span class="lb-frei"></span><button type="button" class="knopf rund st-tipp-weiter" data-a="tipp" aria-label="Nächster Tipp">${symbol('weiter')}</button></div><p></p></section>
  <section class="st-kacheln">
    ${kachel('uebeweg', 'pfad', z.uwBegonnen ? 'Übeweg fortsetzen' : 'Übeweg starten', z.uwBegonnen && z.uwWeiter ? z.uwWeiter : `${fassungText} · Stück für Stück`, 'st-gross st-gruen').replace('</small></span>', `</small>${uwStand && uwStand.fertig ? `<span class="st-fortschritt"><i style="width:${(uwStand.anteil * 100).toFixed(1)}%"></i></span>` : ''}</span>`)}
    ${kachel('klavier', 'klavier', 'Klavier', z.weiter || 'Fallende Noten, alle Stile', 'st-blau')}
    ${kachel('liedblatt', 'liedblatt', 'Liedblatt', 'Akkorde über dem Text · mitlaufend', 'st-gold', 'Neu')}
    ${kachel('text', 'lautschule', 'Text lernen', `${z.faellig} Karten fällig · Lautschrift`, 'st-lila')}
    ${kachel('unterwegs', 'kopfhoerer', 'Unterwegs', 'Hören, nachsprechen – mit Kopfhörern', 'st-tuerkis')}
    ${kachel('buehne', 'vollbild', 'Bühne', 'Nur Text und Akkorde, groß, scrollt mit', 'st-rot')}
    ${kachel('auswendig', 'auge', 'Akkorde auswendig', 'Verdeckt mitspielen – weißt du sie?', 'st-orange', 'Neu')}
    ${kachel('karussell', 'wiederholen', 'Stil-Karussell', 'Ein Liedteil, jeder Durchgang ein anderer Stil', 'st-grau')}
  </section>
  <section class="st-stile">
    <div class="st-stile-kopf"><b>Begleitung</b><small>${esc(stil ? stil.kurz : 'Song mit Melodie oder eigene Mischung')}</small></div>
    <div class="st-chips"></div>
  </section>
  <footer class="st-fuss"><span>Stand ${esc(standText())}</span><button type="button" class="knopf st-update" data-a="update">${symbol('wiederholen')}<span>Nach Updates suchen</span></button></footer>
</div>`;
    this.wurzel.querySelector('.st-titel').textContent = s.titel || 'Tastenlicht';
    if (this.tippNr == null) this.tippNr = Math.floor(Date.now() / 86400000) % TIPPS.length;   // jeden Tag ein anderer
    this.tippZeigen(0);
    this.wurzel.querySelector('.st-unter').textContent = [s.kuenstlerin, s.tonartName, `${Math.round(s.bpm)} BPM`].filter(Boolean).join(' · ');
    const chips = this.wurzel.querySelector('.st-chips');
    const liste = [['song', 'Mit Melodie'], ...stile.map((x) => [x.id, x.name]), ['mix', 'Mein Arrangement']];
    const aktuell = s.fassung.id === 'song' ? 'song' : s.fassung.id === 'mix' ? 'mix' : s.fassung.stil;
    for (const [id, name] of liste) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `st-chip${id === aktuell ? ' an' : ''}`;
      b.textContent = name;
      b.onclick = () => { this.aktionen.stilWaehlen(id); this.bauen(); };
      chips.appendChild(b);
    }
    this.wurzel.querySelector('.st-app').addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b) this.aktion(b.dataset.a, b);
    });
  }

  tippZeigen(d) {
    this.tippNr = (this.tippNr + d + TIPPS.length) % TIPPS.length;
    const p = this.wurzel.querySelector('.st-tipp p');
    if (p) p.textContent = TIPPS[this.tippNr];
  }

  async aktion(a, b) {
    try { this.engine.aufwecken(); } catch { /* egal */ }   // iOS: Ton mit dem ersten Tipp freigeben
    const A = this.aktionen;
    switch (a) {
      case 'update': {
        const sp = b.querySelector('span');
        sp.textContent = 'Suche …';
        const ja = await window.tlUpdate?.pruefen(true);
        sp.textContent = ja ? 'Neue Version – oben tippen' : 'Nach Updates suchen';
        return;
      }
      case 'tipp': this.tippZeigen(1); return;
      case 'klavier': this.verstecken(); A.startZu?.(); break;
      case 'uebeweg': this.verstecken(); A.startZu?.(); if (!A.uebewegAktiv?.()) A.uebewegUmschalten(); break;
      case 'liedblatt': this.verstecken(); A.startZu?.(); await A.liedblattOeffnen(); break;
      case 'buehne': this.verstecken(); A.startZu?.(); await A.liedblattOeffnen({ buehne: true }); break;
      case 'auswendig': this.verstecken(); A.startZu?.(); await A.liedblattOeffnen({ verdeckt: true }); break;
      case 'karussell': this.verstecken(); A.startZu?.(); if (!A.karussellAktiv?.()) A.karussellUmschalten(); break;
      case 'text': this.verstecken(); A.startZu?.(); await A.textOeffnen(); break;
      case 'unterwegs': this.verstecken(); A.startZu?.(); await A.textOeffnen(null, { modus: 'unterwegs' }); break;
      default: break;
    }
  }
}
