import { del, get } from '@vercel/blob';
import { z } from 'zod';
import { getOrCreateSession, saveUserDeck } from '@/lib/storage';
import { runFlashcardPipeline } from '@/lib/ai/pipeline';
import type { GenerationConfig, PipelineProgressEvent } from '@/lib/types';

export const maxDuration = 300;

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ConfigSchema = z.object({
  inputMode: z.enum(['exam', 'summary', 'text']),
  title: z.string().max(120).optional(),
  targetCount: z.number().int().min(1).max(150).optional(),
  depth: z.enum(['basico', 'intermediario', 'avancado']).default('intermediario'),
  language: z.string().min(2).max(40).default('Português (BR)'),
  formatPreference: z.enum(['tradicional', 'cloze', 'ambos']).default('ambos'),
});

const RequestSchema = z.object({
  config: z.unknown(),
  textContent: z.string().max(200000).optional().default(''),
  files: z.object({
    examPdf: z.string().optional(),
    answerKeyPdf: z.string().optional(),
    summaryPdf: z.string().optional(),
    imageFile: z.string().optional(),
  }).default({}),
  fileNames: z.record(z.string(), z.string().max(180)).optional().default({}),
});

async function blobToBase64(pathname: string, maxBytes: number, allowedTypes: string[], label: string) {
  if (!pathname.startsWith('cardexis/uploads/') || pathname.includes('..') || pathname.length > 180) {
    throw new Error(`Referência inválida para "${label}".`);
  }
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error(`Arquivo não encontrado: ${label}.`);
  if (result.blob.size <= 0 || result.blob.size > maxBytes) throw new Error(`O arquivo "${label}" excede o limite permitido.`);
  if (!allowedTypes.includes(result.blob.contentType.toLowerCase())) throw new Error(`Formato inválido para "${label}".`);
  const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error(`O arquivo "${label}" excede o limite permitido.`);
  return bytes.toString('base64');
}

export async function POST(req: Request) {
  const session = await getOrCreateSession();
  const uploadedPaths: string[] = [];

  try {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (origin && host && new URL(origin).host !== host) {
      return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
    }

    const raw = await req.json();
    const parsedRequest = RequestSchema.safeParse(raw);
    if (!parsedRequest.success) return Response.json({ error: 'Dados de geração inválidos.' }, { status: 400 });

    const parsedConfig = ConfigSchema.safeParse(parsedRequest.data.config);
    if (!parsedConfig.success) return Response.json({ error: 'Parâmetros de geração inválidos.', details: parsedConfig.error.flatten() }, { status: 400 });

    const config: GenerationConfig = parsedConfig.data;
    const files = parsedRequest.data.files;
    const textContent = parsedRequest.data.textContent || '';

    for (const pathname of Object.values(files)) if (pathname) uploadedPaths.push(pathname);

    if (config.inputMode === 'exam' && !files.examPdf) throw new Error('Na modalidade Prova, anexe ao menos o PDF da prova.');
    if (config.inputMode === 'summary' && !files.summaryPdf) throw new Error('Na modalidade Resumo/Apostila, anexe o arquivo PDF do material.');
    if (config.inputMode === 'text' && textContent.trim().length < 20 && !files.imageFile) throw new Error('Cole um texto com pelo menos 20 caracteres ou anexe uma imagem.');

    const [examPdfBase64, answerKeyPdfBase64, summaryPdfBase64, imageBase64] = await Promise.all([
      files.examPdf ? blobToBase64(files.examPdf, MAX_PDF_BYTES, ['application/pdf'], 'PDF da Prova') : undefined,
      files.answerKeyPdf ? blobToBase64(files.answerKeyPdf, MAX_PDF_BYTES, ['application/pdf'], 'PDF do Gabarito') : undefined,
      files.summaryPdf ? blobToBase64(files.summaryPdf, MAX_PDF_BYTES, ['application/pdf'], 'PDF do Resumo/Apostila') : undefined,
      files.imageFile ? blobToBase64(files.imageFile, MAX_IMAGE_BYTES, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], 'Imagem para Oclusão') : undefined,
    ]);

    const imageMimeType = files.imageFile ? (await get(files.imageFile, { access: 'private' }))?.blob.contentType ?? undefined : undefined;
    const imageDataUrl = imageBase64 && imageMimeType ? `data:${imageMimeType};base64,${imageBase64}` : undefined;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (evt: PipelineProgressEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        let lastStage: PipelineProgressEvent['stage'] = 'compreensao';
        let lastStageIndex = 1;
        try {
          const deck = await runFlashcardPipeline({
            config,
            userId: session.userId,
            textContent,
            examPdfBase64,
            examPdfName: parsedRequest.data.fileNames.examPdf,
            answerKeyPdfBase64,
            answerKeyPdfName: parsedRequest.data.fileNames.answerKeyPdf,
            summaryPdfBase64,
            summaryPdfName: parsedRequest.data.fileNames.summaryPdf,
            imageBase64,
            imageMimeType,
            imageDataUrl,
          }, (evt) => {
            lastStage = evt.stage;
            lastStageIndex = evt.stageIndex;
            sendEvent(evt);
          });
          const savedDeck = await saveUserDeck(deck);
          sendEvent({ stage: 'finalizacao', stageIndex: 8, totalStages: 8, label: 'Concluído', detail: `${savedDeck.cards.length} flashcards salvos no seu baralho.`, completed: true, deck: savedDeck });
        } catch (err) {
          const { formatAiError } = await import('@/lib/ai/client');
          const message = formatAiError(err);
          sendEvent({ stage: lastStage, stageIndex: lastStageIndex, totalStages: 8, label: 'Falha no processamento', detail: message, error: message });
        } finally {
          try { if (uploadedPaths.length) await del(uploadedPaths); }
          catch (cleanupError) { console.error('Falha ao remover uploads temporários do Blob:', cleanupError); }
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
  } catch (err) {
    try { if (uploadedPaths.length) await del(uploadedPaths); }
    catch (cleanupError) { console.error('Falha ao remover uploads temporários do Blob:', cleanupError); }
    const message = err instanceof Error ? err.message : 'Erro ao validar dados enviados.';
    return Response.json({ error: message }, { status: 400 });
  }
}
