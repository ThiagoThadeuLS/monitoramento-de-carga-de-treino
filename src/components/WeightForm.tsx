import React, { useState } from 'react';
import { Scale, Send, CheckCircle2, AlertCircle, Plus, Minus } from 'lucide-react';
import { WeightRecord } from '../types';
import { todayLocalISO } from '../lib/date';

interface WeightFormProps {
  athleteId: string;
  athleteName?: string;
  onSubmit: (record: Omit<WeightRecord, 'id' | 'created_at'>) => Promise<boolean>;
}

export const WeightForm: React.FC<WeightFormProps> = ({ athleteId, athleteName, onSubmit }) => {
  const [weight, setWeight] = useState<string>('75.0');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAdjust = (delta: number) => {
    const current = parseFloat(weight) || 75.0;
    const next = Math.max(30, Math.min(200, current + delta));
    setWeight(next.toFixed(1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!athleteId) {
      setErrorMsg('Por favor, selecione seu nome no topo antes de enviar.');
      return;
    }

    const numericWeight = parseFloat(weight.replace(',', '.'));
    if (isNaN(numericWeight) || numericWeight <= 30 || numericWeight >= 250) {
      setErrorMsg('Por favor, informe um peso válido entre 30 e 250 kg.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    const todayStr = todayLocalISO();

    const ok = await onSubmit({
      athlete_id: athleteId,
      date: todayStr,
      weight: parseFloat(numericWeight.toFixed(2)),
    });

    setSubmitting(false);

    if (ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } else {
      setErrorMsg('Erro ao salvar peso. Tente novamente.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header Info */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Scale className="w-6 h-6 text-sky-400" />
            Controle de Peso Corporal
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Informe sua pesagem de hoje para acompanhamento hídrico e de composição corporal.
          </p>
        </div>
      </div>

      {/* Main Weight Input Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center space-y-6">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">
          Peso de Hoje (kg)
        </label>

        {/* Big Input with kg unit */}
        <div className="inline-flex items-baseline justify-center gap-2">
          <input
            type="number"
            step="0.05"
            min="30"
            max="250"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-48 text-center font-black text-5xl sm:text-6xl text-white bg-slate-800/80 border-2 border-slate-700 rounded-2xl py-3 px-2 focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all"
            placeholder="75.0"
          />
          <span className="text-2xl font-bold text-slate-400">kg</span>
        </div>

        {/* Quick Steppers (+/-) for convenient mobile taps */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleAdjust(-0.5)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl text-xs font-bold text-slate-300 transition-colors"
          >
            -0.5 kg
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(-0.1)}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl text-slate-200 transition-colors"
            title="Diminuir 100g"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(+0.1)}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl text-slate-200 transition-colors"
            title="Aumentar 100g"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleAdjust(+0.5)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl text-xs font-bold text-slate-300 transition-colors"
          >
            +0.5 kg
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {errorMsg && (
        <div className="p-3 bg-red-950/50 border border-red-800 rounded-xl flex items-center gap-2 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-600 rounded-xl flex items-center gap-3 text-emerald-300 text-sm animate-fade-in">
          <CheckCircle2 className="w-6 h-6 flex-shrink-0 text-emerald-400" />
          <div>
            <p className="font-bold">Peso registrado com sucesso!</p>
            <p className="text-xs text-emerald-300/80">Valor de {weight} kg computado para {athleteName || 'o atleta'}.</p>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={submitting || !athleteId}
        className="w-full py-4 px-6 rounded-xl font-bold text-base bg-sky-500 hover:bg-sky-400 active:scale-[0.99] text-slate-950 shadow-lg shadow-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        <Send className="w-5 h-5" />
        {submitting ? 'Salvando...' : 'Confirmar e Salvar Peso'}
      </button>
    </form>
  );
};
