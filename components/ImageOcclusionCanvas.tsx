'use client';

import React, { useRef, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type { OcclusionRegion } from '@/lib/types';

interface ImageOcclusionCanvasProps {
  imageDataUrl: string;
  regions: OcclusionRegion[];
  revealed: boolean;
  onToggleReveal?: () => void;
  editable?: boolean;
  onChangeRegions?: (regions: OcclusionRegion[]) => void;
}

export function ImageOcclusionCanvas({
  imageDataUrl,
  regions,
  revealed,
  onToggleReveal,
  editable = false,
  onChangeRegions,
}: ImageOcclusionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const getRelativePercent = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editable) return;
    const pt = getRelativePercent(e.clientX, e.clientY);
    setDrawingStart(pt);
    setDraftRect({ x: pt.x, y: pt.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!editable || !drawingStart) return;
    const pt = getRelativePercent(e.clientX, e.clientY);
    setDraftRect({
      x: Math.min(drawingStart.x, pt.x),
      y: Math.min(drawingStart.y, pt.y),
      width: Math.abs(pt.x - drawingStart.x),
      height: Math.abs(pt.y - drawingStart.y),
    });
  };

  const handleMouseUp = () => {
    if (!editable || !drawingStart || !draftRect) {
      setDrawingStart(null);
      setDraftRect(null);
      return;
    }
    if (draftRect.width >= 3 && draftRect.height >= 3 && onChangeRegions) {
      const newRegion: OcclusionRegion = {
        id: crypto.randomUUID(),
        x: Math.round(draftRect.x * 10) / 10,
        y: Math.round(draftRect.y * 10) / 10,
        width: Math.round(draftRect.width * 10) / 10,
        height: Math.round(draftRect.height * 10) / 10,
        label: `Região ${regions.length + 1}`,
      };
      onChangeRegions([...regions, newRegion]);
    }
    setDrawingStart(null);
    setDraftRect(null);
  };

  const updateLabel = (id: string, label: string) => {
    if (!onChangeRegions) return;
    onChangeRegions(regions.map((r) => (r.id === id ? { ...r, label } : r)));
  };

  const removeRegion = (id: string) => {
    if (!onChangeRegions) return;
    onChangeRegions(regions.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`relative inline-block max-w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900/5 select-none ${
          editable ? 'cursor-crosshair' : 'cursor-pointer'
        }`}
        onClick={() => {
          if (!editable && onToggleReveal) onToggleReveal();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageDataUrl}
          alt="Imagem anatômica ou esquema para oclusão"
          referrerPolicy="no-referrer"
          className="block max-h-[380px] w-auto max-w-full object-contain"
          draggable={false}
        />

        {regions.map((reg, idx) => (
          <div
            key={reg.id}
            style={{
              left: `${reg.x}%`,
              top: `${reg.y}%`,
              width: `${reg.width}%`,
              height: `${reg.height}%`,
            }}
            className={`absolute flex items-center justify-center rounded-sm border transition-all ${
              revealed || editable
                ? 'bg-emerald-500/20 border-emerald-600 text-emerald-950'
                : 'bg-amber-400/95 border-amber-700 text-amber-950 shadow-sm'
            }`}
          >
            <span className="px-1 text-[11px] font-semibold leading-tight text-center truncate max-w-full">
              {revealed || editable ? reg.label : `? (${idx + 1})`}
            </span>
          </div>
        ))}

        {draftRect && (
          <div
            style={{
              left: `${draftRect.x}%`,
              top: `${draftRect.y}%`,
              width: `${draftRect.width}%`,
              height: `${draftRect.height}%`,
            }}
            className="absolute border-2 border-dashed border-sky-600 bg-sky-400/25 pointer-events-none"
          />
        )}
      </div>

      {!editable && onToggleReveal && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleReveal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {revealed ? 'Ocultar regiões' : 'Revelar regiões ocultadas'}
          </button>
          <span className="text-xs text-slate-500">
            {regions.length} região(ões) de oclusão preservadas na exportação Anki
          </span>
        </div>
      )}

      {editable && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-sky-700" />
            Clique e arraste sobre a imagem para desenhar novas máscaras de oclusão.
          </p>
          {regions.length > 0 && (
            <div className="space-y-1.5">
              {regions.map((reg, idx) => (
                <div key={reg.id} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500 w-6 tabular-nums">#{idx + 1}</span>
                  <input
                    type="text"
                    value={reg.label}
                    onChange={(e) => updateLabel(reg.id, e.target.value)}
                    placeholder="Nome da estrutura ocultada"
                    className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-600/30"
                  />
                  <button
                    type="button"
                    onClick={() => removeRegion(reg.id)}
                    aria-label="Remover região"
                    className="p-1.5 text-slate-500 hover:text-red-600 rounded-md"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
