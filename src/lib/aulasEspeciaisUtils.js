// Helpers compartilhados entre AdminCalendario.jsx (CRUD) e
// FamilyCalendario.jsx (consulta) pra Aulas Especiais — grade recorrente
// (Yoga toda Segunda, Educação Física toda Terça e Quinta, Biologia
// primeira Terça do mês...), diferente dos eventos_calendario de data fixa.

export const DIAS_SEMANA = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export const OCORRENCIAS_MES = [
  { value: 'primeira', label: 'Primeira' },
  { value: 'segunda', label: 'Segunda' },
  { value: 'terceira', label: 'Terceira' },
  { value: 'quarta', label: 'Quarta' },
  { value: 'ultima', label: 'Última' },
];

const OCORRENCIA_LABEL = Object.fromEntries(OCORRENCIAS_MES.map(o => [o.value, o.label]));

function joinWithE(items) {
  if (!items || items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

// "Toda Terça e Quinta-feira" / "Primeira e última Quarta-feira do mês"
export function formatRecorrencia(aula) {
  const dias = joinWithE(aula.dias_semana || []);
  if (!dias) return '—';

  if (aula.frequencia === 'mensal') {
    const ocorrencias = (aula.ocorrencias_mes || []).map(o => OCORRENCIA_LABEL[o] || o);
    const ocorrenciasText = joinWithE(ocorrencias).toLowerCase();
    return ocorrenciasText ? `${ocorrenciasText.charAt(0).toUpperCase()}${ocorrenciasText.slice(1)} ${dias} do mês` : `${dias} do mês`;
  }

  return `Toda ${dias}`;
}
