import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { encodeSessionCookie, getOrCreateSession, SESSION_COOKIE_NAME } from '@/lib/storage';

const SessionSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email().optional().or(z.literal('')),
});

export async function GET() {
  const session = await getOrCreateSession();
  return NextResponse.json({ session });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = SessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Informe um nome válido (2 a 60 caracteres) e e-mail opcional válido.' },
        { status: 400 }
      );
    }

    const identitySeed = parsed.data.email?.trim().toLowerCase() || parsed.data.name.trim().toLowerCase();
    const userId = `usr_${crypto.createHash('sha256').update(identitySeed).digest('hex').slice(0, 16)}`;
    const session = {
      userId,
      name: parsed.data.name.trim(),
      email: parsed.data.email?.trim() || undefined,
    };

    const res = NextResponse.json({ session });
    res.cookies.set(SESSION_COOKIE_NAME, encodeSessionCookie(session), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Falha ao atualizar espaço de trabalho.' }, { status: 500 });
  }
}
