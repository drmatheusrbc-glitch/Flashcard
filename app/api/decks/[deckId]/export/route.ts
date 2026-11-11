import { getOrCreateSession, getUserDeck } from '@/lib/storage';
import { generateApkgBuffer } from '@/lib/export/apkg';
import { generateTxtExport } from '@/lib/export/txt';

export async function GET(
  req: Request,
  context: { params: Promise<{ deckId: string }> }
) {
  const session = await getOrCreateSession();
  const { deckId } = await context.params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'apkg';

  const deck = await getUserDeck(session.userId, deckId);
  if (!deck) {
    return new Response(JSON.stringify({ error: 'Baralho não encontrado.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const safeName =
    deck.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '') || 'flashcards';

  if (format === 'txt') {
    const txt = generateTxtExport(deck);
    return new Response(txt, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}.txt"`,
      },
    });
  }

  if (format === 'apkg') {
    const buffer = await generateApkgBuffer(deck);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}.apkg"`,
      },
    });
  }

  return new Response(JSON.stringify({ error: 'Formato não suportado.' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}
