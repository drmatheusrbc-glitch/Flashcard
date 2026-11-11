import { z } from 'zod';
import { getOrCreateSession, saveUserDeck } from '@/lib/storage';
import { runFlashcardPipeline } from '@/lib/ai/pipeline';
import type { GenerationConfig, PipelineProgressEvent } from '@/lib/types';

export const maxDuration = 300;

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

const ConfigSchema = z.object({
  inputMode: z.enum(['exam', 'summary', 'text']),
  title: z.string().max(120).optional(),
  targetCount: z.number().int().min(1).max(150).optional(),
  depth: z.enum(['basico', 'intermediario', 'avancado']).default('intermediario'),
  language: z.string().min(2).max(40).default('Português (BR)'),
  formatPreference: z.enum(['tradicional', 'cloze', 'ambos']).default('ambos'),
});

async function fileToBase64(file: File, maxBytes: number, allowedPrefix: string, label: string) {
  if (file.size === 0) {
    throw new Error(`O arquivo "${label}" está vazio.`);
  }
  if (file.size > maxBytes) {
    throw new Error(
      `O arquivo "${label}" excede o limite máximo de ${Math.round(maxBytes / (1024 * 1024))}MB.`
    );
  }
  if (!file.type.startsWith(allowedPrefix)) {
    throw new Error(`Formato inválido para "${label}". Tipo recebido: ${file.type || 'desconhecido'}.`);
  }
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

export async function POST(req: Request) {
  const session = await getOrCreateSession();

  try {
    const formData = await req.formData();
    const rawConfig = formData.get('config');
    if (typeof rawConfig !== 'string') {
      return new Response(JSON.stringify({ error: 'Configuração de geração ausente.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsedConfig = ConfigSchema.safeParse(JSON.parse(rawConfig));
    if (!parsedConfig.success) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros de geração inválidos.', details: parsedConfig.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const config: GenerationConfig = parsedConfig.data;
    const textContent = (formData.get('textContent') as string | null) || '';
    const examPdf = formData.get('examPdf') as File | null;
    const answerKeyPdf = formData.get('answerKeyPdf') as File | null;
    const summaryPdf = formData.get('summaryPdf') as File | null;
    const imageFile = formData.get('imageFile') as File | null;

    if (config.inputMode === 'exam' && (!examPdf || examPdf.size === 0)) {
      return new Response(
        JSON.stringify({ error: 'Na modalidade Prova, anexe ao menos o PDF da prova.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (config.inputMode === 'summary' && (!summaryPdf || summaryPdf.size === 0)) {
      return new Response(
        JSON.stringify({ error: 'Na modalidade Resumo/Apostila, anexe o arquivo PDF do material.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (config.inputMode === 'text' && textContent.trim().length < 20 && (!imageFile || imageFile.size === 0)) {
      return new Response(
        JSON.stringify({ error: 'Cole um texto com pelo menos 20 caracteres ou anexe uma imagem.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const examPdfBase64 = examPdf && examPdf.size > 0
      ? await fileToBase64(examPdf, MAX_PDF_BYTES, 'application/pdf', 'PDF da Prova')
      : undefined;
    const answerKeyPdfBase64 = answerKeyPdf && answerKeyPdf.size > 0
      ? await fileToBase64(answerKeyPdf, MAX_PDF_BYTES, 'application/pdf', 'PDF do Gabarito')
      : undefined;
    const summaryPdfBase64 = summaryPdf && summaryPdf.size > 0
      ? await fileToBase64(summaryPdf, MAX_PDF_BYTES, 'application/pdf', 'PDF do Resumo/Apostila')
      : undefined;

    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    let imageDataUrl: string | undefined;
    if (imageFile && imageFile.size > 0) {
      imageBase64 = await fileToBase64(imageFile, MAX_IMAGE_BYTES, 'image/', 'Imagem para Oclusão');
      imageMimeType = imageFile.type;
      imageDataUrl = `data:${imageMimeType};base64,${imageBase64}`;
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (evt: PipelineProgressEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        };

        let lastStage: PipelineProgressEvent['stage'] = 'compreensao';
        let lastStageIndex = 1;

        try {
          const deck = await runFlashcardPipeline(
            {
              config,
              userId: session.userId,
              textContent,
              examPdfBase64,
              examPdfName: examPdf?.name,
              answerKeyPdfBase64,
              answerKeyPdfName: answerKeyPdf?.name,
              summaryPdfBase64,
              summaryPdfName: summaryPdf?.name,
              imageBase64,
              imageMimeType,
              imageDataUrl,
            },
            (evt) => {
              lastStage = evt.stage;
              lastStageIndex = evt.stageIndex;
              sendEvent(evt);
            }
          );

          const savedDeck = await saveUserDeck(deck);
          sendEvent({
            stage: 'finalizacao',
            stageIndex: 8,
            totalStages: 8,
            label: 'Concluído',
            detail: `${savedDeck.cards.length} flashcards salvos no seu baralho.`,
            completed: true,
            deck: savedDeck,
          });
        } catch (err) {
          const { formatAiError } = await import('@/lib/ai/client');
          const message = formatAiError(err);
          sendEvent({
            stage: lastStage,
            stageIndex: lastStageIndex,
            totalStages: 8,
            label: 'Falha no processamento',
            detail: message,
            error: message,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao validar arquivos enviados.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
