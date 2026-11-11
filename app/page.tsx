'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Settings2,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import type {
  CardFormatPreference,
  Deck,
  DepthLevel,
  InputMode,
  PipelineProgressEvent,
  UserSession,
} from '@/lib/types';
import { ProcessingTimeline } from '@/components/ProcessingTimeline';
import { DeckViewer } from '@/components/DeckViewer';
import { MethodologyPanel } from '@/components/MethodologyPanel';
import { WorkspaceModal } from '@/components/WorkspaceModal';

interface DeckSummary {
  id: string;
  title: string;
  inputMode: InputMode;
  depth: DepthLevel;
  language: string;
  cardCount: number;
  outdatedCount: number;
  coverageReport: string;
  createdAt: string;
  updatedAt: string;
}

type ActiveSection = 'create' | 'decks' | 'methodology';

export default function HomePage() {
  const [session, setSession] = useState<UserSession>({
    userId: 'workspace-local',
    name: 'Espaço de Estudo',
  });
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);

  const [activeSection, setActiveSection] = useState<ActiveSection>('create');
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);

  // Creation Studio State
  const [inputMode, setInputMode] = useState<InputMode>('exam');
  const [deckTitle, setDeckTitle] = useState('');
  const [examPdf, setExamPdf] = useState<File | null>(null);
  const [answerKeyPdf, setAnswerKeyPdf] = useState<File | null>(null);
  const [summaryPdf, setSummaryPdf] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Optional Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [targetCount, setTargetCount] = useState<string>('');
  const [depth, setDepth] = useState<DepthLevel>('intermediario');
  const [language, setLanguage] = useState('Português (BR)');
  const [formatPreference, setFormatPreference] = useState<CardFormatPreference>('ambos');

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<PipelineProgressEvent | null>(null);
  const [eventHistory, setEventHistory] = useState<PipelineProgressEvent[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [sessRes, decksRes] = await Promise.all([fetch('/api/session'), fetch('/api/decks')]);
      if (sessRes.ok) {
        const sData = await sessRes.json();
        if (sData.session) setSession(sData.session);
      }
      if (decksRes.ok) {
        const dData = await decksRes.json();
        setDecks(dData.decks || []);
      }
    } finally {
      setLoadingDecks(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  const handleOpenDeck = async (deckId: string) => {
    const res = await fetch(`/api/decks/${deckId}`);
    if (res.ok) {
      const data = await res.json();
      setActiveDeck(data.deck);
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    const res = await fetch(`/api/decks/${deckId}`, { method: 'DELETE' });
    if (res.ok) {
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
      if (activeDeck?.id === deckId) setActiveDeck(null);
    }
  };

  const startGeneration = async () => {
    setFormError(null);

    if (inputMode === 'exam' && !examPdf) {
      setFormError('Anexe o PDF da prova para continuar.');
      return;
    }
    if (inputMode === 'summary' && !summaryPdf) {
      setFormError('Anexe o PDF do resumo ou apostila para continuar.');
      return;
    }
    if (inputMode === 'text' && textContent.trim().length < 20 && !imageFile) {
      setFormError('Cole um texto com pelo menos 20 caracteres ou anexe uma imagem.');
      return;
    }

    const selectedFiles: Array<{ kind: 'examPdf' | 'answerKeyPdf' | 'summaryPdf' | 'imageFile'; file: File }> = [];
    if (inputMode === 'exam') {
      if (examPdf) selectedFiles.push({ kind: 'examPdf', file: examPdf });
      if (answerKeyPdf) selectedFiles.push({ kind: 'answerKeyPdf', file: answerKeyPdf });
    } else if (inputMode === 'summary') {
      if (summaryPdf) selectedFiles.push({ kind: 'summaryPdf', file: summaryPdf });
    } else if (imageFile) {
      selectedFiles.push({ kind: 'imageFile', file: imageFile });
    }

    const maxSize = (kind: string) => kind === 'imageFile' ? 8 * 1024 * 1024 : 20 * 1024 * 1024;
    for (const item of selectedFiles) {
      if (item.file.size <= 0 || item.file.size > maxSize(item.kind)) {
        setFormError(`O arquivo "${item.file.name}" está vazio ou excede o limite de ${item.kind === 'imageFile' ? '8MB' : '20MB'}.`);
        return;
      }
    }

    setIsProcessing(true);
    setEventHistory([]);
    setCurrentEvent({
      stage: 'compreensao',
      stageIndex: 1,
      totalStages: 8,
      label: 'Preparando arquivos',
      detail: 'Enviando os arquivos diretamente ao armazenamento seguro...',
    });

    try {
      const files: Record<string, string> = {};
      const fileNames: Record<string, string> = {};

      for (const item of selectedFiles) {
        const urlResponse = await fetch('/api/blob/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: item.kind,
            fileName: item.file.name,
            contentType: item.file.type || (item.kind === 'imageFile' ? '' : 'application/pdf'),
            size: item.file.size,
          }),
        });
        const urlData = await urlResponse.json();
        if (!urlResponse.ok) throw new Error(urlData.error || 'Não foi possível preparar o envio do arquivo.');

        const uploadResponse = await fetch(urlData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': item.file.type || (item.kind === 'imageFile' ? '' : 'application/pdf') },
          body: item.file,
        });
        if (!uploadResponse.ok) {
          const detail = await uploadResponse.text().catch(() => '');
          throw new Error(`Falha no upload de "${item.file.name}" (HTTP ${uploadResponse.status}). ${detail.slice(0, 240)}`);
        }
        files[item.kind] = urlData.pathname;
        fileNames[item.kind] = item.file.name;
      }

      setCurrentEvent({
        stage: 'compreensao',
        stageIndex: 1,
        totalStages: 8,
        label: 'Analisando documento',
        detail: 'Arquivos enviados. Iniciando a geração dos flashcards...',
      });

      const parsedTarget = targetCount.trim() ? parseInt(targetCount.trim(), 10) : undefined;
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            inputMode,
            title: deckTitle.trim() || undefined,
            targetCount: parsedTarget && !Number.isNaN(parsedTarget) ? parsedTarget : undefined,
            depth,
            language,
            formatPreference,
          },
          textContent: inputMode === 'text' ? textContent : '',
          files,
          fileNames,
        }),
      });

      if (!response.ok || !response.body) {
        const responseText = await response.text().catch(() => '');
        let serverMessage = '';
        if (responseText) {
          try {
            const errData = JSON.parse(responseText) as { error?: string; message?: string };
            serverMessage = errData.error || errData.message || '';
          } catch {
            serverMessage = responseText.replace(/\\s+/g, ' ').slice(0, 600);
          }
        }
        const statusInfo = `HTTP ${response.status}${response.statusText ? ` — ${response.statusText}` : ''}`;
        throw new Error(serverMessage ? `${statusInfo}: ${serverMessage}` : `${statusInfo}: O servidor não retornou detalhes.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\\n\\n');
        buffer = parts.pop() || '';
        for (const chunk of parts) {
          const line = chunk.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          const evt = JSON.parse(jsonStr) as PipelineProgressEvent;
          setCurrentEvent(evt);
          setEventHistory((prev) => [...prev, evt]);
          if (evt.error) {
            finished = true;
          } else if (evt.completed && evt.deck) {
            finished = true;
            setActiveDeck(evt.deck);
            setIsProcessing(false);
            void loadWorkspaceData();
          }
        }
      }
      if (!finished) throw new Error('A conexão com o servidor foi encerrada antes da conclusão. Tente novamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro durante a geração dos flashcards.';
      setCurrentEvent((prev) => ({
        stage: prev?.stage || 'compreensao',
        stageIndex: prev?.stageIndex || 1,
        totalStages: 8,
        label: 'Erro no processamento',
        detail: message,
        error: message,
      }));
    }
  };

  const modeLabel = (m: InputMode) =>
    m === 'exam' ? 'Prova + Gabarito' : m === 'summary' ? 'Resumo / Apostila' : 'Texto Direto';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => {
              setActiveDeck(null);
              setIsProcessing(false);
              setActiveSection('create');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Cardexis
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => {
                setActiveDeck(null);
                setIsProcessing(false);
                setActiveSection('create');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'create' && !activeDeck ? 'text-slate-900 font-semibold' : ''
              }`}
            >
              Criar Baralho
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveDeck(null);
                setIsProcessing(false);
                setActiveSection('decks');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'decks' && !activeDeck ? 'text-slate-900 font-semibold' : ''
              }`}
            >
              Meus Baralhos ({decks.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveDeck(null);
                setIsProcessing(false);
                setActiveSection('methodology');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'methodology' && !activeDeck ? 'text-slate-900 font-semibold' : ''
              }`}
            >
              Metodologia
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setShowWorkspaceModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <User className="h-3.5 w-3.5 text-slate-600" />
              <span className="truncate max-w-[140px]">{session.name}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {isProcessing ? (
          <ProcessingTimeline
            currentEvent={currentEvent}
            history={eventHistory}
            onRetry={startGeneration}
            onCancel={() => {
              setIsProcessing(false);
              setCurrentEvent(null);
            }}
          />
        ) : activeDeck ? (
          <DeckViewer
            deck={activeDeck}
            onDeckUpdated={(updated) => {
              setActiveDeck(updated);
              loadWorkspaceData();
            }}
            onBackToStudio={() => {
              setActiveDeck(null);
              setActiveSection('create');
            }}
          />
        ) : activeSection === 'methodology' ? (
          <MethodologyPanel />
        ) : activeSection === 'decks' ? (
          /* Saved Decks View */
          <section className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Meus baralhos</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Histórico de materiais processados e baralhos salvos no espaço de {session.name}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('create')}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Novo baralho
              </button>
            </div>

            {loadingDecks ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
                Carregando baralhos salvos...
              </div>
            ) : decks.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">Nenhum baralho criado neste espaço</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Envie uma prova com gabarito, uma apostila em PDF ou cole um texto de estudo para gerar seu
                  primeiro baralho com referências verificadas.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSection('create')}
                  className="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg"
                >
                  Criar primeiro baralho
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {decks.map((d) => (
                  <div
                    key={d.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-semibold text-slate-900 leading-snug">{d.title}</h3>
                        <button
                          type="button"
                          onClick={() => handleDeleteDeck(d.id)}
                          title="Excluir baralho"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {d.cardCount} cartões
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{modeLabel(d.inputMode)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{d.depth}</span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(d.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 pt-1">{d.coverageReport}</p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleOpenDeck(d.id)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        Abrir e estudar
                      </button>
                      <a
                        href={`/api/decks/${d.id}/export?format=apkg`}
                        className="text-xs font-medium text-sky-700 hover:underline"
                      >
                        Baixar .apkg
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          /* Creation Studio (Default Landing) */
          <div className="space-y-8">
            {/* Concise Editorial Hero */}
            <div className="max-w-3xl space-y-2">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight text-balance">
                Criação de flashcards de alta precisão científica
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Transforme provas, apostilas ou anotações em cartões atômicos com evocação ativa, Cloze Deletion,
                Oclusão de Imagem, verificação de diretrizes atuais e exportação nativa para Anki (.apkg).
              </p>
            </div>

            {/* 3 Input Modalities Selector */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => {
                  setInputMode('exam');
                  setFormError(null);
                }}
                className={`text-left p-5 rounded-xl border transition-all ${
                  inputMode === 'exam'
                    ? 'bg-white border-sky-700 ring-2 ring-sky-700/15'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <FileCheck2
                    className={`h-5 w-5 ${inputMode === 'exam' ? 'text-sky-700' : 'text-slate-500'}`}
                  />
                  <span className="font-mono text-xs text-slate-500">Modalidade 01</span>
                </div>
                <h2 className="mt-3 text-sm font-semibold text-slate-900">
                  Criar a partir de uma prova
                </h2>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Anexe o PDF da prova e do gabarito. A IA analisa cada questão, identifica pegadinhas e audita se o
                  gabarito está atualizado.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputMode('summary');
                  setFormError(null);
                }}
                className={`text-left p-5 rounded-xl border transition-all ${
                  inputMode === 'summary'
                    ? 'bg-white border-sky-700 ring-2 ring-sky-700/15'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <BookOpen
                    className={`h-5 w-5 ${inputMode === 'summary' ? 'text-sky-700' : 'text-slate-500'}`}
                  />
                  <span className="font-mono text-xs text-slate-500">Modalidade 02</span>
                </div>
                <h2 className="mt-3 text-sm font-semibold text-slate-900">
                  Criar a partir de resumo ou apostila
                </h2>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Anexe um PDF completo. Mapeamento global dos temas com geração proporcional (meta de 60 a 100
                  cartões).
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputMode('text');
                  setFormError(null);
                }}
                className={`text-left p-5 rounded-xl border transition-all ${
                  inputMode === 'text'
                    ? 'bg-white border-sky-700 ring-2 ring-sky-700/15'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <FileText
                    className={`h-5 w-5 ${inputMode === 'text' ? 'text-sky-700' : 'text-slate-500'}`}
                  />
                  <span className="font-mono text-xs text-slate-500">Modalidade 03</span>
                </div>
                <h2 className="mt-3 text-sm font-semibold text-slate-900">
                  Criar a partir de um texto
                </h2>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Cole qualquer conteúdo diretamente e, se desejar, anexe uma imagem anatômica ou diagrama para Image
                  Occlusion.
                </p>
              </button>
            </div>

            {/* Active Input Workspace */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-xs font-medium text-sky-700">
                    Selecionada: {modeLabel(inputMode)}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                    {inputMode === 'exam'
                      ? 'Envie os arquivos da prova e gabarito'
                      : inputMode === 'summary'
                        ? 'Envie o PDF do resumo, apostila ou capítulo'
                        : 'Cole o conteúdo de estudo'}
                  </h3>
                </div>

                <div className="sm:w-72">
                  <input
                    type="text"
                    value={deckTitle}
                    onChange={(e) => setDeckTitle(e.target.value)}
                    placeholder="Nome do baralho (opcional)"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/30"
                  />
                </div>
              </div>

              {inputMode === 'exam' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-50 cursor-pointer transition-colors">
                    <Upload className="h-5 w-5 text-sky-700" />
                    <span className="text-sm font-medium text-slate-900">
                      {examPdf ? examPdf.name : 'Anexar PDF da Prova (obrigatório)'}
                    </span>
                    <span className="text-xs text-slate-500">PDF até 20MB (suporta OCR automático)</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setExamPdf(e.target.files?.[0] || null)}
                    />
                  </label>

                  <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-50 cursor-pointer transition-colors">
                    <Upload className="h-5 w-5 text-slate-600" />
                    <span className="text-sm font-medium text-slate-900">
                      {answerKeyPdf ? answerKeyPdf.name : 'Anexar PDF do Gabarito (oficial ou comentado)'}
                    </span>
                    <span className="text-xs text-slate-500">PDF até 20MB</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setAnswerKeyPdf(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              )}

              {inputMode === 'summary' && (
                <label className="flex flex-col items-center justify-center gap-2 p-10 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-50 cursor-pointer transition-colors">
                  <Upload className="h-6 w-6 text-sky-700" />
                  <span className="text-sm font-medium text-slate-900">
                    {summaryPdf ? summaryPdf.name : 'Anexar PDF do Resumo, Apostila ou Capítulo'}
                  </span>
                  <span className="text-xs text-slate-500">
                    PDF até 20MB · Leitura integral com cobertura proporcional (60–100 cartões recomendados)
                  </span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => setSummaryPdf(e.target.files?.[0] || null)}
                  />
                </label>
              )}

              {inputMode === 'text' && (
                <div className="space-y-4">
                  <textarea
                    rows={8}
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Cole aqui suas anotações de aula, diretriz clínica, artigo, legislação ou resumo..."
                    className="w-full p-4 text-sm text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-600/30 leading-relaxed"
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2.5 text-xs text-slate-700">
                      <ImageIcon className="h-4 w-4 text-sky-700 shrink-0" />
                      <span>
                        {imageFile
                          ? `Imagem anexada para Oclusão: ${imageFile.name}`
                          : 'Opcional: anexe uma imagem (anatomia, ECG, radiografia, fluxograma) para gerar Image Occlusion.'}
                      </span>
                    </div>
                    <label className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0">
                      {imageFile ? 'Trocar imagem' : 'Anexar imagem'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Optional Configuration Toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {showAdvanced ? 'Ocultar configurações opcionais' : 'Configurações opcionais (profundidade, formato, quantidade)'}
                </button>

                {showAdvanced && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Profundidade
                      </label>
                      <select
                        value={depth}
                        onChange={(e) => setDepth(e.target.value as DepthLevel)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="basico">Básico</option>
                        <option value="intermediario">Intermediário (Padrão)</option>
                        <option value="avancado">Avançado</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Formato dos cartões
                      </label>
                      <select
                        value={formatPreference}
                        onChange={(e) => setFormatPreference(e.target.value as CardFormatPreference)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="ambos">Ambos (Tradicional + Cloze)</option>
                        <option value="tradicional">Apenas Tradicional</option>
                        <option value="cloze">Priorizar Cloze Deletion</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Idioma
                      </label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Português (BR)">Português (BR)</option>
                        <option value="Inglês">Inglês</option>
                        <option value="Espanhol">Espanhol</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Quantidade alvo (opcional)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={targetCount}
                        onChange={(e) => setTargetCount(e.target.value)}
                        placeholder={
                          inputMode === 'summary' ? 'Padrão: 60–100' : 'Automático pela densidade'
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white tabular-nums"
                      />
                    </div>
                  </div>
                )}
              </div>

              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Prioridade absoluta na qualidade pedagógica, atomicidade e verificação científica de cada cartão.
                </p>
                <button
                  type="button"
                  onClick={startGeneration}
                  className="px-6 py-3 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  GERAR FLASHCARDS
                </button>
              </div>
            </div>

            {/* Recent Decks Preview (if any) */}
            {decks.length > 0 && (
              <section className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900">Baralhos recentes</h2>
                  <button
                    type="button"
                    onClick={() => setActiveSection('decks')}
                    className="text-xs font-medium text-sky-700 hover:underline"
                  >
                    Ver todos ({decks.length})
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {decks.slice(0, 3).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleOpenDeck(d.id)}
                      className="text-left p-4 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-colors space-y-1.5"
                    >
                      <p className="text-sm font-semibold text-slate-900 truncate">{d.title}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-800 tabular-nums">
                          {d.cardCount} cartões
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{modeLabel(d.inputMode)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {showWorkspaceModal && (
        <WorkspaceModal
          session={session}
          onClose={() => setShowWorkspaceModal(false)}
          onUpdated={(newSess) => {
            setSession(newSess);
            setActiveDeck(null);
            loadWorkspaceData();
          }}
        />
      )}
    </div>
  );
}
