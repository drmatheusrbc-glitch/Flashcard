'use client';

import React from 'react';

const PILLARS = [
  {
    index: '01',
    title: 'Princípio da Informação Mínima',
    description:
      'Cada flashcard testa apenas uma unidade atômica de conhecimento, com perguntas diretas e respostas curtas para evitar a ilusão de competência.',
  },
  {
    index: '02',
    title: 'Cloze Deletion & Ancoragem de Contexto',
    description:
      'Lacunas {{c1::...}} isolam critérios, doses, fórmulas e valores de referência mantendo contexto suficiente para recuperação ativa sem ambiguidade.',
  },
  {
    index: '03',
    title: 'Oclusão de Imagens (Image Occlusion)',
    description:
      'Preserva a imagem original e gera máscaras interativas sobre estruturas anatômicas, fluxogramas ou diagramas, com exportação compatível com Anki.',
  },
  {
    index: '04',
    title: 'Rigor Científico e Atualização de Gabaritos',
    description:
      'Verifica diretrizes atuais com fontes primárias. Quando um gabarito ou texto está desatualizado, preserva o histórico, explica a divergência e corrige o cartão.',
  },
  {
    index: '05',
    title: 'Auditoria de Qualidade em 10 Critérios',
    description:
      'Antes da entrega, todos os cartões passam por revisão automatizada de atomicidade, redundância, rastreabilidade bibliográfica e cobertura temática.',
  },
];

export function MethodologyPanel() {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold text-slate-900">
          Metodologia pedagógica e rigor científico
        </h2>
        <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
          Diferente de conversores genéricos de texto em perguntas, a plataforma executa um pipeline de 8 etapas
          fundamentado na ciência da aprendizagem e na verificação de fontes primárias.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
        {PILLARS.map((pillar) => (
          <div key={pillar.index} className="space-y-2 pt-4 border-t border-slate-200">
            <span className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
              {pillar.index}
            </span>
            <h3 className="text-sm font-semibold text-slate-900">{pillar.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{pillar.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
