'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { UserSession } from '@/lib/types';

interface WorkspaceModalProps {
  session: UserSession;
  onClose: () => void;
  onUpdated: (session: UserSession) => void;
}

export function WorkspaceModal({ session, onClose, onUpdated }: WorkspaceModalProps) {
  const [name, setName] = useState(session.name);
  const [email, setEmail] = useState(session.email || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar espaço de estudo.');
      onUpdated(data.session);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">Espaço de estudo individual</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-500 hover:text-slate-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Cada espaço mantém seus baralhos, materiais processados e histórico isolados dos demais usuários.
        </p>

        {error && (
          <p className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nome do estudante</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              E-mail identificador (opcional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Alternar espaço'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
