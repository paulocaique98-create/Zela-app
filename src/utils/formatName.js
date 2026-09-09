// Normaliza nomes de pessoas pro padrão "Título" (primeira letra de cada
// palavra maiúscula, resto minúsculo), independente de como a família/admin
// digitou (TUDO MAIÚSCULO, tudo minúsculo, misturado). Aplicado sempre no
// momento de salvar/confirmar o cadastro — nunca enquanto a pessoa ainda
// está digitando, pra não atrapalhar a experiência de preencher o campo.
//
// Conectivos comuns em nomes/sobrenomes em português (de/da/do/das/dos/e)
// ficam em minúsculo quando NÃO são a primeira palavra do nome inteiro —
// ex: "TATIANA PIMENTEL BRAGA DE NADAI" -> "Tatiana Pimentel Braga de Nadai".
const LOWERCASE_CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// Capitaliza a primeira letra de cada "sub-palavra" separada por hífen ou
// apóstrofo (ex: "maria-clara" -> "Maria-Clara", "d'ávila" -> "D'Ávila").
function capitalizeWord(word) {
  return word.replace(/(^|['-])([a-zà-öø-ÿ])/g, (_match, sep, ch) => sep + ch.toLocaleUpperCase('pt-BR'));
}

export function formatPersonName(rawName) {
  if (typeof rawName !== 'string') return rawName;
  const trimmed = rawName.trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;

  return trimmed
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('pt-BR');
      if (index > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower;
      return capitalizeWord(lower);
    })
    .join(' ');
}
