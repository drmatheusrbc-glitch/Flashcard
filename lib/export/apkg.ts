import crypto from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import type { Deck, Flashcard } from '../types';

const BASIC_MODEL_ID = 1700000001001;
const CLOZE_MODEL_ID = 1700000001002;
const IO_MODEL_ID = 1700000001003;

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function computeFieldChecksum(sfld: string): number {
  const hash = crypto.createHash('sha1').update(stripHtml(sfld), 'utf8').digest('hex');
  return parseInt(hash.slice(0, 8), 16);
}

function formatReferenceHtml(card: Flashcard): string {
  const r = card.reference;
  const parts = [
    `${escapeHtml(r.authorOrInstitution)}.`,
    `<i>${escapeHtml(r.title)}</i>.`,
    `${escapeHtml(r.sourceOrJournal)} (${escapeHtml(r.year)}).`,
  ];
  if (r.identifier) parts.push(`ID: ${escapeHtml(r.identifier)}.`);
  if (r.url) parts.push(`<a href="${escapeHtml(r.url)}">${escapeHtml(r.url)}</a>`);
  if (!r.verified) parts.push(`<br><small>[Referência não verificada externamente]</small>`);
  if (card.outdatedAlert?.isOutdated) {
    parts.push(
      `<br><br><b>Atualização Científica:</b> ${escapeHtml(
        card.outdatedAlert.reason || 'Recomendação atualizada segundo diretrizes vigentes.'
      )}`
    );
  }
  return parts.join(' ');
}

function buildOcclusionSvgOverlay(card: Flashcard, reveal: boolean): string {
  const regions = card.occlusionRegions || [];
  if (regions.length === 0) return '';
  const rects = regions
    .map((reg) => {
      if (!reveal) {
        return `<rect x="${reg.x}%" y="${reg.y}%" width="${reg.width}%" height="${reg.height}%" fill="#F59E0B" fill-opacity="0.92" stroke="#B45309" stroke-width="0.6" rx="1" />`;
      }
      return `<rect x="${reg.x}%" y="${reg.y}%" width="${reg.width}%" height="${reg.height}%" fill="#10B981" fill-opacity="0.22" stroke="#059669" stroke-width="0.6" rx="1" />`;
    })
    .join('');
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">${rects}</svg>`;
}

export async function generateApkgBuffer(deck: Deck): Promise<Buffer> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), 'node_modules/sql.js/dist', file),
  });

  const db = new SQL.Database();
  const nowSec = Math.floor(Date.now() / 1000);
  const deckId = Math.abs(
    parseInt(crypto.createHash('md5').update(deck.id).digest('hex').slice(0, 10), 16)
  ) || 1700000002001;

  // Anki collection.anki2 schema
  db.run(`
    CREATE TABLE col (
      id integer primary key,
      crt integer not null,
      mod integer not null,
      scm integer not null,
      ver integer not null,
      dty integer not null,
      usn integer not null,
      ls integer not null,
      conf text not null,
      models text not null,
      decks text not null,
      dconf text not null,
      tags text not null
    );
    CREATE TABLE notes (
      id integer primary key,
      guid text not null,
      mid integer not null,
      mod integer not null,
      usn integer not null,
      tags text not null,
      flds text not null,
      sfld text not null,
      csum integer not null,
      flags integer not null,
      data text not null
    );
    CREATE TABLE cards (
      id integer primary key,
      nid integer not null,
      did integer not null,
      ord integer not null,
      mod integer not null,
      usn integer not null,
      type integer not null,
      queue integer not null,
      due integer not null,
      ivl integer not null,
      factor integer not null,
      reps integer not null,
      lapses integer not null,
      left integer not null,
      odue integer not null,
      odid integer not null,
      flags integer not null,
      data text not null
    );
    CREATE TABLE revlog (
      id integer primary key,
      cid integer not null,
      usn integer not null,
      ease integer not null,
      ivl integer not null,
      lastIvl integer not null,
      factor integer not null,
      time integer not null,
      type integer not null
    );
    CREATE TABLE graves (
      usn integer not null,
      oid integer not null,
      type integer not null
    );
  `);

  const baseCss = `.card { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 18px; line-height: 1.5; text-align: center; color: #0F172A; background-color: #FFFFFF; padding: 20px; }
.meta { font-size: 12px; color: #64748B; margin-bottom: 12px; }
.ref { font-size: 12px; color: #475569; margin-top: 18px; padding-top: 12px; border-top: 1px solid #E2E8F0; text-align: left; }
.cloze { font-weight: bold; color: #0284C7; }
.io-wrap { position: relative; display: inline-block; max-width: 100%; }
.io-wrap img { display: block; max-width: 100%; height: auto; }`;

  const models = {
    [BASIC_MODEL_ID]: {
      id: BASIC_MODEL_ID,
      name: 'Cardexis Basic',
      type: 0,
      mod: nowSec,
      usn: -1,
      sortf: 0,
      did: deckId,
      tmpls: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: '<div class="meta">{{Assunto}}</div><div>{{Front}}</div>',
          afmt: '{{FrontSide}}<hr id=answer><div>{{Back}}</div><div class="ref">{{Referencia}}</div>',
          bqfmt: '',
          bafmt: '',
          did: null,
          bfont: '',
          bsize: 0,
        },
      ],
      flds: [
        { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 18, media: [] },
        { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 18, media: [] },
        { name: 'Assunto', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 14, media: [] },
        { name: 'Referencia', ord: 3, sticky: false, rtl: false, font: 'Arial', size: 12, media: [] },
      ],
      css: baseCss,
      latexPre: '',
      latexPost: '',
      req: [[0, 'all', [0]]],
    },
    [CLOZE_MODEL_ID]: {
      id: CLOZE_MODEL_ID,
      name: 'Cardexis Cloze',
      type: 1,
      mod: nowSec,
      usn: -1,
      sortf: 0,
      did: deckId,
      tmpls: [
        {
          name: 'Cloze',
          ord: 0,
          qfmt: '<div class="meta">{{Assunto}}</div><div>{{cloze:Text}}</div>',
          afmt: '<div class="meta">{{Assunto}}</div><div>{{cloze:Text}}</div><br><div class="ref">{{Extra}}<br><br>{{Referencia}}</div>',
          bqfmt: '',
          bafmt: '',
          did: null,
          bfont: '',
          bsize: 0,
        },
      ],
      flds: [
        { name: 'Text', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 18, media: [] },
        { name: 'Extra', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 16, media: [] },
        { name: 'Assunto', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 14, media: [] },
        { name: 'Referencia', ord: 3, sticky: false, rtl: false, font: 'Arial', size: 12, media: [] },
      ],
      css: baseCss,
      latexPre: '',
      latexPost: '',
      req: [[0, 'any', [0]]],
    },
    [IO_MODEL_ID]: {
      id: IO_MODEL_ID,
      name: 'Cardexis Image Occlusion',
      type: 0,
      mod: nowSec,
      usn: -1,
      sortf: 0,
      did: deckId,
      tmpls: [
        {
          name: 'Image Occlusion',
          ord: 0,
          qfmt: '<div class="meta">{{Assunto}}</div><div>{{Header}}</div><div class="io-wrap">{{Image}}{{QuestionMask}}</div>',
          afmt: '<div class="meta">{{Assunto}}</div><div>{{Header}}</div><div class="io-wrap">{{Image}}{{AnswerMask}}</div><hr id=answer><div><b>{{Back}}</b></div><div class="ref">{{Referencia}}</div>',
          bqfmt: '',
          bafmt: '',
          did: null,
          bfont: '',
          bsize: 0,
        },
      ],
      flds: [
        { name: 'Header', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 18, media: [] },
        { name: 'Image', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 18, media: [] },
        { name: 'QuestionMask', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 14, media: [] },
        { name: 'AnswerMask', ord: 3, sticky: false, rtl: false, font: 'Arial', size: 14, media: [] },
        { name: 'Back', ord: 4, sticky: false, rtl: false, font: 'Arial', size: 18, media: [] },
        { name: 'Assunto', ord: 5, sticky: false, rtl: false, font: 'Arial', size: 14, media: [] },
        { name: 'Referencia', ord: 6, sticky: false, rtl: false, font: 'Arial', size: 12, media: [] },
      ],
      css: baseCss,
      latexPre: '',
      latexPost: '',
      req: [[0, 'all', [0, 1]]],
    },
  };

  const decks = {
    1: {
      id: 1,
      name: 'Default',
      mod: nowSec,
      usn: -1,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
      collapsed: false,
      browserCollapsed: false,
      desc: '',
      dyn: 0,
      conf: 1,
    },
    [deckId]: {
      id: deckId,
      name: deck.title,
      mod: nowSec,
      usn: -1,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
      collapsed: false,
      browserCollapsed: false,
      desc: deck.coverageReport || '',
      dyn: 0,
      conf: 1,
    },
  };

  const dconf = {
    1: {
      id: 1,
      name: 'Default',
      replayq: true,
      lapse: { leechFails: 8, delays: [10], minInt: 1, leechAction: 0, mult: 0 },
      rev: { perDay: 200, ivlFct: 1, maxIvl: 36500, minSpace: 1, ease4: 1.3, fuzz: 0.05, bury: false },
      timer: 0,
      maxTaken: 60,
      usn: 0,
      new: { perDay: 20, delays: [1, 10], separate: true, ints: [1, 4, 7], initialFactor: 2500, bury: false, order: 1 },
      autoplay: true,
      mod: 0,
    },
  };

  const conf = {
    nextPos: 1,
    estTimes: true,
    activeDecks: [deckId],
    sortType: 'noteFld',
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: deckId,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: BASIC_MODEL_ID,
    collapseTime: 1200,
  };

  db.run(
    `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
     VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')`,
    [
      nowSec,
      nowSec * 1000,
      nowSec * 1000,
      JSON.stringify(conf),
      JSON.stringify(models),
      JSON.stringify(decks),
      JSON.stringify(dconf),
    ]
  );

  const mediaMap: Record<string, string> = {};
  const mediaFiles: Array<{ indexKey: string; buffer: Buffer }> = [];
  let mediaCounter = 0;
  const imageDataUrlToFilename = new Map<string, string>();

  const insertNoteStmt = db.prepare(
    `INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
     VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')`
  );
  const insertCardStmt = db.prepare(
    `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
     VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')`
  );

  deck.cards.forEach((card, idx) => {
    const noteId = nowSec * 1000 + idx * 10 + 1;
    const cardId = nowSec * 1000 + idx * 10 + 2;
    const guid = crypto.createHash('md5').update(card.id).digest('base64url').slice(0, 10);
    const subjectTag = card.subject.replace(/\s+/g, '_').replace(/[^\w-]/g, '');
    const tags = ` ${subjectTag} ${card.importance} `;
    const refHtml = formatReferenceHtml(card);

    let mid = BASIC_MODEL_ID;
    let fields: string[] = [];

    if (card.modality === 'image_occlusion' && card.imageDataUrl) {
      mid = IO_MODEL_ID;
      let filename = imageDataUrlToFilename.get(card.imageDataUrl);
      if (!filename) {
        const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(card.imageDataUrl);
        if (match) {
          const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
          filename = `cardexis_io_${mediaCounter}.${ext}`;
          const indexKey = String(mediaCounter);
          mediaMap[indexKey] = filename;
          mediaFiles.push({ indexKey, buffer: Buffer.from(match[2], 'base64') });
          imageDataUrlToFilename.set(card.imageDataUrl, filename);
          mediaCounter++;
        }
      }
      const imgTag = filename ? `<img src="${filename}">` : '';
      const qMask = buildOcclusionSvgOverlay(card, false);
      const aMask = buildOcclusionSvgOverlay(card, true);
      fields = [
        escapeHtml(card.front),
        imgTag,
        qMask,
        aMask,
        escapeHtml(card.back),
        escapeHtml(card.subject),
        refHtml,
      ];
    } else if (card.modality === 'cloze') {
      mid = CLOZE_MODEL_ID;
      const clozeSource = card.clozeText && card.clozeText.includes('{{c')
        ? card.clozeText
        : `${card.front} {{c1::${card.back}}}`;
      fields = [
        escapeHtml(clozeSource),
        escapeHtml(card.back),
        escapeHtml(card.subject),
        refHtml,
      ];
    } else {
      mid = BASIC_MODEL_ID;
      fields = [
        escapeHtml(card.front),
        escapeHtml(card.back),
        escapeHtml(card.subject),
        refHtml,
      ];
    }

    const flds = fields.join('\x1f');
    const sfld = stripHtml(fields[0]);
    const csum = computeFieldChecksum(sfld);

    insertNoteStmt.run([noteId, guid, mid, nowSec, tags, flds, sfld, csum]);
    insertCardStmt.run([cardId, noteId, deckId, nowSec, idx + 1]);
  });

  insertNoteStmt.free();
  insertCardStmt.free();

  const dbBinary = db.export();
  db.close();

  const zip = new JSZip();
  zip.file('collection.anki2', dbBinary);
  zip.file('media', JSON.stringify(mediaMap));
  for (const m of mediaFiles) {
    zip.file(m.indexKey, m.buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return zipBuffer;
}
