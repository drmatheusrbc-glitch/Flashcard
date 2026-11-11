import { issueSignedToken, presignUrl } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getOrCreateSession } from '@/lib/storage';

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
    }

    await getOrCreateSession();
    const body = await request.json() as { fileName?: string; contentType?: string; kind?: string };
    const kind = body.kind;
    const isImage = kind === 'imageFile';
    if (!['examPdf', 'answerKeyPdf', 'summaryPdf', 'imageFile'].includes(String(kind))) {
      return NextResponse.json({ error: 'Tipo de arquivo inválido.' }, { status: 400 });
    }
    const contentType = String(body.contentType || '');
    if (isImage ? !contentType.startsWith('image/') : contentType !== 'application/pdf') {
      return NextResponse.json({ error: 'Formato de arquivo não permitido.' }, { status: 415 });
    }

    const pathname = `cardexis/uploads/${randomUUID()}-${isImage ? 'image' : 'document'}`;
    const token = await issueSignedToken({ operations: ['put'] });
    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: 'put',
      validUntil: Date.now() + 10 * 60 * 1000,
      contentType,
    });

    return NextResponse.json({
      uploadUrl: presignedUrl,
      pathname,
      fileName: String(body.fileName || (isImage ? 'image' : 'document')).slice(0, 180),
      maxBytes: isImage ? MAX_IMAGE_BYTES : MAX_PDF_BYTES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível preparar o upload.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
