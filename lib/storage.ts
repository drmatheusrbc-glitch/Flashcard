import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import type { Deck, Flashcard, UserSession } from './types';

// Temporary storage for serverless environments such as Vercel. Contents are ephemeral.
const DATA_ROOT = path.join(tmpdir(), 'cardexis', 'workspaces');
const SESSION_COOKIE = 'cardexis_session';

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

async function ensureUserDir(userId: string): Promise<string> {
  const safeId = sanitizeId(userId);
  const dir = path.join(DATA_ROOT, safeId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function getOrCreateSession(): Promise<UserSession> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as UserSession;
      if (parsed && typeof parsed.userId === 'string' && parsed.userId.length > 0) {
        return parsed;
      }
    } catch {
      // fall through to default
    }
  }
  return {
    userId: 'workspace-local',
    name: 'Espaço de Estudo',
  };
}

export function encodeSessionCookie(session: UserSession): string {
  return Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export async function listUserDecks(userId: string): Promise<Deck[]> {
  const dir = await ensureUserDir(userId);
  const files = await fs.readdir(dir);
  const decks: Deck[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await fs.readFile(path.join(dir, file), 'utf8');
      const deck = JSON.parse(content) as Deck;
      if (deck.userId === sanitizeId(userId) || deck.userId === userId) {
        decks.push(deck);
      }
    } catch {
      // skip corrupted file
    }
  }
  return decks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getUserDeck(userId: string, deckId: string): Promise<Deck | null> {
  const dir = await ensureUserDir(userId);
  const safeDeckId = sanitizeId(deckId);
  const filePath = path.join(dir, `${safeDeckId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const deck = JSON.parse(content) as Deck;
    if (deck.userId !== userId && deck.userId !== sanitizeId(userId)) {
      return null;
    }
    return deck;
  } catch {
    return null;
  }
}

export async function saveUserDeck(deck: Deck): Promise<Deck> {
  const dir = await ensureUserDir(deck.userId);
  const safeDeckId = sanitizeId(deck.id);
  const updated: Deck = {
    ...deck,
    id: safeDeckId,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(dir, `${safeDeckId}.json`), JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

export async function deleteUserDeck(userId: string, deckId: string): Promise<boolean> {
  const dir = await ensureUserDir(userId);
  const safeDeckId = sanitizeId(deckId);
  try {
    await fs.unlink(path.join(dir, `${safeDeckId}.json`));
    return true;
  } catch {
    return false;
  }
}

export async function updateDeckCard(
  userId: string,
  deckId: string,
  cardId: string,
  patch: Partial<Flashcard>
): Promise<Deck | null> {
  const deck = await getUserDeck(userId, deckId);
  if (!deck) return null;
  const now = new Date().toISOString();
  const cards = deck.cards.map((c) => (c.id === cardId ? { ...c, ...patch, updatedAt: now } : c));
  return saveUserDeck({ ...deck, cards });
}

export async function deleteDeckCard(
  userId: string,
  deckId: string,
  cardId: string
): Promise<Deck | null> {
  const deck = await getUserDeck(userId, deckId);
  if (!deck) return null;
  const cards = deck.cards.filter((c) => c.id !== cardId);
  return saveUserDeck({ ...deck, cards });
}

export async function addDeckCard(
  userId: string,
  deckId: string,
  card: Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Deck | null> {
  const deck = await getUserDeck(userId, deckId);
  if (!deck) return null;
  const now = new Date().toISOString();
  const newCard: Flashcard = {
    ...card,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  return saveUserDeck({ ...deck, cards: [newCard, ...deck.cards] });
}
