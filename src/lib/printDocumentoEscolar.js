// Impressão (e "salvar como PDF" do navegador) do histórico escolar, da ficha de acompanhamento
// e das declarações, no padrão do printContract.js. Recebe o conteúdo gravado na emissão
// (documentosEscolares.montarConteudo) e os dados que o servidor devolveu (número e código).
import { formatarCodigo, dataBR, dataPorExtenso, rotuloResultado } from './documentosEscolares';

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function tabelaDeAnos(anos, semNotas) {
  if (!anos?.length) return '<p class="vazio">Nenhum ano cursado registrado.</p>';
  return anos.map((a) => {
    const lugar = [a.escola, [a.cidade, a.uf].filter(Boolean).join('/')].filter(Boolean).join(', ');
    const freq = a.frequencia === null || a.frequencia === undefined ? '' : `${String(a.frequencia).replace('.', ',')}%`;
    const meta = [
      a.serie ? `Série ou turma: ${a.serie}` : '',
      a.cargaHoraria ? `Carga horária: ${a.cargaHoraria} h` : '',
      freq ? `Frequência: ${freq}` : '',
      rotuloResultado(a.resultado) ? `Resultado: ${rotuloResultado(a.resultado)}` : '',
    ].filter(Boolean).join(' · ');
    const disc = !semNotas && a.disciplinas?.length
      ? `<table><thead><tr><th>Disciplina</th><th class="nota">Nota</th></tr></thead><tbody>${a.disciplinas
        .map(d => `<tr><td>${escapeHtml(d.nome)}</td><td class="nota">${escapeHtml(d.nota)}</td></tr>`).join('')}</tbody></table>`
      : '';
    return `<section class="ano"><h3>${escapeHtml(a.ano)}${lugar ? ` · ${escapeHtml(lugar)}` : ''}</h3><p class="meta">${escapeHtml(meta)}</p>${disc}${
      a.observacao ? `<p class="obs">${escapeHtml(a.observacao)}</p>` : ''}</section>`;
  }).join('');
}

export function printDocumentoEscolar(conteudo, emissao = {}) {
  const win = window.open('', '_blank');
  if (!win) return false;
  const e = conteudo.escola || {};
  const al = conteudo.aluno || {};
  const filiacao = (al.filiacao || []).map(f => f.parentesco ? `${f.nome} (${f.parentesco})` : f.nome).join(' e ');
  const nomeEscola = e.razaoSocial || e.nome || '';
  const link = emissao.codigo ? `${window.location.origin}/verificar/${emissao.codigo}` : '';
  const dataLinha = [conteudo.local, conteudo.data ? dataPorExtenso(conteudo.data) : ''].filter(Boolean).join(', ');
  const corpo = conteudo.texto
    ? `<p class="texto">${escapeHtml(conteudo.texto)}</p>`
    : `<h2>Vida escolar</h2>${tabelaDeAnos(conteudo.anos, conteudo.semNotas)}`;
  const selo = emissao.cancelado ? '<div class="cancelado">DOCUMENTO CANCELADO</div>' : '';
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(conteudo.titulo)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Source+Serif+4:wght@500;600;700&display=swap" />
    <style>
      body { font-family: "Source Serif 4", Georgia, serif; color: #17242e; max-width: 780px; margin: 28px auto; padding: 0 24px; line-height: 1.5; font-size: 14px; }
      header { text-align: center; border-bottom: 1px solid #6f7f8b; margin-bottom: 18px; padding-bottom: 10px; }
      header .escola { font-size: 17px; font-weight: 700; margin: 0; }
      header p { margin: 1px 0; font-size: 12px; color: #5a6a76; font-family: "Public Sans", system-ui, sans-serif; }
      h1 { font-size: 20px; text-align: center; margin: 14px 0 16px; text-transform: uppercase; letter-spacing: .04em; }
      h2 { font-size: 15px; margin: 18px 0 6px; }
      h3 { font-size: 14px; margin: 0; }
      .aluno { border: 1px solid #6f7f8b; padding: 8px 12px; font-family: "Public Sans", system-ui, sans-serif; font-size: 12.5px; }
      .aluno p { margin: 2px 0; }
      .ano { margin: 12px 0; break-inside: avoid; }
      .meta, .obs { margin: 2px 0; font-size: 12px; color: #5a6a76; font-family: "Public Sans", system-ui, sans-serif; }
      table { border-collapse: collapse; width: 100%; font-family: "Public Sans", system-ui, sans-serif; font-size: 12px; margin-top: 4px; }
      th, td { border: 1px solid #b8c2ca; padding: 3px 8px; text-align: left; }
      .nota { width: 80px; text-align: center; }
      .texto { font-size: 15px; margin: 28px 0; text-align: justify; }
      .vazio { color: #5a6a76; font-style: italic; }
      .data { margin-top: 28px; text-align: right; }
      .assinaturas { display: flex; gap: 40px; margin-top: 56px; }
      .assinaturas div { flex: 1; border-top: 1px solid #17242e; padding-top: 4px; text-align: center; font-size: 12px; font-family: "Public Sans", system-ui, sans-serif; }
      .verif { margin-top: 28px; border: 1px solid #6f7f8b; padding: 8px 12px; font-family: "Public Sans", system-ui, sans-serif; font-size: 11.5px; }
      .verif p { margin: 2px 0; }
      .cancelado { border: 2px solid #b3261e; color: #b3261e; text-align: center; font-weight: 700; padding: 6px; margin-bottom: 12px; font-family: "Public Sans", system-ui, sans-serif; }
    </style></head><body>
    ${selo}
    <header>
      <p class="escola">${escapeHtml(nomeEscola)}</p>
      ${e.razaoSocial && e.nome && e.razaoSocial !== e.nome ? `<p>${escapeHtml(e.nome)}</p>` : ''}
      ${e.cnpj ? `<p>CNPJ ${escapeHtml(e.cnpj)}</p>` : ''}
      ${e.ato ? `<p>${escapeHtml(e.ato)}</p>` : ''}
      ${e.endereco ? `<p>${escapeHtml(e.endereco)}</p>` : ''}
      ${[e.telefone, e.email].filter(Boolean).length ? `<p>${escapeHtml([e.telefone, e.email].filter(Boolean).join(' · '))}</p>` : ''}
    </header>
    <h1>${escapeHtml(conteudo.titulo)}</h1>
    <div class="aluno">
      <p><strong>Aluno(a):</strong> ${escapeHtml(al.nome)}</p>
      ${al.nascimento ? `<p><strong>Nascimento:</strong> ${escapeHtml(dataBR(al.nascimento))}${al.naturalidade ? ` · <strong>Naturalidade:</strong> ${escapeHtml(al.naturalidade)}` : ''}</p>` : ''}
      ${filiacao ? `<p><strong>Filiação:</strong> ${escapeHtml(filiacao)}</p>` : ''}
    </div>
    ${corpo}
    ${conteudo.observacoes ? `<h2>Observações</h2><p>${escapeHtml(conteudo.observacoes)}</p>` : ''}
    ${dataLinha ? `<p class="data">${escapeHtml(dataLinha)}</p>` : ''}
    <div class="assinaturas">
      <div>${escapeHtml(conteudo.assinaturas?.secretario || '')}<br/>Secretaria</div>
      <div>${escapeHtml(conteudo.assinaturas?.diretor || '')}<br/>Direção</div>
    </div>
    ${emissao.numero ? `<div class="verif">
      <p><strong>Documento número ${escapeHtml(String(emissao.numero))}</strong>${emissao.emitidoEm ? ` · emitido em ${escapeHtml(dataBR(emissao.emitidoEm))}` : ''}</p>
      <p>Código de verificação: <strong>${escapeHtml(formatarCodigo(emissao.codigo))}</strong></p>
      ${link ? `<p>Confira a autenticidade em ${escapeHtml(link)}</p>` : ''}
    </div>` : ''}
    </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
  return true;
}
