// Assinatura da escola no portal da Gestão: formatação das parcelas que o Zela cobra da escola.
// Os dados vêm da RPC minhas_parcelas_zela (servidor decide perfil e escola).

export const STATUS_PARCELA = {
  pendente: { label: 'A vencer', tom: 'neutro' },
  vencida: { label: 'Em atraso', tom: 'alerta' },
  paga: { label: 'Paga', tom: 'ok' },
  cancelada: { label: 'Cancelada', tom: 'neutro' },
  estornada: { label: 'Estornada', tom: 'neutro' },
};

export function statusParcela(status) {
  return STATUS_PARCELA[status] || { label: status || '', tom: 'neutro' };
}

export function nomeParcela(p) {
  return p.tipo === 'implantacao' ? 'Implantação' : `Parcela ${p.numero}`;
}

// Só link http(s): o endereço vem do banco, mas nunca vira href sem conferir o protocolo.
export function linkSeguro(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null;
}

// Resumo do topo: quanto já foi pago, quanto falta e a próxima parcela em aberto.
export function resumoParcelas(parcelas) {
  const lista = Array.isArray(parcelas) ? parcelas : [];
  const soma = (fn) => lista.filter(fn).reduce((t, p) => t + Number(p.valor || 0), 0);
  const abertas = lista
    .filter(p => p.status === 'pendente' || p.status === 'vencida')
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  return {
    pago: soma(p => p.status === 'paga'),
    emAberto: soma(p => p.status === 'pendente' || p.status === 'vencida'),
    emAtraso: soma(p => p.status === 'vencida'),
    proxima: abertas[0] || null,
  };
}
