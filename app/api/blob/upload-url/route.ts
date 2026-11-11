import { issueSignedToken, presignUrl } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getOrCreateSession } from '@/lib/storage';

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_KINDS = ['examPdf', 'answerKeyPdf', 'summaryPdf', 'imageFile'] as const;

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
    }

    await getOrCreateSession();
    const body = await request.json() as { fileName?: string; contentType?: string; size?: number; kind?: string };
    if (!ALLOWED_KINDS.includes(body.kind as (typeof ALLOWED_KINDS)[number])) {
      return NextResponse.json({ error: 'Tipo de arquivo inválido.' }, { status: 400 });
    }

    const isImage = body.kind === 'imageFile';
    const contentType = String(body.contentType || '').toLowerCase();
    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
    const size = Number(body.size);

    if (isImage ? !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(contentType) : contentType !== 'application/pdf') {
      return NextResponse.json({ error: 'Formato de arquivo não permitido.' }, { status: 415 });
    }
    if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) {
      return NextResponse.json({ error: `O arquivo deve ter entre 1 byte e ${Math.round(maxBytes / (1024 * 1024))}MB.` }, { status: 413 });
    }

    const pathname = `cardexis/uploads/${randomUUID()}-${isImage ? 'image' : 'document'}`;
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      validUntil,
      maximumSizeInBytes: maxBytes,
      allowedContentTypes: [contentType],
    });
    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: 'put',
      validUntil,
      maximumSizeInBytes: maxBytes,
      allowedContentTypes: [contentType],
      access: 'private',
    });

    return NextResponse.json({ uploadUrl: presignedUrl, pathname, fileName: String(body.fileName || (isImage ? 'image' : 'document')).slice(0, 180), maxBytes });
  } catch (error) {
    console.error('Falha ao preparar upload Blob:', error);
    return NextResponse.json({ error: 'Não foi possível preparar o upload. Verifique a configuração do Vercel Blob.' }, { status: 500 });
  }
}
