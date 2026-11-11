import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="pt-BR">
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased selection:bg-[#0284C7]/15 selection:text-[#0F172A]"
      >
        {children}
      </body>
    </html>
  );
}
