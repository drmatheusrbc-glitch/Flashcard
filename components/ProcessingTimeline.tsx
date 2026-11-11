'use client';

import React from 'react';
import { Check, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react';
import type { PipelineProgressEvent, PipelineStageId } from '@/lib/types';

const STAGES: Array<{ id: PipelineStageId; index: number; title: string }> = [
  { id: 'compreensao', index: 1, title: '1. Analisando documento' },
  { id: 'mapeamento', index: 2, title: '2. Identificando os principais temas' },
  { id: 'priorizacao', index: 3, title: '3. Organizando os conhecimentos' },
  { id: 'validacao', index: 4, title: '4. Verificando referências científicas' },
  { id: 'elaboracao', index: 5, title: '5. Criando os flashcards' },
  { id: 'qualidade', index: 6, title: '6. Revisando a qualidade dos cartões' },
  { id: 'cobertura', index: 7, title: '7. Verificando cobertura do conteúdo' },
  { id: 'finalizacao', index: 8, title: '8. Finalizando o material' },
];

interface ProcessingTimelineProps {
  currentEvent: PipelineProgressEvent | null;
  history: PipelineProgressEvent[];
  onRetry: () => void;
  onCancel: () => void;
}

export function ProcessingTimeline({
  currentEvent,
  history,
  onRetry,
  onCancel,
}: ProcessingTimelineProps) {
  const activeIndex = currentEvent?.stageIndex || 1;
  const hasError = Boolean(currentEvent?.error);

  const detailByStage = new Map<PipelineStageId, string>();
  for (const evt of history) {
    detailByStage.set(evt.stage, evt.detail);
  }

  return (
    <section className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-8">
      <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {hasError ? 'Interrupção no processamento' : 'Processamento estruturado em andamento'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {hasError
              ? 'Ocorreu uma falha na etapa abaixo. Você pode tentar novamente sem reenviar seus arquivos.'
              : 'Cada etapa reflete o processamento real do documento, validação científica e auditoria de qualidade.'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
            Etapa {activeIndex} de 8
          </span>
        </div>
      </div>

      <ol className="mt-6 space-y-4">
        {STAGES.map((stage) => {
          const isCompleted = !hasError && activeIndex > stage.index;
          const isCurrent = activeIndex === stage.index;
          const isFailed = hasError && isCurrent;
          const detail = detailByStage.get(stage.id);

          return (
            <li
              key={stage.id}
              className={`flex items-start gap-4 p-3.5 rounded-lg border transition-colors ${
                isFailed
                  ? 'bg-red-50/60 border-red-200'
                  : isCurrent
                    ? 'bg-sky-50/60 border-sky-200'
                    : isCompleted
                      ? 'bg-slate-50/60 border-slate-200'
                      : 'bg-white border-slate-100 opacity-60'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isFailed ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-100 text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                ) : isCompleted ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                    <Check className="h-4 w-4" />
                  </span>
                ) : isCurrent ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-100 text-sky-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 font-mono text-xs tabular-nums">
                    {stage.index}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{stage.title}</p>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {isFailed
                      ? 'Erro'
                      : isCompleted
                        ? 'Concluída'
                        : isCurrent
                          ? 'Em execução'
                          : 'Aguardando'}
                  </span>
                </div>
                {detail && (
                  <p className={`mt-1 text-xs leading-relaxed ${isFailed ? 'text-red-700' : 'text-slate-600'}`}>
                    {detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {hasError && currentEvent?.error && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-semibold text-red-900">Detalhes técnicos do erro</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-red-800">
            {currentEvent.error}
          </p>
        </div>
      )}

      {hasError && (
        <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Voltar ao formulário
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      )}
    </section>
  );
}
