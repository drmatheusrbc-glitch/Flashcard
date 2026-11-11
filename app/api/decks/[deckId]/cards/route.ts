import { NextResponse } from 'next/server';
import {
  addDeckCard,
  deleteDeckCard,
  getOrCreateSession,
  getUserDeck,
  updateDeckCard,
} from '@/lib/storage';
import { regenerateSingleCard } from '@/lib/ai/pipeline';
import type { Flashcard } from '@/lib/types';

export async function POST(
  req: Request,
  context: { params: Promise<{ deckId: string }> }
) {
  const session = await getOrCreateSession();
  const { deckId } = await context.params;
  const body = await req.json();

  if (!body.front || !body.back) {
    return NextResponse.json({ error: 'Frente e verso são obrigatórios.' }, { status: 400 });
  }

  const deck = await addDeckCard(session.userId, deckId, {
    front: String(body.front).trim(),
    back: String(body.back).trim(),
    clozeText: body.clozeText ? String(body.clozeText).trim() : undefined,
    modality: body.modality || 'tradicional',
    importance: body.importance || 'importante',
    subject: body.subject ? String(body.subject).trim() : 'Geral',
    subtopic: body.subtopic ? String(body.subtopic).trim() : undefined,
    imageDataUrl: body.imageDataUrl || undefined,
    occlusionRegions: Array.isArray(body.occlusionRegions) ? body.occlusionRegions : undefined,
    reference: body.reference || {
      authorOrInstitution: 'Adicionado manualmente',
      title: 'Nota do estudante',
      sourceOrJournal: 'Material próprio',
      year: String(new Date().getFullYear()),
      verified: false,
      note: 'Cartão criado manualmente pelo usuário.',
    },
    qualityChecksPassed: true,
  });

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
  const body = await req.json();
  const { cardId, patch } = body as { cardId: string; patch: Partial<Flashcard> };

  if (!cardId || !patch) {
    return NextResponse.json({ error: 'Dados de atualização inválidos.' }, { status: 400 });
  }

  const deck = await updateDeckCard(session.userId, deckId, cardId, patch);
  if (!deck) {
    return NextResponse.json({ error: 'Baralho ou cartão não encontrado.' }, { status: 404 });
  }
  return NextResponse.json({ deck });
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ deckId: string }> }
) {
  const session = await getOrCreateSession();
  const { deckId } = await context.params;
  const { cardId } = (await req.json()) as { cardId: string };

  const deck = await getUserDeck(session.userId, deckId);
  if (!deck) {
    return NextResponse.json({ error: 'Baralho não encontrado.' }, { status: 404 });
  }
  const existing = deck.cards.find((c) => c.id === cardId);
  if (!existing) {
    return NextResponse.json({ error: 'Cartão não encontrado.' }, { status: 404 });
  }

  const regenerated = await regenerateSingleCard(existing, deck.language);
  const updatedDeck = await updateDeckCard(session.userId, deckId, cardId, {
    front: regenerated.front,
    back: regenerated.back,
    clozeText: regenerated.clozeText,
  });

  return NextResponse.json({ deck: updatedDeck });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ deckId: string }> }
) {
  const session = await getOrCreateSession();
  const { deckId } = await context.params;
  const { searchParams } = new URL(req.url);
  const cardId = searchParams.get('cardId');

  if (!cardId) {
    return NextResponse.json({ error: 'cardId é obrigatório.' }, { status: 400 });
  }

  const deck = await deleteDeckCard(session.userId, deckId, cardId);
  if (!deck) {
    return NextResponse.json({ error: 'Baralho não encontrado.' }, { status: 404 });
  }
  return NextResponse.json({ deck });
}
