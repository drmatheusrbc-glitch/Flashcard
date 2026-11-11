import { NextResponse } from 'next/server';
import { getOrCreateSession, listUserDecks } from '@/lib/storage';

export async function GET() {
  const session = await getOrCreateSession();
  const decks = await listUserDecks(session.userId);
  const summaries = decks.map((d) => ({
    id: d.id,
    title: d.title,
    inputMode: d.inputMode,
    depth: d.depth,
    language: d.language,
    cardCount: d.cards.length,
    outdatedCount: d.cards.filter((c) => c.outdatedAlert?.isOutdated).length,
    coverageReport: d.coverageReport,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
  return NextResponse.json({ decks: summaries });
}
