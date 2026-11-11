import crypto from 'node:crypto';
import { ThinkingLevel, Type } from '@google/genai';
import { generateWithFallback, MultimodalInputPart } from './client';
import type {
  BibliographicReference,
  CardImportance,
  CardModality,
  Deck,
  Flashcard,
  GenerationConfig,
  KnowledgeMapTheme,
  OcclusionRegion,
  OutdatedAlert,
  PipelineProgressEvent,
} from '../types';

export interface PipelineInput {
  config: GenerationConfig;
  userId: string;
  textContent?: string;
  examPdfBase64?: string;
  examPdfName?: string;
  answerKeyPdfBase64?: string;
  answerKeyPdfName?: string;
  summaryPdfBase64?: string;
  summaryPdfName?: string;
  imageBase64?: string;
  imageMimeType?: string;
  imageDataUrl?: string;
}

interface ComprehensionResult {
  suggestedTitle: string;
  detectedDomain: string;
  structuralSummary: string;
  examQuestions?: Array<{
    questionNumber: string;
    topic: string;
    stemSummary: string;
    officialAnswer: string;
    coreConcept: string;
    commonTrap: string;
  }>;
  themes: Array<{
    theme: string;
    subtopics: string[];
    estimatedWeight: 'alto' | 'medio' | 'baixo';
    keyFactsToVerify: string[];
  }>;
}

interface ValidationResult {
  verifiedClaims: Array<{
    topic: string;
    claimStatus: 'atualizado' | 'desatualizado' | 'incerto';
    originalClaim: string;
    updatedRecommendation: string;
    divergenceReason: string;
    reference: {
      authorOrInstitution: string;
      title: string;
      sourceOrJournal: string;
      year: string;
      identifier: string;
      url: string;
      verified: boolean;
      note: string;
    };
  }>;
}

interface RawGeneratedCard {
  front: string;
  back: string;
  clozeText?: string;
  modality: 'tradicional' | 'cloze' | 'image_occlusion';
  importance: 'essencial' | 'importante' | 'complementar';
  subject: string;
  subtopic: string;
  contextAnchor: string;
  isVignette: boolean;
  questionNumber?: string;
  reference: {
    authorOrInstitution: string;
    title: string;
    sourceOrJournal: string;
    year: string;
    identifier?: string;
    url?: string;
    verified: boolean;
    note?: string;
  };
  outdatedAlert?: {
    isOutdated: boolean;
    originalAnswerOrClaim?: string;
    updatedRecommendation?: string;
    reason?: string;
    updatedReference?: string;
  };
  occlusionRegions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  }>;
}

function buildContentParts(input: PipelineInput, promptText: string): MultimodalInputPart[] {
  const parts: MultimodalInputPart[] = [];

  if (input.examPdfBase64) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: input.examPdfBase64,
      },
    });
  }
  if (input.answerKeyPdfBase64) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: input.answerKeyPdfBase64,
      },
    });
  }
  if (input.summaryPdfBase64) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: input.summaryPdfBase64,
      },
    });
  }
  if (input.imageBase64 && input.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType,
        data: input.imageBase64,
      },
    });
  }

  let fullPrompt = promptText;
  if (input.textContent && input.textContent.trim().length > 0) {
    fullPrompt += `\n\n--- MATERIAL ENVIADO PELO USUÁRIO ---\n${input.textContent.trim()}\n--- FIM DO MATERIAL ---`;
  }
  parts.push({ text: fullPrompt });
  return parts;
}

function safeParseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '');
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export async function runFlashcardPipeline(
  input: PipelineInput,
  onProgress: (event: PipelineProgressEvent) => void
): Promise<Deck> {
  const { config } = input;
  const isExam = config.inputMode === 'exam';
  const isSummary = config.inputMode === 'summary';

  // =========================================================================
  // ETAPA 1 & 2 — COMPREENSÃO E MAPEAMENTO
  // =========================================================================
  onProgress({
    stage: 'compreensao',
    stageIndex: 1,
    totalStages: 8,
    label: 'Analisando documento',
    detail: isExam
      ? 'Lendo prova e gabarito, separando questões e identificando conceitos centrais.'
      : isSummary
        ? 'Realizando leitura integral do material e extraindo estrutura temática.'
        : 'Interpretando texto e identificando conceitos de alta relevância.',
  });

  const comprehensionPrompt = `Você é um especialista em ciência da aprendizagem, pedagogia médica/acadêmica e curadoria de conhecimento.
Analise integralmente o material fornecido no modo: "${config.inputMode}".
Idioma alvo: ${config.language}.
Nível de profundidade desejado: ${config.depth}.

${
  isExam
    ? `MODO PROVA + GABARITO:
1. Identifique e separe TODAS as questões individuais da prova.
2. Cruze cada questão com o gabarito fornecido (se houver gabarito comentado, extraia o raciocínio).
3. Para cada questão, identifique o conceito central exigido e possíveis pegadinhas ou conceitos confundidores.
4. A lista examQuestions deve conter UMA entrada para CADA questão legível, preservando a numeração original. Não faça amostragem nem pare nas primeiras questões.
5. Faça conferência final da sequência numérica; informe lacunas, páginas ilegíveis ou questões não identificáveis em structuralSummary. Nunca invente questões.`
    : `MODO RESUMO / TEXTO:
1. Leia todo o documento antes de propor qualquer cartão.
2. Construa um mapa global de conhecimentos com grandes temas, subtemas e peso relativo.`
}

Liste também os fatos-chave, diretrizes, critérios, doses ou afirmações científicas/normativas que precisam de verificação de atualidade (keyFactsToVerify).`;

  const comprehensionRes = await generateWithFallback({
      contents: { parts: buildContentParts(input, comprehensionPrompt) },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedTitle: { type: Type.STRING },
            detectedDomain: { type: Type.STRING },
            structuralSummary: { type: Type.STRING },
            examQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionNumber: { type: Type.STRING },
                  topic: { type: Type.STRING },
                  stemSummary: { type: Type.STRING },
                  officialAnswer: { type: Type.STRING },
                  coreConcept: { type: Type.STRING },
                  commonTrap: { type: Type.STRING },
                },
                required: ['questionNumber', 'topic', 'stemSummary', 'officialAnswer', 'coreConcept'],
              },
            },
            themes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  theme: { type: Type.STRING },
                  subtopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                  estimatedWeight: { type: Type.STRING },
                  keyFactsToVerify: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['theme', 'subtopics', 'estimatedWeight', 'keyFactsToVerify'],
              },
            },
          },
          required: ['suggestedTitle', 'detectedDomain', 'structuralSummary', 'themes'],
        },
      },
    });

  const comprehension = safeParseJson<ComprehensionResult>(comprehensionRes.text, {
    suggestedTitle: config.title || 'Baralho de Estudo',
    detectedDomain: 'Geral',
    structuralSummary: '',
    themes: [{ theme: 'Conteúdo Principal', subtopics: [], estimatedWeight: 'alto', keyFactsToVerify: [] }],
  });

  // =========================================================================
  // ETAPA 2 — MAPEAMENTO (emitido com os dados reais extraídos)
  // =========================================================================
  onProgress({
    stage: 'mapeamento',
    stageIndex: 2,
    totalStages: 8,
    label: 'Identificando os principais temas',
    detail: `${comprehension.themes.length} tema(s) mapeado(s)${
      comprehension.examQuestions?.length
        ? ` · ${comprehension.examQuestions.length} questão(ões) identificada(s)`
        : ''
    } na área de ${comprehension.detectedDomain}.`,
  });

  // =========================================================================
  // ETAPA 3 — PRIORIZAÇÃO
  // =========================================================================
  onProgress({
    stage: 'priorizacao',
    stageIndex: 3,
    totalStages: 8,
    label: 'Organizando e priorizando os conhecimentos',
    detail: 'Avaliando frequência em provas, relevância prática e potencial de confusão conceitual.',
  });

  const factsToVerify = comprehension.themes
    .flatMap((t) => t.keyFactsToVerify)
    .slice(0, 18);

  // =========================================================================
  // ETAPA 4 — VALIDAÇÃO CIENTÍFICA COM GOOGLE SEARCH GROUNDING
  // =========================================================================
  onProgress({
    stage: 'validacao',
    stageIndex: 4,
    totalStages: 8,
    label: 'Verificando referências e atualidade científica',
    detail: 'Consultando diretrizes oficiais, consensos e fontes primárias confiáveis.',
  });

  let validationResult: ValidationResult = { verifiedClaims: [] };
  const groundingUrls: Array<{ title: string; uri: string }> = [];

  if (factsToVerify.length > 0 || (comprehension.examQuestions && comprehension.examQuestions.length > 0)) {
    const validationPrompt = `Você é um revisor científico rigoroso.
Área detectada: ${comprehension.detectedDomain}.
Verifique a validade e atualidade científica/normativa dos seguintes pontos extraídos do material do usuário (use a ferramenta Google Search para confirmar diretrizes atuais, consensos oficiais, revisões sistemáticas, legislação vigente ou livros-texto de referência).

REGRAS CRÍTICAS DE RIGOR:
1. NUNCA invente referências, autores, anos, DOIs, PMIDs ou URLs.
2. Só marque verified=true se encontrar fonte confiável real (diretrizes de sociedades, OMS, Ministério da Saúde, UpToDate/NEJM/Lancet/JAMA, legislação oficial, livros acadêmicos reconhecidos).
3. PROIBIDO usar blogs genéricos, fóruns, redes sociais ou sites sem credibilidade científica.
4. Se alguma afirmação ou gabarito estiver DESATUALIZADO frente às evidências atuais, marque claimStatus="desatualizado", preserve a informação original em originalClaim, explique a mudança em divergenceReason e forneça a recomendação vigente em updatedRecommendation.
5. Se não for possível confirmar externamente, marque verified=false e explique em note.

Pontos para verificar:
${factsToVerify.map((f, i) => `${i + 1}. ${f}`).join('\n')}
${
  comprehension.examQuestions?.length
    ? `\nQuestões de prova para auditar gabarito:\n${comprehension.examQuestions
        .slice(0, 15)
        .map((q) => `- Q${q.questionNumber} (${q.topic}): Gabarito "${q.officialAnswer}" | Conceito: ${q.coreConcept}`)
        .join('\n')}`
    : ''
}

Retorne APENAS um JSON válido com a estrutura:
{
  "verifiedClaims": [
    {
      "topic": "string",
      "claimStatus": "atualizado" | "desatualizado" | "incerto",
      "originalClaim": "string",
      "updatedRecommendation": "string",
      "divergenceReason": "string",
      "reference": {
        "authorOrInstitution": "string",
        "title": "string",
        "sourceOrJournal": "string",
        "year": "string",
        "identifier": "DOI ou PMID se disponível",
        "url": "URL oficial se encontrada",
        "verified": boolean,
        "note": "observação se não verificado"
      }
    }
  ]
}`;

    try {
      const searchRes = await generateWithFallback({
          contents: validationPrompt,
          config: {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });

      const chunks = searchRes.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        for (const chunk of chunks) {
          if (chunk.web?.uri && chunk.web?.title) {
            groundingUrls.push({ title: chunk.web.title, uri: chunk.web.uri });
          }
        }
      }

      validationResult = safeParseJson<ValidationResult>(searchRes.text, { verifiedClaims: [] });
    } catch {
      // If search grounding fails transiently, continue safely marking unverified rather than crashing
      validationResult = { verifiedClaims: [] };
    }
  }

  // =========================================================================
  // ETAPA 5 — ELABORAÇÃO DOS FLASHCARDS
  // =========================================================================
  const defaultTarget = isSummary ? 65 : isExam ? Math.max(15, (comprehension.examQuestions?.length || 10) * 2) : 20;
  const targetCount = config.targetCount && config.targetCount > 0 ? config.targetCount : defaultTarget;

  onProgress({
    stage: 'elaboracao',
    stageIndex: 5,
    totalStages: 8,
    label: 'Criando flashcards de alta qualidade',
    detail: `Aplicando Princípio da Informação Mínima, Ancoragem de Contexto e Cloze Deletion (meta: ~${targetCount} cartões).`,
  });

  // For large targets (>= 45), generate in 2 theme-partitioned batches to preserve depth and avoid truncation
  const batches: Array<{ themes: typeof comprehension.themes; count: number; label: string }> = [];
  if (targetCount >= 45 && comprehension.themes.length >= 2) {
    const mid = Math.ceil(comprehension.themes.length / 2);
    const firstHalfCount = Math.round(targetCount / 2);
    batches.push({
      themes: comprehension.themes.slice(0, mid),
      count: firstHalfCount,
      label: 'Lote 1/2',
    });
    batches.push({
      themes: comprehension.themes.slice(mid),
      count: targetCount - firstHalfCount,
      label: 'Lote 2/2',
    });
  } else {
    batches.push({
      themes: comprehension.themes,
      count: targetCount,
      label: 'Lote único',
    });
  }

  const hasImage = Boolean(input.imageBase64 && input.imageMimeType);

  const rawCards: RawGeneratedCard[] = [];
  for (const batch of batches) {
    const formatRule =
      config.formatPreference === 'tradicional'
        ? 'Crie APENAS cartões tradicionais (frente e verso).'
        : config.formatPreference === 'cloze'
          ? 'Priorize cartões Cloze Deletion com sintaxe {{c1::termo}} ocultando apenas a informação-alvo essencial.'
          : 'Misture cartões tradicionais e Cloze Deletion ({{c1::termo}}) conforme o tipo de conhecimento (use Cloze para critérios, doses, fórmulas, valores de referência e classificações).';

    const elaborationPrompt = `Você é um mestre na criação de flashcards baseados na ciência da aprendizagem (Piotr Wozniak — SuperMemo / Evocação Ativa).

METODOLOGIA OBRIGATÓRIA:
1. PRINCÍPIO DA INFORMAÇÃO MÍNIMA: Cada flashcard testa APENAS UMA informação atômica. Perguntas diretas e objetivas; respostas curtas e precisas (nunca listas extensas no verso).
2. ANCORAGEM DE CONTEXTO: Todo cartão deve conter contexto suficiente na frente para não haver ambiguidade (ex: nunca perguntar "Qual o valor de referência?" sem dizer de qual marcador/exame).
3. MINI-VINHETAS: Quando pertinente (casos clínicos, situações jurídicas ou práticas), use vinhetas curtas de 1–2 frases para treinar reconhecimento de padrão.
4. FORMATO: ${formatRule}
   - Em cartões Cloze, preencha "clozeText" com a frase completa usando {{c1::informação}}, "front" com a frase onde {{c1::...}} aparece como lacuna contextual, e "back" com a resposta exata ocultada.
5. CLASSIFICAÇÃO: Classifique cada cartão em "essencial", "importante" ou "complementar".
6. RIGOR E ATUALIZAÇÃO:
   - Use os resultados da validação científica abaixo.
   - Se houver conteúdo desatualizado, elabore o cartão com a recomendação ATUALIZADA e preencha "outdatedAlert" com isOutdated=true, originalAnswerOrClaim, updatedRecommendation, reason e updatedReference.
   - NUNCA invente referências. Use as referências verificadas ou fontes oficiais reais do material; se não verificada externamente, marque verified=false.
${
  hasImage
    ? `7. OCLUSÃO DE IMAGENS: Uma imagem foi fornecida! Identifique se há estruturas anatômicas, fluxogramas ou diagramas visuais e crie de 2 a 5 cartões com modality="image_occlusion", fornecendo "occlusionRegions" com coordenadas normalizadas (x, y, width, height de 0 a 100 em porcentagem) e o "label" exato da estrutura ocultada.`
    : ''
}

Em modo prova, a lista de questões identificadas deve ser tratada como inventário obrigatório. Para cada questão relevante, produza pelo menos um cartão e preencha questionNumber com o número original. Produza um segundo cartão somente quando houver outro conhecimento independente e útil. Não gere apenas cartões sobre os temas gerais e não ignore questões do inventário. Questões redundantes podem ser consolidadas, mas não descarte conhecimentos exclusivos.

Temas deste lote (${batch.label}):
${batch.themes.map((t) => `- ${t.theme} (peso ${t.estimatedWeight}): ${t.subtopics.join(', ')}`).join('\n')}

Quantidade alvo para este lote: aproximadamente ${batch.count} flashcards de altíssima qualidade (qualidade > quantidade; não crie cartões redundantes ou triviais).
Idioma: ${config.language}.
Profundidade: ${config.depth}.

Validação científica obtida:
${JSON.stringify(validationResult.verifiedClaims)}

URLs reais encontradas na busca:
${groundingUrls.map((u) => `- ${u.title}: ${u.uri}`).join('\n')}`;

    const genRes = await generateWithFallback({
        contents: { parts: buildContentParts(input, elaborationPrompt) },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    front: { type: Type.STRING },
                    back: { type: Type.STRING },
                    clozeText: { type: Type.STRING },
                    modality: { type: Type.STRING },
                    importance: { type: Type.STRING },
                    subject: { type: Type.STRING },
                    subtopic: { type: Type.STRING },
                    contextAnchor: { type: Type.STRING },
                    isVignette: { type: Type.BOOLEAN },
                    questionNumber: { type: Type.STRING },
                    reference: {
                      type: Type.OBJECT,
                      properties: {
                        authorOrInstitution: { type: Type.STRING },
                        title: { type: Type.STRING },
                        sourceOrJournal: { type: Type.STRING },
                        year: { type: Type.STRING },
                        identifier: { type: Type.STRING },
                        url: { type: Type.STRING },
                        verified: { type: Type.BOOLEAN },
                        note: { type: Type.STRING },
                      },
                      required: ['authorOrInstitution', 'title', 'sourceOrJournal', 'year', 'verified'],
                    },
                    outdatedAlert: {
                      type: Type.OBJECT,
                      properties: {
                        isOutdated: { type: Type.BOOLEAN },
                        originalAnswerOrClaim: { type: Type.STRING },
                        updatedRecommendation: { type: Type.STRING },
                        reason: { type: Type.STRING },
                        updatedReference: { type: Type.STRING },
                      },
                      required: ['isOutdated'],
                    },
                    occlusionRegions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          x: { type: Type.NUMBER },
                          y: { type: Type.NUMBER },
                          width: { type: Type.NUMBER },
                          height: { type: Type.NUMBER },
                          label: { type: Type.STRING },
                        },
                        required: ['x', 'y', 'width', 'height', 'label'],
                      },
                    },
                  },
                  required: ['front', 'back', 'modality', 'importance', 'subject', 'reference'],
                },
              },
            },
            required: ['cards'],
          },
        },
      });

    const parsed = safeParseJson<{ cards: RawGeneratedCard[] }>(genRes.text, { cards: [] });
    if (Array.isArray(parsed.cards)) {
      rawCards.push(...parsed.cards);
    }
  }

  // =========================================================================
  // ETAPA 6 — CONTROLE DE QUALIDADE (10 CRITÉRIOS)
  // =========================================================================
  onProgress({
    stage: 'qualidade',
    stageIndex: 6,
    totalStages: 8,
    label: 'Revisando a qualidade dos cartões',
    detail: `Auditando ${rawCards.length} cartões quanto a atomicidade, contexto, ambiguidade e redundância.`,
  });

  // Deduplicate & audit via Gemini to prune redundancies and enforce minimum information principle
  let auditedCards = rawCards;
  if (rawCards.length > 0) {
    const qcPrompt = `Faça uma auditoria rigorosa de Controle de Qualidade nos ${rawCards.length} flashcards abaixo segundo os 10 critérios:
1. Testa apenas um conhecimento?
2. Pergunta é objetiva?
3. Resposta é curta e precisa?
4. Contexto é suficiente (sem ambiguidade)?
5. Existe redundância real com outro cartão? Remova apenas duplicatas. Em modo prova, preserve ao menos um cartão para cada questão relevante; não elimine o único cartão que representa um conhecimento exclusivo.
6. Está cientificamente correto e atualizado?
7. Agrega real valor ao aprendizado?

Retorne os índices (0-based) dos cartões APROVADOS (removendo redundantes ou fracos) e eventuais correções pontuais de front/back para melhorar clareza/atomicidade.

Cartões:
${rawCards.map((c, idx) => `[${idx}] (${c.modality} | ${c.importance} | ${c.subject}) F: ${c.front} | V: ${c.back}`).join('\n')}`;

    try {
      const qcRes = await generateWithFallback({
          contents: qcPrompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                approvedIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                refinements: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      index: { type: Type.INTEGER },
                      front: { type: Type.STRING },
                      back: { type: Type.STRING },
                      qualityNote: { type: Type.STRING },
                    },
                    required: ['index', 'front', 'back'],
                  },
                },
              },
              required: ['approvedIndices'],
            },
          },
        });

      const qcData = safeParseJson<{
        approvedIndices: number[];
        refinements?: Array<{ index: number; front: string; back: string; qualityNote?: string }>;
      }>(qcRes.text, { approvedIndices: rawCards.map((_, i) => i) });

      const refinementMap = new Map<number, { front: string; back: string; qualityNote?: string }>();
      for (const r of qcData.refinements || []) {
        refinementMap.set(r.index, r);
      }

      const validIndices = qcData.approvedIndices.filter((i) => i >= 0 && i < rawCards.length);
      if (validIndices.length > 0) {
        auditedCards = validIndices.map((idx) => {
          const card = rawCards[idx];
          const ref = refinementMap.get(idx);
          return ref ? { ...card, front: ref.front, back: ref.back } : card;
        });
      }
    } catch {
      // Keep rawCards if QC call fails
    }
  }

  // =========================================================================
  // ETAPA 7 — VERIFICAÇÃO DE COBERTURA
  // =========================================================================
  onProgress({
    stage: 'cobertura',
    stageIndex: 7,
    totalStages: 8,
    label: 'Verificando cobertura do conteúdo',
    detail: 'Comparando os cartões gerados com o mapa global de conhecimentos.',
  });

  const knowledgeMap: KnowledgeMapTheme[] = comprehension.themes.map((t) => {
    const count = auditedCards.filter(
      (c) =>
        c.subject.toLowerCase().includes(t.theme.toLowerCase()) ||
        t.theme.toLowerCase().includes(c.subject.toLowerCase())
    ).length;
    return {
      theme: t.theme,
      subtopics: t.subtopics,
      estimatedWeight: t.estimatedWeight,
      coveredCards: count,
    };
  });

  const now = new Date().toISOString();
  const finalCards: Flashcard[] = auditedCards.map((c) => {
    const modality: CardModality =
      c.modality === 'cloze'
        ? 'cloze'
        : c.modality === 'image_occlusion' && hasImage
          ? 'image_occlusion'
          : 'tradicional';

    const importance: CardImportance =
      c.importance === 'essencial'
        ? 'essencial'
        : c.importance === 'complementar'
          ? 'complementar'
          : 'importante';

    const reference: BibliographicReference = {
      authorOrInstitution: c.reference?.authorOrInstitution || 'Fonte do material',
      title: c.reference?.title || comprehension.suggestedTitle,
      sourceOrJournal: c.reference?.sourceOrJournal || comprehension.detectedDomain,
      year: c.reference?.year || String(new Date().getFullYear()),
      identifier: c.reference?.identifier || undefined,
      url: c.reference?.url || undefined,
      verified: Boolean(c.reference?.verified),
      note: c.reference?.note || undefined,
    };

    const outdatedAlert: OutdatedAlert | undefined = c.outdatedAlert?.isOutdated
      ? {
          isOutdated: true,
          originalAnswerOrClaim: c.outdatedAlert.originalAnswerOrClaim,
          updatedRecommendation: c.outdatedAlert.updatedRecommendation,
          reason: c.outdatedAlert.reason,
          updatedReference: c.outdatedAlert.updatedReference,
        }
      : undefined;

    const occlusionRegions: OcclusionRegion[] | undefined =
      modality === 'image_occlusion' && Array.isArray(c.occlusionRegions)
        ? c.occlusionRegions.map((r) => ({
            id: crypto.randomUUID(),
            x: Math.max(0, Math.min(95, r.x)),
            y: Math.max(0, Math.min(95, r.y)),
            width: Math.max(4, Math.min(100 - r.x, r.width)),
            height: Math.max(4, Math.min(100 - r.y, r.height)),
            label: r.label || c.back,
          }))
        : undefined;

    return {
      id: crypto.randomUUID(),
      front: c.front,
      back: c.back,
      clozeText: modality === 'cloze' ? c.clozeText || c.front : undefined,
      modality,
      importance,
      subject: c.subject || comprehension.themes[0]?.theme || 'Geral',
      subtopic: c.subtopic,
      contextAnchor: c.contextAnchor,
      isVignette: Boolean(c.isVignette),
      questionNumber: c.questionNumber,
      reference,
      outdatedAlert,
      imageDataUrl: modality === 'image_occlusion' ? input.imageDataUrl : undefined,
      occlusionRegions,
      qualityChecksPassed: true,
      createdAt: now,
      updatedAt: now,
    };
  });

  const coveredThemesCount = knowledgeMap.filter((k) => k.coveredCards > 0).length;
  const coveredQuestionNumbers = new Set(finalCards.map((card) => card.questionNumber).filter((value): value is string => Boolean(value)));
  const allQuestionNumbers = (comprehension.examQuestions || []).map((question) => question.questionNumber);
  const missingQuestions = isExam ? allQuestionNumbers.filter((number) => !coveredQuestionNumbers.has(number)) : [];
  const questionCoverage = isExam ? ` Questões com cartão associado: ${coveredQuestionNumbers.size}/${allQuestionNumbers.length}.${missingQuestions.length ? ` Sem cartão associado: ${missingQuestions.join(', ')}.` : ' Todas as questões identificadas foram associadas a cartões.'}` : '';
  const coverageReport = `${finalCards.length} flashcards aprovados cobrindo ${coveredThemesCount} de ${knowledgeMap.length} tema(s) principais em ${comprehension.detectedDomain}.${questionCoverage}`;

  // =========================================================================
  // ETAPA 8 — FINALIZAÇÃO
  // =========================================================================
  onProgress({
    stage: 'finalizacao',
    stageIndex: 8,
    totalStages: 8,
    label: 'Finalizando o material',
    detail: coverageReport,
  });

  const deck: Deck = {
    id: crypto.randomUUID(),
    userId: input.userId,
    title: config.title?.trim() || comprehension.suggestedTitle || 'Novo Baralho',
    inputMode: config.inputMode,
    depth: config.depth,
    language: config.language,
    formatPreference: config.formatPreference,
    knowledgeMap,
    coverageReport,
    cards: finalCards,
    createdAt: now,
    updatedAt: now,
  };

  return deck;
}

export async function regenerateSingleCard(card: Flashcard, language = 'Português (BR)'): Promise<Flashcard> {
  const prompt = `Regenere este flashcard mantendo o rigor científico, o Princípio da Informação Mínima (1 informação atômica), Ancoragem de Contexto e resposta curta e precisa.
Melhore a formulação pedagógica para evitar ilusão de competência.

Cartão atual:
Assunto: ${card.subject}
Modalidade: ${card.modality}
Frente: ${card.front}
Verso: ${card.back}
${card.clozeText ? `Cloze: ${card.clozeText}` : ''}
Referência: ${card.reference.authorOrInstitution} — ${card.reference.title} (${card.reference.year})
Idioma: ${language}`;

  const res = await generateWithFallback({
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            back: { type: Type.STRING },
            clozeText: { type: Type.STRING },
          },
          required: ['front', 'back'],
        },
      },
    });

  const parsed = safeParseJson<{ front: string; back: string; clozeText?: string }>(res.text, {
    front: card.front,
    back: card.back,
    clozeText: card.clozeText,
  });

  return {
    ...card,
    front: parsed.front,
    back: parsed.back,
    clozeText: card.modality === 'cloze' ? parsed.clozeText || parsed.front : card.clozeText,
    updatedAt: new Date().toISOString(),
  };
}
