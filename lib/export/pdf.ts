import { jsPDF } from 'jspdf';
import type { Deck, Flashcard } from '../types';

export function downloadDeckAsPdf(deck: Deck): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const maxLineWidth = pageWidth - margin * 2;
  let y = 20;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 16) {
      doc.addPage();
      y = 18;
    }
  };

  // Cover Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(deck.title, maxLineWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Total: ${deck.cards.length} flashcards  ·  Profundidade: ${deck.depth}  ·  Gerado em ${new Date(
      deck.createdAt
    ).toLocaleDateString('pt-BR')}`,
    margin,
    y
  );
  y += 6;

  if (deck.coverageReport) {
    const covLines = doc.splitTextToSize(deck.coverageReport, maxLineWidth);
    doc.text(covLines, margin, y);
    y += covLines.length * 4.5 + 4;
  }

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Group cards by subject
  const grouped = new Map<string, Flashcard[]>();
  for (const card of deck.cards) {
    const key = card.subject || 'Geral';
    const list = grouped.get(key) || [];
    list.push(card);
    grouped.set(key, list);
  }

  let cardCounter = 1;
  for (const [subject, cards] of grouped.entries()) {
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(2, 132, 199);
    doc.text(`${subject} (${cards.length})`, margin, y);
    y += 7;

    for (const card of cards) {
      const frontText =
        card.modality === 'cloze' && card.clozeText
          ? `Frente (Cloze): ${card.clozeText}`
          : `Frente: ${card.front}`;
      const backText = `Verso: ${card.back}`;
      const refText = `Ref.: ${card.reference.authorOrInstitution}. ${card.reference.title}. ${card.reference.sourceOrJournal} (${card.reference.year})${
        card.reference.identifier ? ` · ${card.reference.identifier}` : ''
      }${card.reference.verified ? '' : ' [Não verificada externamente]'}`;

      const frontLines = doc.splitTextToSize(frontText, maxLineWidth - 6);
      const backLines = doc.splitTextToSize(backText, maxLineWidth - 6);
      const refLines = doc.splitTextToSize(refText, maxLineWidth - 6);

      const estimatedHeight =
        10 + frontLines.length * 4.8 + backLines.length * 4.8 + refLines.length * 4 + (card.imageDataUrl ? 48 : 0);
      ensureSpace(Math.min(estimatedHeight, 120));

      // Meta line
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `#${cardCounter++}  ·  ${card.importance.toUpperCase()}  ·  ${card.modality.toUpperCase()}`,
        margin,
        y
      );
      y += 4.5;

      // Front
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      doc.text(frontLines, margin + 2, y);
      y += frontLines.length * 4.8 + 1.5;

      // Embedded image if Image Occlusion
      if (card.imageDataUrl) {
        try {
          const formatMatch = /^data:image\/(png|jpeg|jpg)/i.exec(card.imageDataUrl);
          const imgFmt = formatMatch?.[1]?.toUpperCase() === 'PNG' ? 'PNG' : 'JPEG';
          ensureSpace(45);
          doc.addImage(card.imageDataUrl, imgFmt, margin + 2, y, 60, 40);
          y += 43;
        } catch {
          // ignore unrenderable image format
        }
      }

      // Back
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(backLines, margin + 2, y);
      y += backLines.length * 4.8 + 1.5;

      // Outdated alert
      if (card.outdatedAlert?.isOutdated) {
        const alertLines = doc.splitTextToSize(
          `Atualização científica: ${card.outdatedAlert.reason || ''} -> Vigente: ${
            card.outdatedAlert.updatedRecommendation || ''
          }`,
          maxLineWidth - 6
        );
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(180, 83, 9);
        doc.text(alertLines, margin + 2, y);
        y += alertLines.length * 4 + 1.5;
      }

      // Reference
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(refLines, margin + 2, y);
      y += refLines.length * 3.8 + 4;

      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
    }
  }

  const safeFileName = deck.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '') || 'flashcards';
  doc.save(`${safeFileName}.pdf`);
}
