import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface ExtractedExamQuestion {
  questionNumber: string;
  text: string;
  officialAnswer: string;
}

export interface ExtractedExam {
  pageCount: number;
  questions: ExtractedExamQuestion[];
  answerKeyFound: number;
  answerKey: Record<string, string>;
  extractedTextLength: number;
}

function normalizePdfText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractAnswerKey(text: string): Map<number, string> {
  const marker = text.search(/\bRESPOSTAS\b/i);
  const answerSection = marker >= 0 ? text.slice(marker) : '';
  const answers = new Map<number, string>();
  // Gabaritos em grade podem colocar várias colunas na mesma linha.
  for (const line of answerSection.split('\n')) {
    const matches = [...line.matchAll(/(?:^|\s)(\d{1,3})\s*\.\s*([A-D]{1,4})(?=\s|$)/g)];
    for (const match of matches) {
      const number = Number(match[1]);
      if (number >= 1 && number <= 300) answers.set(number, match[2]);
    }
  }
  return answers;
}

export async function extractExamFromPdf(base64: string): Promise<ExtractedExam> {
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  const loadingTask = getDocument({
    data: bytes,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let currentY: number | undefined;
      let line = '';
      const lines: string[] = [];
      for (const rawItem of content.items) {
        const item = rawItem as { str?: string; transform?: number[] };
        if (typeof item.str !== 'string' || !item.str.trim()) continue;
        const y = item.transform?.[5];
        if (typeof y === 'number' && typeof currentY === 'number' && Math.abs(y - currentY) > 2.5) {
          if (line.trim()) lines.push(line.trim());
          line = '';
        }
        if (typeof y === 'number') currentY = y;
        line += (line ? ' ' : '') + item.str;
      }
      if (line.trim()) lines.push(line.trim());
      pageTexts.push(lines.join('\n'));
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  const fullText = normalizePdfText(pageTexts.join('\n\n'));
  const answerKey = extractAnswerKey(fullText);
  const questionMatches = [...fullText.matchAll(/\bQUEST(?:Ã|A)O\s*(\d{1,3})\s*\./gi)];
  const questions: ExtractedExamQuestion[] = [];

  for (let index = 0; index < questionMatches.length; index++) {
    const match = questionMatches[index];
    const number = Number(match[1]);
    if (!Number.isInteger(number) || number < 1 || number > 300) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < questionMatches.length
      ? (questionMatches[index + 1].index ?? fullText.length)
      : fullText.search(/\bGABARITO\b/i) >= 0
        ? fullText.search(/\bGABARITO\b/i)
        : fullText.length;
    const questionText = normalizePdfText(fullText.slice(start, end));
    if (questionText.length < 20) continue;
    questions.push({
      questionNumber: String(number),
      text: questionText,
      officialAnswer: answerKey.get(number) ?? 'Não identificado no gabarito do PDF',
    });
  }

  const unique = new Map<number, ExtractedExamQuestion>();
  for (const question of questions) {
    const number = Number(question.questionNumber);
    const existing = unique.get(number);
    if (!existing || question.text.length > existing.text.length) unique.set(number, question);
  }
  const ordered = [...unique.values()].sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber));

  return {
    pageCount: pdf.numPages,
    questions: ordered,
    answerKeyFound: answerKey.size,
    answerKey: Object.fromEntries(answerKey.entries()),
    extractedTextLength: fullText.length,
  };
}
