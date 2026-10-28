import { AJUDA_POR_PERFIL, TITULO_DO_PERFIL, secoesDoMetodo } from './index';

// Passos do tour a partir do conteúdo da Central de Ajuda: uma abertura, um
// passo por menu (já filtrado pelo método da escola) e o encerramento.
export function passosDoTour(perfil, method = null) {
  const secoes = secoesDoMetodo(AJUDA_POR_PERFIL[perfil], method);
  return [
    {
      id: 'inicio',
      titulo: 'Bem-vindo ao Zela',
      texto: `Vamos mostrar rapidamente o que você encontra no perfil ${TITULO_DO_PERFIL[perfil] || ''}. Leva menos de um minuto.`,
    },
    ...secoes.map((s) => ({
      id: s.id,
      titulo: s.titulo,
      texto: s.itens.length === 1 ? s.itens[0].serve : `Aqui você encontra: ${s.itens.map((i) => i.titulo).join(', ')}.`,
    })),
    {
      id: 'fim',
      titulo: 'Tudo pronto',
      texto: 'Quando tiver dúvida, abra a Central de Ajuda no menu. Lá você também pode refazer este tour.',
    },
  ];
}
