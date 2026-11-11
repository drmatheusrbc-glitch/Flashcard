export type InputMode = 'exam' | 'summary' | 'text';

export type DepthLevel = 'basico' | 'intermediario' | 'avancado';

export type CardFormatPreference = 'tradicional' | 'cloze' | 'ambos';

export type CardImportance = 'essencial' | 'importante' | 'complementar';

export type CardModality = 'tradicional' | 'cloze' | 'image_occlusion';

export interface BibliographicReference {
  authorOrInstitution: string;
  title: string;
  sourceOrJournal: string;
  year: string;
  identifier?: string; // DOI or PMID
  url?: string;
  verified: boolean;
  note?: string;
}

export interface OutdatedAlert {
  isOutdated: boolean;
  originalAnswerOrClaim?: string;
  updatedRecommendation?: string;
  reason?: string;
  updatedReference?: string;
}

export interface OcclusionRegion {
  id: string;
  /** Normalized percentage 0-100 */
  x: number;
  /** Normalized percentage 0-100 */
  y: number;
  /** Normalized percentage 0-100 */
  width: number;
  /** Normalized percentage 0-100 */
  height: number;
  label: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  clozeText?: string;
  modality: CardModality;
  importance: CardImportance;
  subject: string;
  subtopic?: string;
  contextAnchor?: string;
  isVignette?: boolean;
  questionNumber?: string;
  reference: BibliographicReference;
  outdatedAlert?: OutdatedAlert;
  imageDataUrl?: string;
  occlusionRegions?: OcclusionRegion[];
  qualityChecksPassed: boolean;
  qualityNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeMapTheme {
  theme: string;
  subtopics: string[];
  estimatedWeight: 'alto' | 'medio' | 'baixo';
  coveredCards: number;
}

export interface Deck {
  id: string;
  userId: string;
  title: string;
  inputMode: InputMode;
  depth: DepthLevel;
  language: string;
  formatPreference: CardFormatPreference;
  knowledgeMap: KnowledgeMapTheme[];
  coverageReport: string;
  cards: Flashcard[];
  createdAt: string;
  updatedAt: string;
}

export type PipelineStageId =
  | 'compreensao'
  | 'mapeamento'
  | 'priorizacao'
  | 'validacao'
  | 'elaboracao'
  | 'qualidade'
  | 'cobertura'
  | 'finalizacao';

export interface PipelineProgressEvent {
  stage: PipelineStageId;
  stageIndex: number; // 1 to 8
  totalStages: number; // 8
  label: string;
  detail: string;
  completed?: boolean;
  deck?: Deck;
  error?: string;
}

export interface GenerationConfig {
  inputMode: InputMode;
  title?: string;
  targetCount?: number;
  depth: DepthLevel;
  language: string;
  formatPreference: CardFormatPreference;
}

export interface UserSession {
  userId: string;
  name: string;
  email?: string;
}
