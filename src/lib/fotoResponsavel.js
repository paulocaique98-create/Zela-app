// Qual cadastro de authorized_persons dá a foto de um responsável na tela
// Gerenciamento › Usuários (29/09/2026).
//
// Antes, a tela só olhava a conta da própria pessoa e exigia o nome idêntico:
// o 2º responsável cujo cadastro com biometria estava como "Pai/Mãe" na conta
// do titular (ou com o nome escrito diferente, ex.: "Lígia Hoffman" x "Lígia
// Maria de Aguiar Hoffman") aparecia sem foto. Mesma regra de "mesma pessoa"
// do servidor (mesma_pessoa_responsavel, migração unificar_segundos_responsaveis).

export function normalizarNome(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

const PARENTESCO_PAI_MAE = new Set(['pai', 'mae', 'pai/mae']);

// Mesmo nome, ou mesmo primeiro nome e (mesmo último sobrenome ou mesmos dois
// primeiros nomes) quando o parentesco é de pai/mãe ou o cadastro é o do
// titular -- evita casar com avô/tio de mesmo nome e sobrenome.
export function mesmaPessoa(nomeCadastro, relacao, nomeConta) {
  const a = normalizarNome(nomeCadastro);
  const b = normalizarNome(nomeConta);
  if (!a || !b) return false;
  if (a === b) return true;
  const rel = normalizarNome(relacao);
  if (!PARENTESCO_PAI_MAE.has(rel) && !rel.includes('(titular)')) return false;
  const pa = a.split(' ');
  const pb = b.split(' ');
  if (pa[0] !== pb[0]) return false;
  return pa[pa.length - 1] === pb[pb.length - 1] || (pa.length > 1 && pb.length > 1 && pa[1] === pb[1]);
}

/**
 * user: { id, name }
 * cadastros: authorized_persons da escola ({ id, name, relation, family_id, photo_storage_path })
 * familiasTitulares: ids das contas dos titulares de quem a pessoa é 2º responsável
 * Devolve o cadastro escolhido (ou null).
 */
export function escolherCadastroDaFoto(user, cadastros, familiasTitulares = new Set()) {
  const candidatos = [];
  for (const ap of cadastros || []) {
    const propria = ap.family_id === user.id;
    if (!propria && !familiasTitulares.has(ap.family_id)) continue;
    let pontos = 0;
    if (normalizarNome(ap.name) === normalizarNome(user.name)) pontos = 3;
    else if (mesmaPessoa(ap.name, ap.relation, user.name)) pontos = 2;
    else if (propria && ap.relation?.includes('(Titular)')) pontos = 1;
    if (pontos) candidatos.push({ ap, pontos, comFoto: !!ap.photo_storage_path, propria });
  }
  if (!candidatos.length) return null;
  candidatos.sort((x, y) =>
    (y.comFoto - x.comFoto) || (y.pontos - x.pontos) || (y.propria - x.propria));
  return candidatos[0].ap;
}
