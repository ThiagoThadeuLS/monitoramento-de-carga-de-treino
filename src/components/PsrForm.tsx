import React, { useState } from 'react';
import { Activity, Battery, Moon, Zap, Smile, HeartPulse, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { PsrRecord } from '../types';

interface PsrFormProps {
  athleteId: string;
  athleteName?: string;
  onSubmit: (record: Omit<PsrRecord, 'id' | 'created_at'>) => Promise<boolean>;
}

interface MetricConfig {
  key: 'psr_score' | 'fatigue_score' | 'sleep_score' | 'muscle_soreness_score' | 'stress_score' | 'mood_score';
  title: string;
  subtitle: string;
  icon: React.ElementType;
  lowLabel: string;   // 1
  highLabel: string;  // 10
}

const METRICS: MetricConfig[] = [
  {
    key: 'psr_score',
    title: 'PSR (Recuperação Geral)',
    subtitle: 'Como você avalia sua recuperação física hoje?',
    icon: HeartPulse,
    lowLabel: '1 = Péssima recuperação',
    highLabel: '10 = Totalmente recuperado',
  },
  {
    key: 'fatigue_score',
    title: 'Nível de Disposição / Fadiga',
    subtitle: 'Nível de energia para encarar as atividades de hoje',
    icon: Battery,
    lowLabel: '1 = Exausto / Sem energia',
    highLabel: '10 = 100% Disposto / Sem fadiga',
  },
  {
    key: 'sleep_score',
    title: 'Qualidade do Sono',
    subtitle: 'Profundidade e descanso do sono na última noite',
    icon: Moon,
    lowLabel: '1 = Sono péssimo / Insônia',
    highLabel: '10 = Sono perfeito / Revigorante',
  },
  {
    key: 'muscle_soreness_score',
    title: 'Dor Muscular (DOMS)',
    subtitle: 'Presença de dores musculares ou rigidez física',
    icon: Activity,
    lowLabel: '1 = Muita dor muscular',
    highLabel: '10 = Nenhuma dor muscular',
  },
  {
    key: 'stress_score',
    title: 'Nível de Estresse / Calma',
    subtitle: 'Estresse psicológico, pressão ou ansiedade',
    icon: Zap,
    lowLabel: '1 = Muito estressado / Ansioso',
    highLabel: '10 = Super calmo / Tranquilo',
  },
  {
    key: 'mood_score',
    title: 'Humor & Motivação',
    subtitle: 'Entusiasmo e estado de espírito para treinar hoje',
    icon: Smile,
    lowLabel: '1 = Muito desanimado / Irritado',
    highLabel: '10 = Muito motivado / Positivo',
  },
];

// Função de cores: Pior (1-3) Vermelho | Médio (4-6) Amarelo | Bom (7-10) Verde
function getScoreTheme(score: number) {
  if (score <= 3) {
    return {
      cardClass: 'bg-red-950/35 border-red-500/60 shadow-md shadow-red-950/30',
      badgeClass: 'bg-red-500/25 border-red-500/60 text-red-300',
      iconBoxClass: 'bg-red-500/20 text-red-400',
      thumbColor: '#ef4444',
      statusText: 'Ruim',
      statusClass: 'text-red-400',
    };
  }
  if (score <= 6) {
    return {
      cardClass: 'bg-amber-950/30 border-amber-500/50 shadow-md shadow-amber-950/30',
      badgeClass: 'bg-amber-500/20 border-amber-500/50 text-amber-300',
      iconBoxClass: 'bg-amber-500/20 text-amber-400',
      thumbColor: '#f59e0b',
      statusText: 'Mais ou Menos',
      statusClass: 'text-amber-400',
    };
  }
  return {
    cardClass: 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-950/30',
    badgeClass: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
    iconBoxClass: 'bg-emerald-500/20 text-emerald-400',
    thumbColor: '#10b981',
    statusText: 'Bom',
    statusClass: 'text-emerald-400',
  };
}

export const PsrForm: React.FC<PsrFormProps> = ({ athleteId, athleteName, onSubmit }) => {
  const [values, setValues] = useState<{
    psr_score: number;
    fatigue_score: number;
    sleep_score: number;
    muscle_soreness_score: number;
    stress_score: number;
    mood_score: number;
  }>({
    psr_score: 7,
    fatigue_score: 7,
    sleep_score: 7,
    muscle_soreness_score: 8,
    stress_score: 8,
    mood_score: 8,
  });

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSliderChange = (key: keyof typeof values, val: number) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

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
      ...values,
    });

    setSubmitting(false);

    if (ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } else {
      setErrorMsg('Erro ao registrar PSR. Tente novamente.');
    }
  };

  // Cálculo da pontuação média de bem-estar (1 a 10)
  const averageValue = (
    (values.psr_score +
      values.fatigue_score +
      values.sleep_score +
      values.muscle_soreness_score +
      values.stress_score +
      values.mood_score) /
    6
  );
  const averageScore = averageValue.toFixed(1);
  const avgTheme = getScoreTheme(Math.round(averageValue));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header Info */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-sky-400" />
            PSR & Questionário de Bem-Estar
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Questionário pré-treino para monitorar sua prontidão física e psicológica.
          </p>
        </div>

        {/* Média Geral */}
        <div className={`border px-3 py-1.5 rounded-2xl text-center w-20 flex-shrink-0 transition-all ${avgTheme.cardClass}`}>
          <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">Média</span>
          <span className={`text-base font-black ${avgTheme.statusClass}`}>{averageScore}</span>
        </div>
      </div>

      {/* 6 Sliders - Títulos 100% visíveis e sem pulos de layout ao deslizar */}
      <div className="space-y-4">
        {METRICS.map((metric) => {
          const IconComponent = metric.icon;
          const score = values[metric.key];
          const theme = getScoreTheme(score);

          return (
            <div
              key={metric.key}
              className={`border rounded-2xl p-4 sm:p-5 transition-colors duration-200 space-y-3.5 ${theme.cardClass}`}
            >
              {/* Header da Caixinha: Título Completo sem cortes à esquerda, Número e Status fixos à direita */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className={`p-2 rounded-xl flex-shrink-0 mt-0.5 transition-colors duration-200 ${theme.iconBoxClass}`}>
                    <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="flex-1">
                    {/* Título 100% aparente, sem truncate */}
                    <h3 className="text-sm sm:text-base font-bold text-white leading-snug">
                      {metric.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-snug mt-0.5">
                      {metric.subtitle}
                    </p>
                  </div>
                </div>

                {/* Coluna da Direita Fixa: Nota + Status (largura constante de 68px para estabilidade absoluta) */}
                <div className="flex flex-col items-center justify-center flex-shrink-0 w-[68px]">
                  <div className={`w-12 h-9 rounded-xl border text-base sm:text-lg font-black flex items-center justify-center transition-colors duration-200 ${theme.badgeClass}`}>
                    {score}
                  </div>
                  <span className={`text-[10px] uppercase font-bold tracking-wider mt-1 text-center truncate w-full transition-colors duration-200 ${theme.statusClass}`}>
                    {theme.statusText}
                  </span>
                </div>
              </div>

              {/* Slider Input with Dynamic Thumb Color */}
              <div className="pt-1">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={score}
                  onChange={(e) => handleSliderChange(metric.key, Number(e.target.value))}
                  style={{ ['--thumb-color' as any]: theme.thumbColor }}
                  className="w-full h-2.5 transition-all"
                />
              </div>

              {/* Range labels inferiores com altura de linha fixa */}
              <div className="flex justify-between items-center text-[11px] font-medium h-4 leading-none">
                <span className={`truncate max-w-[48%] transition-colors duration-200 ${score <= 3 ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                  {metric.lowLabel}
                </span>
                <span className={`truncate max-w-[48%] text-right transition-colors duration-200 ${score >= 7 ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
                  {metric.highLabel}
                </span>
              </div>
            </div>
          );
        })}
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
            <p className="font-bold">Questionário de Recuperação enviado!</p>
            <p className="text-xs text-emerald-300/80">Obrigado por responder, {athleteName || 'atleta'}.</p>
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
        {submitting ? 'Salvando...' : 'Enviar Questionário de Recuperação (PSR)'}
      </button>
    </form>
  );
};
