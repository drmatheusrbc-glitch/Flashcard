import { NextResponse } from 'next/server';
import { deleteUserDeck, getOrCreateSession, getUserDeck, saveUserDeck } from '@/lib/storage';

export async function GET(
  _req: Request,
  context: { params: Promise<{ deckId: string }> }
) {
  const session = await getOrCreateSession();
  const { deckId } = await context.params;
  const deck = await getUserDeck(session.userId, deckId);
  if (!deck) {
    return NextResponse.json({ error: 'Baralho não encontrado.' }, { status: 404 });
  }
  return NextResponse.json({ deck });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ deckId: string }> }
) {
  const session = await getOrCreateSession();
  const { deckId } = await context.params;
  const deck = await getUserDeck(session.userId, deckId);
  if (!deck) {
    return NextResponse.json({ error: 'Baralho não encontrado.' }, { status: 404 });
  }
  const body = await req.json();
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : deck.title;
  const updated = await saveUserDeck({ ...deck, title });
  return NextResponse.json({ deck: updated });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ deckId: string }> }
) {
  const session = await getOrCreateSession();
  const { deckId } = await context.params;
  const deleted = await deleteUserDeck(session.userId, deckId);
  if (!deleted) {
    return NextResponse.json({ error: 'Baralho não encontrado.' }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
