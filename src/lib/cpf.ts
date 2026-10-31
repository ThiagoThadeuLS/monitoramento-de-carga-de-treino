/** Mantém só os dígitos (máx. 11). */
export function onlyCpfDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

/** Aplica a máscara 000.000.000-00 enquanto o usuário digita. */
export function formatCpf(value: string): string {
  const d = onlyCpfDigits(value);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Valida os dígitos verificadores do CPF. */
export function isValidCpf(value: string): boolean {
  const d = onlyCpfDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const checkDigit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === Number(d[9]) && checkDigit(10) === Number(d[10]);
}
