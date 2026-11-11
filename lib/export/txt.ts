import type { Deck } from '../types';

export function generateTxtExport(deck: Deck): string {
  const lines: string[] = [
    `BARALHO: ${deck.title}`,
    `COBERTURA: ${deck.coverageReport}`,
    `TOTAL DE CARTÕES: ${deck.cards.length}`,
    `GERADO EM: ${new Date(deck.createdAt).toLocaleString('pt-BR')}`,
    '============================================================',
    '',
  ];

  deck.cards.forEach((card, index) => {
    lines.push(`[#${index + 1}] ASSUNTO: ${card.subject} | IMPORTÂNCIA: ${card.importance.toUpperCase()} | MODALIDADE: ${card.modality.toUpperCase()}`);
    if (card.modality === 'cloze' && card.clozeText) {
      lines.push(`CLOZE: ${card.clozeText}`);
    }
    lines.push(`FRENTE: ${card.front}`);
    lines.push(`VERSO: ${card.back}`);

    if (card.outdatedAlert?.isOutdated) {
      lines.push(
        `ALERTA DE ATUALIZAÇÃO: Original="${card.outdatedAlert.originalAnswerOrClaim || ''}" -> Atual="${card.outdatedAlert.updatedRecommendation || ''}" (${card.outdatedAlert.reason || ''})`
      );
    }

    const ref = card.reference;
    lines.push(
      `REFERÊNCIA: ${ref.authorOrInstitution}. ${ref.title}. ${ref.sourceOrJournal} (${ref.year})${
        ref.identifier ? ` [${ref.identifier}]` : ''
      }${ref.url ? ` - ${ref.url}` : ''}${ref.verified ? '' : ' [Não verificada externamente]'}`
    );
    lines.push('------------------------------------------------------------');
    lines.push('');
  });

  return lines.join('\n');
}
