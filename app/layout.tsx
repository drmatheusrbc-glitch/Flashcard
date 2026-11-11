import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Cardexis — Criação Inteligente de Flashcards',
  description:
    'Plataforma educacional com inteligência artificial para criação de flashcards de alta precisão científica, Cloze Deletion, Image Occlusion e exportação nativa para Anki (.apkg).',
  openGraph: {
    title: 'Cardexis — Criação Inteligente de Flashcards',
    description:
      'Plataforma educacional com inteligência artificial para criação de flashcards de alta precisão científica, Cloze Deletion, Image Occlusion e exportação nativa para Anki (.apkg).',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cardexis — Criação Inteligente de Flashcards',
    description:
      'Plataforma educacional com inteligência artificial para criação de flashcards de alta precisão científica, Cloze Deletion, Image Occlusion e exportação nativa para Anki (.apkg).',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased selection:bg-[#0284C7]/15 selection:text-[#0F172A]"
      >
        {children}
      </body>
    </html>
  );
}
