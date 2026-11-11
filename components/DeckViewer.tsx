'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CardImportance,
  CardModality,
  Deck,
  Flashcard,
  OcclusionRegion,
} from '@/lib/types';
import { downloadDeckAsPdf } from '@/lib/export/pdf';
import { ImageOcclusionCanvas } from './ImageOcclusionCanvas';

interface DeckViewerProps {
  deck: Deck;
  onDeckUpdated: (deck: Deck) => void;
  onBackToStudio: () => void;
}

function renderClozeText(clozeText: string, revealed: boolean): React.ReactNode {
  const regex = /\{\{c\d+::([^:}]+)(?:::([^}]+))?\}\}/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(clozeText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(clozeText.slice(lastIndex, match.index));
    }
    const answer = match[1];
    const hint = match[2];
    parts.push(
      <span key={keyIdx++} className={revealed ? 'cloze-revealed' : 'cloze-blank'}>
        {revealed ? answer : hint ? `[${hint}]` : '[ ... ]'}
      </span>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < clozeText.length) {
    parts.push(clozeText.slice(lastIndex));
  }

  return parts.length > 0 ? parts : clozeText;
}

export function DeckViewer({ deck, onDeckUpdated, onBackToStudio }: DeckViewerProps) {
  const [viewMode, setViewMode] = useState<'study' | 'list'>('study');
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [importanceFilter, setImportanceFilter] = useState<'all' | CardImportance>('all');
  const [modalityFilter, setModalityFilter] = useState<'all' | CardModality>('all');
  const [onlyOutdated, setOnlyOutdated] = useState(false);

  // Editing & Actions
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editCloze, setEditCloze] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editImportance, setEditImportance] = useState<CardImportance>('importante');
  const [editRegions, setEditRegions] = useState<OcclusionRegion[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Add manual card modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newCloze, setNewCloze] = useState('');
  const [newSubject, setNewSubject] = useState(deck.knowledgeMap[0]?.theme || 'Geral');
  const [newImportance, setNewImportance] = useState<CardImportance>('importante');
  const [newModality, setNewModality] = useState<CardModality>('tradicional');
  const [newImageDataUrl, setNewImageDataUrl] = useState<string | undefined>(undefined);
  const [newRegions, setNewRegions] = useState<OcclusionRegion[]>([]);
  const [addingCard, setAddingCard] = useState(false);

  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showKnowledgeMap, setShowKnowledgeMap] = useState(false);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const c of deck.cards) {
      if (c.subject) set.add(c.subject);
    }
    return Array.from(set);
  }, [deck.cards]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deck.cards.filter((c) => {
      if (subjectFilter !== 'all' && c.subject !== subjectFilter) return false;
      if (importanceFilter !== 'all' && c.importance !== importanceFilter) return false;
      if (modalityFilter !== 'all' && c.modality !== modalityFilter) return false;
      if (onlyOutdated && !c.outdatedAlert?.isOutdated) return false;
      if (q) {
        const hay = `${c.front} ${c.back} ${c.clozeText || ''} ${c.subject} ${c.reference.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deck.cards, subjectFilter, importanceFilter, modalityFilter, onlyOutdated, searchQuery]);

  const safeStudyIndex = Math.min(studyIndex, Math.max(0, filteredCards.length - 1));
  const currentCard = filteredCards[safeStudyIndex];
  const outdatedCount = deck.cards.filter((c) => c.outdatedAlert?.isOutdated).length;
  const linkedQuestionNumbers = Array.from(new Set(
    deck.cards.map((card) => card.questionNumber?.trim()).filter((value): value is string => Boolean(value))
  )).sort((a, b) => Number(a) - Number(b));
  const unlinkedQuestionCards = deck.cards.filter((card) => !card.questionNumber?.trim()).length;

  const openEditModal = (card: Flashcard) => {
    setEditingCard(card);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditCloze(card.clozeText || '');
    setEditSubject(card.subject);
    setEditImportance(card.importance);
    setEditRegions(card.occlusionRegions || []);
    setActionError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard) return;
    setSavingEdit(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/decks/${deck.id}/cards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: editingCard.id,
          patch: {
            front: editFront.trim(),
            back: editBack.trim(),
            clozeText: editingCard.modality === 'cloze' ? editCloze.trim() : undefined,
            subject: editSubject.trim(),
            importance: editImportance,
            occlusionRegions: editingCard.modality === 'image_occlusion' ? editRegions : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar alterações.');
      onDeckUpdated(data.deck);
      setEditingCard(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao atualizar cartão.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/decks/${deck.id}/cards?cardId=${encodeURIComponent(cardId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir cartão.');
      onDeckUpdated(data.deck);
      setRevealed(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao excluir cartão.');
    }
  };

  const handleRegenerateCard = async (cardId: string) => {
    setRegeneratingId(cardId);
    setActionError(null);
    try {
      const res = await fetch(`/api/decks/${deck.id}/cards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao regenerar cartão.');
      onDeckUpdated(data.deck);
      setRevealed(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao regenerar cartão.');
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleAddManualImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setNewImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFront.trim() || !newBack.trim()) return;
    setAddingCard(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/decks/${deck.id}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          front: newFront.trim(),
          back: newBack.trim(),
          clozeText: newModality === 'cloze' ? newCloze.trim() || newFront.trim() : undefined,
          modality: newModality,
          importance: newImportance,
          subject: newSubject.trim() || 'Geral',
          imageDataUrl: newModality === 'image_occlusion' ? newImageDataUrl : undefined,
          occlusionRegions: newModality === 'image_occlusion' ? newRegions : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao adicionar cartão.');
      onDeckUpdated(data.deck);
      setShowAddModal(false);
      setNewFront('');
      setNewBack('');
      setNewCloze('');
      setNewImageDataUrl(undefined);
      setNewRegions([]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao criar cartão.');
    } finally {
      setAddingCard(false);
    }
  };

  const modalityLabel = (m: CardModality) =>
    m === 'cloze' ? 'Cloze Deletion' : m === 'image_occlusion' ? 'Oclusão de Imagem' : 'Tradicional';

  const importanceLabel = (imp: CardImportance) =>
    imp === 'essencial' ? 'Essencial' : imp === 'importante' ? 'Importante' : 'Complementar';

  return (
    <div className="space-y-6">
      {/* Deck Header & Export Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onBackToStudio}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao estúdio de criação
            </button>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{deck.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {deck.cards.length} flashcards
              </span>
              <span aria-hidden="true">·</span>
              <span>Profundidade: {deck.depth}</span>
              <span aria-hidden="true">·</span>
              <span>{deck.coverageReport}</span>
              {deck.inputMode === 'exam' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-sky-800">{linkedQuestionNumbers.length} questão(ões) representada(s) nos cartões</span>
                  {unlinkedQuestionCards > 0 && <span className="text-amber-700">{unlinkedQuestionCards} cartão(ões) sem vínculo com questão</span>}
                </>
              )}
              {outdatedCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 font-medium">
                    {outdatedCount} atualização(ões) científica(s) detectada(s)
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Export & Action Controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={`/api/decks/${deck.id}/export?format=apkg`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar Anki (.apkg)
            </a>
            <button
              type="button"
              onClick={() => downloadDeckAsPdf(deck)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="h-3.5 w-3.5" />
              Exportar PDF
            </button>
            <a
              href={`/api/decks/${deck.id}/export?format=txt`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar TXT
            </a>
          </div>
        </div>

        {/* Knowledge Map Toggle */}
        {deck.knowledgeMap.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowKnowledgeMap((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800"
            >
              <Layers className="h-3.5 w-3.5" />
              {showKnowledgeMap ? 'Ocultar mapa de conhecimentos' : 'Ver mapa de cobertura temática'}
            </button>
            {showKnowledgeMap && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {deck.knowledgeMap.map((node, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900 truncate">{node.theme}</p>
                      <span className="font-mono text-xs text-slate-600 tabular-nums shrink-0">
                        {node.coveredCards} cartões
                      </span>
                    </div>
                    {node.subtopics.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                        {node.subtopics.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter & View Switch Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Segmented Control */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('study')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'study'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Modo Estudo
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lista Completa ({filteredCards.length})
              </button>
            </div>

            {/* Importance Filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'essencial', 'importante', 'complementar'] as const).map((imp) => (
                <button
                  key={imp}
                  type="button"
                  onClick={() => {
                    setImportanceFilter(imp);
                    setStudyIndex(0);
                    setRevealed(false);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    importanceFilter === imp
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {imp === 'all' ? 'Todas prioridades' : importanceLabel(imp)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-56">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setStudyIndex(0);
                }}
                placeholder="Buscar nos cartões..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/30"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo cartão
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <label htmlFor="subject-select" className="text-slate-500 font-medium">
              Assunto:
            </label>
            <select
              id="subject-select"
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setStudyIndex(0);
                setRevealed(false);
              }}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="all">Todos os assuntos ({subjects.length})</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="modality-select" className="text-slate-500 font-medium">
              Modalidade:
            </label>
            <select
              id="modality-select"
              value={modalityFilter}
              onChange={(e) => {
                setModalityFilter(e.target.value as 'all' | CardModality);
                setStudyIndex(0);
                setRevealed(false);
              }}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="all">Todas</option>
              <option value="tradicional">Tradicional</option>
              <option value="cloze">Cloze Deletion</option>
              <option value="image_occlusion">Oclusão de Imagem</option>
            </select>
          </div>

          {outdatedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setOnlyOutdated((v) => !v);
                setStudyIndex(0);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                onlyOutdated
                  ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold'
                  : 'bg-white border-slate-300 text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Apenas atualizações científicas ({outdatedCount})
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-red-700 hover:text-red-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Empty Filter State */}
      {filteredCards.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-slate-900">Nenhum flashcard corresponde aos filtros atuais.</p>
          <p className="mt-1 text-xs text-slate-500">
            Ajuste os filtros de assunto, prioridade ou busca para visualizar seus cartões.
          </p>
        </div>
      ) : viewMode === 'study' && currentCard ? (
        /* STUDY MODE */
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Card Header Metadata (Zero-Pill Discipline) */}
            <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {safeStudyIndex + 1} / {filteredCards.length}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-800">{currentCard.subject}</span>
                <span aria-hidden="true">·</span>
                <span>{importanceLabel(currentCard.importance)}</span>
                <span aria-hidden="true">·</span>
                <span>{modalityLabel(currentCard.modality)}</span>
                {currentCard.questionNumber && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Questão {currentCard.questionNumber}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditModal(currentCard)}
                  title="Editar cartão"
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60 transition-colors"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRegenerateCard(currentCard.id)}
                  disabled={regeneratingId === currentCard.id}
                  title="Regenerar com IA"
                  className="p-1.5 text-slate-500 hover:text-sky-700 rounded-md hover:bg-slate-200/60 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${regeneratingId === currentCard.id ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCard(currentCard.id)}
                  title="Excluir cartão"
                  className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-slate-200/60 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Outdated Alert Banner */}
            {currentCard.outdatedAlert?.isOutdated && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                  Divergência científica detectada no material original
                </div>
                {currentCard.outdatedAlert.originalAnswerOrClaim && (
                  <p>
                    <span className="font-medium">Original:</span> {currentCard.outdatedAlert.originalAnswerOrClaim}
                  </p>
                )}
                {currentCard.outdatedAlert.reason && (
                  <p>
                    <span className="font-medium">Motivo da atualização:</span> {currentCard.outdatedAlert.reason}
                  </p>
                )}
              </div>
            )}

            {/* Front / Question Area */}
            <div className="p-8 space-y-6">
              {currentCard.questionNumber && (
                <div className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                  <FileText className="h-3.5 w-3.5" /> Relacionado à questão {currentCard.questionNumber}
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Frente</p>
                {currentCard.modality === 'cloze' && currentCard.clozeText ? (
                  <p className="text-lg font-medium text-slate-900 leading-relaxed">
                    {renderClozeText(currentCard.clozeText, revealed)}
                  </p>
                ) : (
                  <p className="text-lg font-medium text-slate-900 leading-relaxed whitespace-pre-line">
                    {currentCard.front}
                  </p>
                )}
              </div>

              {currentCard.modality === 'image_occlusion' && currentCard.imageDataUrl && (
                <ImageOcclusionCanvas
                  imageDataUrl={currentCard.imageDataUrl}
                  regions={currentCard.occlusionRegions || []}
                  revealed={revealed}
                  onToggleReveal={() => setRevealed((v) => !v)}
                />
              )}

              {/* Answer Reveal Area */}
              {revealed ? (
                <div className="pt-6 border-t border-slate-200 space-y-5">
                  <div>
                    <p className="text-xs font-medium text-emerald-700 mb-1.5">Resposta</p>
                    <p className="text-base font-semibold text-slate-900 leading-relaxed whitespace-pre-line">
                      {currentCard.back}
                    </p>
                  </div>

                  {/* Bibliographic Reference */}
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                        {currentCard.reference.verified ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                        )}
                        Referência bibliográfica
                      </span>
                      <span className="text-slate-500">
                        {currentCard.reference.verified ? 'Fonte verificada' : 'Baseada no material enviado'}
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">
                      {currentCard.reference.authorOrInstitution}.{' '}
                      <span className="italic">{currentCard.reference.title}</span>.{' '}
                      {currentCard.reference.sourceOrJournal} ({currentCard.reference.year}).
                      {currentCard.reference.identifier ? ` ${currentCard.reference.identifier}.` : ''}
                    </p>
                    {currentCard.reference.url && (
                      <a
                        href={currentCard.reference.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sky-700 hover:underline font-medium"
                      >
                        Acessar fonte original
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {currentCard.reference.note && (
                      <p className="text-slate-500">{currentCard.reference.note}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="w-full py-3 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                    Revelar resposta e referência
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Study Navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={safeStudyIndex === 0}
              onClick={() => {
                setStudyIndex((i) => Math.max(0, i - 1));
                setRevealed(false);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>

            {revealed && (
              <button
                type="button"
                onClick={() => setRevealed(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Ocultar resposta
              </button>
            )}

            <button
              type="button"
              disabled={safeStudyIndex >= filteredCards.length - 1}
              onClick={() => {
                setStudyIndex((i) => Math.min(filteredCards.length - 1, i + 1));
                setRevealed(false);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-40 transition-colors"
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        /* LIST MANAGEMENT MODE */
        <div className="space-y-3">
          {filteredCards.map((card, idx) => (
            <div
              key={card.id}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">#{idx + 1}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-800">{card.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>{importanceLabel(card.importance)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{modalityLabel(card.modality)}</span>
                  {card.outdatedAlert?.isOutdated && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-700 font-semibold">Atualizado pela IA</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(card)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
                    title="Editar"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRegenerateCard(card.id)}
                    disabled={regeneratingId === card.id}
                    className="p-1.5 text-slate-500 hover:text-sky-700 rounded-md hover:bg-slate-100 disabled:opacity-50"
                    title="Regenerar com IA"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${regeneratingId === card.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCard(card.id)}
                    className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-slate-100"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {card.questionNumber && (
                <div className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                  <FileText className="h-3.5 w-3.5" /> Questão {card.questionNumber}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1">Frente</p>
                  <p className="text-sm font-medium text-slate-900">
                    {card.modality === 'cloze' && card.clozeText ? card.clozeText : card.front}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1">Verso</p>
                  <p className="text-sm text-slate-700">{card.back}</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                Fonte: {card.reference.authorOrInstitution} — {card.reference.title} ({card.reference.year})
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Edit Card Modal */}
      {editingCard && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Editar flashcard</h3>
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Assunto</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Importância</label>
                  <select
                    value={editImportance}
                    onChange={(e) => setEditImportance(e.target.value as CardImportance)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="essencial">Essencial</option>
                    <option value="importante">Importante</option>
                    <option value="complementar">Complementar</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Frente (Pergunta)</label>
                <textarea
                  rows={3}
                  value={editFront}
                  onChange={(e) => setEditFront(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {editingCard.modality === 'cloze' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Texto Cloze (sintaxe {'{{c1::termo}}'})
                  </label>
                  <textarea
                    rows={2}
                    value={editCloze}
                    onChange={(e) => setEditCloze(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Verso (Resposta)</label>
                <textarea
                  rows={2}
                  value={editBack}
                  onChange={(e) => setEditBack(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {editingCard.modality === 'image_occlusion' && editingCard.imageDataUrl && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Máscaras de Oclusão de Imagem
                  </label>
                  <ImageOcclusionCanvas
                    imageDataUrl={editingCard.imageDataUrl}
                    regions={editRegions}
                    revealed={true}
                    editable={true}
                    onChangeRegions={setEditRegions}
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingCard(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-50"
                >
                  {savingEdit ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Manual Card Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Adicionar flashcard manualmente</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddCard} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Modalidade</label>
                  <select
                    value={newModality}
                    onChange={(e) => setNewModality(e.target.value as CardModality)}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="tradicional">Tradicional</option>
                    <option value="cloze">Cloze Deletion</option>
                    <option value="image_occlusion">Oclusão de Imagem</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Assunto</label>
                  <input
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    required
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Prioridade</label>
                  <select
                    value={newImportance}
                    onChange={(e) => setNewImportance(e.target.value as CardImportance)}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="essencial">Essencial</option>
                    <option value="importante">Importante</option>
                    <option value="complementar">Complementar</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Frente</label>
                <textarea
                  rows={2}
                  value={newFront}
                  onChange={(e) => setNewFront(e.target.value)}
                  placeholder="Pergunta objetiva com contexto suficiente..."
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {newModality === 'cloze' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Texto Cloze (ex: A enzima limitante é a {'{{c1::PFK-1}}'})
                  </label>
                  <textarea
                    rows={2}
                    value={newCloze}
                    onChange={(e) => setNewCloze(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              {newModality === 'image_occlusion' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Imagem anatômica, radiografia ou fluxograma
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAddManualImage}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700"
                  />
                  {newImageDataUrl && (
                    <ImageOcclusionCanvas
                      imageDataUrl={newImageDataUrl}
                      regions={newRegions}
                      revealed={true}
                      editable={true}
                      onChangeRegions={setNewRegions}
                    />
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Verso (Resposta curta)</label>
                <textarea
                  rows={2}
                  value={newBack}
                  onChange={(e) => setNewBack(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={addingCard}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-50"
                >
                  {addingCard ? 'Adicionando...' : 'Adicionar cartão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
