// Preparo dos dados das abas Acadêmico e Operação do painel de indicadores (Fase 1.5).
// Lógica pura: o servidor (bi_academico, bi_operacao) já agrega; aqui só se ajusta para o gráfico.

// Horas do dia em exibição: no mínimo 6h às 19h; abre para qualquer hora com movimento.
export function recortarHoras(porHora, { minimo = 6, maximo = 19 } = {}) {
  const linhas = Array.isArray(porHora) ? porHora : [];
  let ini = minimo;
  let fim = maximo;
  linhas.forEach((h) => {
    if (Number(h.entradas) + Number(h.saidas) > 0) {
      ini = Math.min(ini, h.hora);
      fim = Math.max(fim, h.hora);
    }
  });
  return linhas
    .filter(h => h.hora >= ini && h.hora <= fim)
    .map(h => ({ hora: h.hora, rotulo: `${String(h.hora).padStart(2, '0')}h`, entradas: Number(h.entradas) || 0, saidas: Number(h.saidas) || 0 }));
}

export function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || 'Sem nome';
}

// Professoras com o mesmo primeiro nome ganham o sobrenome inicial para não se confundirem no eixo.
export function rotulosProfessoras(linhas) {
  const lista = Array.isArray(linhas) ? linhas : [];
  const contagem = {};
  lista.forEach((l) => { const p = primeiroNome(l.professora); contagem[p] = (contagem[p] || 0) + 1; });
  return lista.map((l) => {
    const partes = String(l.professora || '').trim().split(/\s+/);
    const p = primeiroNome(l.professora);
    const rotulo = contagem[p] > 1 && partes.length > 1 ? `${p} ${partes[partes.length - 1][0]}.` : p;
    return { ...l, rotulo, publicados: Number(l.publicados) || 0, pendentes: Number(l.pendentes) || 0 };
  });
}

// Quais blocos o servidor devolveu (só o do método da escola; "personalizado" recebe os dois).
export function blocosDoMetodo(dados) {
  return {
    tradicional: !!dados?.tradicional,
    montessori: !!dados?.montessori,
  };
}
