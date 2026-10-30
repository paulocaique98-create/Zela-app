import { brl } from './planosZela';

// Desenha o PDF da proposta (montarProposta) com jsPDF, carregado só na hora de gerar.
// Os botões são retângulos com link clicável (WhatsApp e e-mail).
const COR = { texto: [30, 30, 30], suave: [110, 110, 110], marca: [150, 110, 40], faixa: [28, 28, 32], linha: [220, 220, 220] };
const M = 16; // margem
const LARG = 210;
const ALT = 297;

export async function gerarPropostaPdf(p) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const util = LARG - M * 2;
  let y = 0;

  const cor = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const garante = (h) => { if (y + h > ALT - 22) { doc.addPage(); y = M; } };
  const texto = (t, { tam = 10, negrito = false, c = COR.texto, x = M, largura = util, espaco = 1.4 } = {}) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(tam); cor(c);
    const linhas = doc.splitTextToSize(String(t), largura);
    const h = tam * 0.3528 * (1 + espaco / 4);
    for (const l of linhas) { garante(h); doc.text(l, x, y); y += h; }
  };
  const titulo = (t) => {
    garante(16); y += 4;
    texto(t, { tam: 13, negrito: true, c: COR.marca });
    doc.setDrawColor(...COR.linha); doc.line(M, y, LARG - M, y); y += 4;
  };
  const marcador = (t, x = M) => {
    garante(6); doc.setFillColor(...COR.marca); doc.circle(x + 1, y - 1.2, 0.8, 'F');
    texto(t, { x: x + 5, largura: util - 5 });
  };

  // Faixa de cabeçalho
  doc.setFillColor(...COR.faixa); doc.rect(0, 0, LARG, 42, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(255, 255, 255); doc.text('Zela', M, 20);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.text('Proposta comercial', M, 28);
  doc.setFontSize(9); doc.setTextColor(210, 210, 210);
  doc.text(`Emitida em ${p.emitidaEm}  ·  Válida até ${p.validadeAte}`, M, 35);
  y = 54;
  texto(`Proposta para ${p.cliente.nome}`, { tam: 16, negrito: true });
  if (p.cliente.contato) texto(`A/C ${p.cliente.contato}`, { c: COR.suave });
  texto(`Plano ${p.plano.nome}, ciclo ${p.ciclo.label.toLowerCase()}, para ${p.alunos} aluno(s).`, { c: COR.suave });

  titulo('Sobre o Zela');
  texto(p.sobre);

  titulo('O que está incluído');
  texto(p.base.nome, { negrito: true }); texto(p.base.resumo, { c: COR.suave }); y += 1;
  for (const i of p.base.inclui) marcador(`${i.nome}: ${i.desc}`);
  for (const it of p.itens) {
    y += 3; garante(14);
    texto(`${it.nome}${it.grupo === 'adicional' ? '  (adicional)' : ''}`, { negrito: true });
    texto(it.resumo, { c: COR.suave });
  }

  titulo('Vantagens do plano');
  for (const v of p.vantagens) marcador(v);

  titulo('Investimento');
  const v = p.valores;
  const linha = (rotulo, valor, { forte = false, c = COR.texto } = {}) => {
    garante(7);
    doc.setFont('helvetica', forte ? 'bold' : 'normal'); doc.setFontSize(forte ? 11 : 10); cor(c);
    doc.text(rotulo, M, y); doc.text(valor, LARG - M, y, { align: 'right' }); y += 6.5;
  };
  linha('Mensalidade', brl(v.mensalCheia));
  if (p.ciclo.descontoPercent > 0) linha(`Desconto do ciclo (${p.ciclo.descontoPercent} por cento)`, `na mensalidade`, { c: COR.suave });
  if (v.mensalComDesconto !== null) linha(`Mensalidade com desconto${v.mesesDesconto < p.ciclo.meses ? ` (${v.mesesDesconto} primeiros meses)` : ''}`, brl(v.mensalComDesconto), { forte: true });
  linha(`Valor do ciclo ${p.ciclo.label.toLowerCase()} (${p.ciclo.meses} ${p.ciclo.meses === 1 ? 'mês' : 'meses'})`, brl(v.valorCiclo), { forte: true });
  if (v.implantacaoBase > 0) {
    linha('Implantação', brl(v.implantacaoBase));
    if (v.implantacaoDesconto > 0) linha('Implantação com desconto', brl(v.implantacao), { forte: true });
  }
  y += 2;
  texto('Valores em reais. Esta proposta vale até a data indicada no topo.', { tam: 8.5, c: COR.suave });

  // Botões
  garante(40); y += 6;
  const botao = (rotulo, url, x, fundo) => {
    const w = (util - 6) / 2; const h = 14;
    doc.setFillColor(...fundo); doc.roundedRect(x, y, w, h, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
    doc.text(rotulo, x + w / 2, y + 8.7, { align: 'center' });
    if (url) doc.link(x, y, w, h, { url });
  };
  botao('Aceitar Proposta', p.links.aceitar, M, [40, 130, 70]);
  botao('Tirar Dúvida', p.links.duvida, M + (util - 6) / 2 + 6, COR.marca);
  y += 20;
  const contatos = [p.contatos.whatsapp && `WhatsApp ${p.contatos.whatsapp}`, p.contatos.email].filter(Boolean).join('   ·   ');
  if (contatos) texto(contatos, { tam: 9, c: COR.suave });

  // Rodapé com página
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...COR.suave);
    doc.text(`Zela · Proposta para ${p.cliente.nome}`, M, ALT - 10);
    doc.text(`Página ${i} de ${total}`, LARG - M, ALT - 10, { align: 'right' });
  }

  const arquivo = `proposta zela ${p.cliente.nome}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_');
  doc.save(`${arquivo}.pdf`);
}
