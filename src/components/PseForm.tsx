import React, { useState } from 'react';
import { Flame, CheckCircle2, AlertCircle, Send, Target, Swords, Dumbbell } from 'lucide-react';
import { PseRecord } from '../types';

interface PseFormProps {
  athleteId: string;
  athleteName?: string;
  onSubmit: (record: Omit<PseRecord, 'id' | 'created_at'>) => Promise<boolean>;
}

const TRAINING_TYPES = [
  { id: 'Treino Técnico', label: 'Treino Técnico', desc: 'Fundamentos & Técnicas', icon: Target },
  { id: 'Treino Randori', label: 'Treino Randori', desc: 'Lutas & Simulações', icon: Swords },
  { id: 'Treino Físico', label: 'Treino Físico', desc: 'Força & Condicionamento', icon: Dumbbell },
];

const FOSTER_SCALE_LABELS: Record<number, { text: string; color: string; desc: string; thumbColor: string; cardClass: string }> = {
  1: { text: 'Muito, Muito Fácil', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', desc: 'Ritmo de repouso / caminhada leve', thumbColor: '#10b981', cardClass: 'bg-emerald-950/20 border-emerald-500/40 shadow-emerald-950/20' },
  2: { text: 'Muito Fácil', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', desc: 'Respiração normal, conversa fácil', thumbColor: '#10b981', cardClass: 'bg-emerald-950/20 border-emerald-500/40 shadow-emerald-950/20' },
  3: { text: 'Fácil', color: 'text-green-400 bg-green-500/10 border-green-500/30', desc: 'Aquecimento / esforço confortável', thumbColor: '#22c55e', cardClass: 'bg-green-950/20 border-green-500/40 shadow-green-950/20' },
  4: { text: 'Moderado', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', desc: 'Começando a suar, ritmo sustentável', thumbColor: '#eab308', cardClass: 'bg-yellow-950/20 border-yellow-500/40 shadow-yellow-950/20' },
  5: { text: 'Um Pouco Difícil', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', desc: 'Treino firme, respiração acelerada', thumbColor: '#f59e0b', cardClass: 'bg-amber-950/20 border-amber-500/40 shadow-amber-950/20' },
  6: { text: 'Difícil', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30', desc: 'Esforço considerável, conversa curta', thumbColor: '#f59e0b', cardClass: 'bg-amber-950/20 border-amber-500/40 shadow-amber-950/20' },
  7: { text: 'Muito Difícil', color: 'text-orange-500 bg-orange-500/10 border-orange-500/30', desc: 'Treino intenso, pernas pesadas', thumbColor: '#f97316', cardClass: 'bg-orange-950/25 border-orange-500/40 shadow-orange-950/20' },
  8: { text: 'Muito, Muito Difícil', color: 'text-rose-500 bg-rose-500/10 border-rose-500/30', desc: 'Perto do limite, manter o ritmo custa muito', thumbColor: '#f43f5e', cardClass: 'bg-rose-950/30 border-rose-500/50 shadow-rose-950/30' },
  9: { text: 'Quase Máximo / Exaustivo', color: 'text-red-500 bg-red-500/10 border-red-500/30', desc: 'Muito perto da exaustão total', thumbColor: '#ef4444', cardClass: 'bg-red-950/35 border-red-500/60 shadow-red-950/40' },
  10: { text: 'Máximo Absoluto', color: 'text-red-400 bg-red-600/20 border-red-500/50', desc: 'O maior esforço físico possível', thumbColor: '#dc2626', cardClass: 'bg-red-950/45 border-red-600/70 shadow-red-950/50' },
};

export const PseForm: React.FC<PseFormProps> = ({ athleteId, athleteName, onSubmit }) => {
  const [trainingType, setTrainingType] = useState<string>('Treino Técnico');
  const [rpeScore, setRpeScore] = useState<number>(5);
  const [didNotTrain, setDidNotTrain] = useState<boolean>(false);
  const [observations, setObservations] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const currentScaleInfo = FOSTER_SCALE_LABELS[rpeScore] || FOSTER_SCALE_LABELS[5];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!athleteId) {
      setErrorMsg('Por favor, selecione seu nome no topo antes de enviar.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    const todayStr = new Date().toISOString().split('T')[0];

    const ok = await onSubmit({
      athlete_id: athleteId,
      date: todayStr,
      training_type: didNotTrain ? undefined : trainingType,
      did_not_train: didNotTrain,
      rpe_score: didNotTrain ? null : rpeScore,
      observations: observations.trim() || undefined,
    });

    setSubmitting(false);

    if (ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      setObservations('');
    } else {
      setErrorMsg('Erro ao registrar resposta. Tente novamente.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header Info */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Flame className="w-6 h-6 text-orange-500" />
            PSE (Esforço da Sessão)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Escala de Foster pós-treino (quão intenso foi o seu treino hoje?)
          </p>
        </div>
      </div>

      {/* Toggle: Não Treinou */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-center justify-between transition-all">
        <div className="pr-4">
          <p className="text-sm font-semibold text-white">Não treinou hoje?</p>
          <p className="text-xs text-slate-400">
            Ative esta opção em caso de folga, lesão, dispensa ou viagem.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={didNotTrain}
            onChange={(e) => setDidNotTrain(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
        </label>
      </div>

      {!didNotTrain ? (
        <>
          {/* Seletor do Tipo de Treino */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Tipo de Treino Realizado
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {TRAINING_TYPES.map((t) => {
                const IconComponent = t.icon;
                const isSelected = trainingType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTrainingType(t.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 ${
                      isSelected
                        ? 'bg-orange-500/10 border-orange-500 text-white shadow-lg shadow-orange-500/10 ring-1 ring-orange-500'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-xl transition-colors ${
                        isSelected ? 'bg-orange-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div>
                      <p className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                        {t.label}
                      </p>
                      <p className="text-[11px] text-slate-400 leading-tight">
                        {t.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slider Area com caixa com altura estável */}
          <div className={`border rounded-2xl p-5 sm:p-6 space-y-5 transition-colors duration-200 shadow-xl ${currentScaleInfo.cardClass}`}>
            <div className="flex items-center justify-between h-9">
              <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Nível de Esforço
              </span>
              <div className={`px-4 py-1.5 rounded-full border text-base sm:text-lg font-black transition-colors ${currentScaleInfo.color}`}>
                {rpeScore} / 10
              </div>
            </div>

            {/* Foster Label Box - Altura fixa de 72px para nunca alterar tamanho */}
            <div className={`px-3 py-2 rounded-xl border text-center transition-colors duration-200 h-[72px] flex flex-col items-center justify-center overflow-hidden ${currentScaleInfo.color}`}>
              <p className="font-bold text-base sm:text-lg leading-tight truncate w-full">
                {currentScaleInfo.text}
              </p>
              <p className="text-xs opacity-90 mt-1 line-clamp-1 w-full leading-tight">
                {currentScaleInfo.desc}
              </p>
            </div>

            {/* Slider Control */}
            <div className="space-y-3 pt-1">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={rpeScore}
                onChange={(e) => setRpeScore(Number(e.target.value))}
                style={{ ['--thumb-color' as any]: currentScaleInfo.thumbColor }}
                className="w-full h-2.5 transition-all"
              />
              
              <div className="flex justify-between text-xs text-slate-300 font-medium px-1 h-4 leading-none">
                <span className="text-emerald-400 font-semibold">1 (Muito Fácil)</span>
                <span className="text-yellow-400 font-semibold">5 (Médio)</span>
                <span className="text-red-400 font-semibold">10 (Máximo)</span>
              </div>
            </div>

            {/* Botões rápidos de 1 a 10 para toque direto */}
            <div className="grid grid-cols-10 gap-1 pt-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
                <button
                  type="button"
                  key={val}
                  onClick={() => setRpeScore(val)}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    rpeScore === val
                      ? 'bg-white text-slate-950 scale-105 shadow-md shadow-white/20'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-amber-950/20 border border-amber-600/30 rounded-2xl p-5 text-center text-amber-300">
          <p className="font-semibold text-sm">Registro de Ausência de Treino</p>
          <p className="text-xs text-amber-300/80 mt-1">
            Por favor, informe no campo de observações abaixo o motivo de não ter treinado (ex: dor muscular, lesão, compromisso, etc.).
          </p>
        </div>
      )}

      {/* Observações */}
      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Observações {didNotTrain && <span className="text-amber-400 font-normal">(Recomendado preencher o motivo)</span>}
        </label>
        <textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder={
            didNotTrain
              ? "Ex: Poupado devido a desconforto no joelho direito..."
              : "Ex: Treino muito pesado no final; senti cansaço nos últimos 20 minutos..."
          }
          rows={3}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm resize-none"
        />
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
            <p className="font-bold">PSE registrada com sucesso!</p>
            <p className="text-xs text-emerald-300/80">Dados salvos para {athleteName || 'o atleta'}.</p>
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
        {submitting ? 'Salvando...' : 'Enviar Resposta de PSE'}
      </button>
    </form>
  );
};
