import { stampInAppZone } from './date';

/**
 * Exportação em CSV pronta para o Excel em português:
 * separador ";", vírgula decimal e UTF-8 com BOM (acentos corretos ao abrir com dois cliques).
 */
export interface CsvColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined | boolean;
}

// Texto que começa com = + - @ (ou tab/enter) vira fórmula no Excel: um atleta poderia
// escrever "=HYPERLINK(...)" na observação. Prefixar com ' faz o Excel tratar como texto.
const FORMULA_START = /^[=+\-@\t\r]/;

export const cell = (v: string | number | null | undefined | boolean): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  let s: string;
  if (typeof v === 'number') {
    s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
  } else {
    s = FORMULA_START.test(v) ? `'${v}` : v;
  }
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => cell(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(';'));
  return [head, ...body].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Data AAAA-MM-DD -> DD/MM/AAAA. */
export const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Hora (HH:MM) de um envio, no horário de Brasília. */
export const localTime = (iso?: string) => stampInAppZone(iso)[1];

/** Nome de arquivo seguro: "pse_2026-10-01_a_2026-10-31". */
export const fileSlug = (...parts: string[]) =>
  parts
    .join('_')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .toLowerCase();

/** Peso com no máximo 2 casas e vírgula: 59,2 kg. */
export const formatKg = (v: number) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
