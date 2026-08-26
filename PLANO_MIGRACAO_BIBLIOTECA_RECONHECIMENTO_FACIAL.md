# PLANO — Migração de face-api.js para @vladmandic/human

Status: **PLANEJAMENTO. Nada foi executado.** Este documento existe só para estruturar os passos, caso
e quando a migração for autorizada. Nenhuma fase aqui deve começar sem autorização explícita separada,
seguindo o mesmo padrão de todas as fases anteriores desta sessão (Storage, RLS, etc.).

## Objetivo

Trocar `face-api.js` (abandonado desde 2020) por `@vladmandic/human` (ativo, mantido, com WebGPU),
**sem exigir que nenhuma família recadastre a biometria ao vivo**, aproveitando que as fotos originais
já estão preservadas no Storage (resultado direto da migração de fotos feita nesta sessão).

## Princípio central (igual ao usado em toda a migração de Storage)

```
NUNCA trocar o que já funciona antes de provar que o novo funciona igual ou melhor.
NUNCA apagar o antigo antes de validar o novo.
NUNCA misturar migração com destruição.
```

Concretamente: o `face_descriptor` atual (gerado pelo `face-api.js`) **nunca é apagado** até o novo
algoritmo estar validado e rodando em produção por um período de estabilidade comprovada.

---

## FASE A — Prova de Conceito Isolada (sandbox, fora da produção)

**Objetivo**: confirmar, num ambiente isolado (nada de banco de produção, nada de deploy), que
`@vladmandic/human` consegue processar as fotos que já temos e gerar descritores válidos.

Passos:
1. Criar um projeto Node isolado (fora do repositório principal, ou numa pasta `scratch/` local) só
   pra teste.
2. Instalar `@vladmandic/human` e seus modelos.
3. Pegar 3-5 fotos de teste reais (baixadas do Storage via signed URL, nunca do bucket público —
   continua sendo dado sensível mesmo num teste local).
4. Rodar a detecção + descrição facial do `Human` em cima dessas fotos.
5. Confirmar: detecta rosto? Gera um vetor de descritor? Qual o tamanho/formato do vetor (dimensões)?

**Critério de sucesso**: `Human` consegue processar fotos reais do sistema e produzir um descritor
válido, sem erro, num ambiente totalmente desacoplado da produção.

**Se falhar aqui**: para o plano inteiro. Não faz sentido prosseguir se a lib nem processa as fotos
reais do Zela.

---

## FASE B — Geração de Descritores em Lote (offline, shadow — sem afetar produção)

**Objetivo**: gerar o descritor novo (`Human`) para **todos** os registros que já têm biometria
cadastrada hoje, sem tocar no `face_descriptor` atual nem em nenhum fluxo de produção.

Pré-requisito de schema: adicionar uma coluna nova e aditiva, **nunca substituir a existente**:

```sql
ALTER TABLE authorized_persons ADD COLUMN IF NOT EXISTS face_descriptor_v2 text;
ALTER TABLE authorized_persons ADD COLUMN IF NOT EXISTS face_descriptor_v2_status text;
-- status: PENDING | GENERATED | FAILED_NO_FACE | FAILED_LOW_QUALITY | FAILED_ERROR
```

Passos:
1. Listar todos os registros com `face_descriptor IS NOT NULL` (hoje: todos os que já passaram por
   cadastro biométrico).
2. Para cada um, individualmente e sequencialmente (mesmo padrão da migração de fotos — nunca em lote
   sem controle):
   a. Resolver a foto real (via `photo_storage_path` → signed URL; para os que ainda só têm Base64,
      usar o Base64 diretamente).
   b. Rodar o `Human` na foto.
   c. Se detectar rosto com confiança aceitável: gravar `face_descriptor_v2` + status `GENERATED`.
   d. Se não detectar rosto, ou detectar com baixa confiança: marcar `FAILED_NO_FACE` ou
      `FAILED_LOW_QUALITY`, **não travar o lote**, seguir pro próximo.
   e. Se erro técnico (ex: imagem corrompida): `FAILED_ERROR`, registrar o motivo.
3. Produzir relatório: quantos `GENERATED`, quantos `FAILED_*`, e quem são os `FAILED_*` (por nome, pra
   saber quem precisaria de recadastro real).

**Critério de sucesso**: idealmente ≥95% dos registros migram automaticamente. Os que falharem
(esperado: uma minoria, ligada a fotos de baixa qualidade) são a lista real de quem precisaria
recadastrar ao vivo — e só eles, não todo mundo.

**Ponto de parada**: se a taxa de falha for muito alta (ex: >20%), isso indica que a foto salva não é
adequada pro novo algoritmo de forma sistemática — parar e reavaliar antes de continuar (pode ser sinal
de incompatibilidade mais profunda, não só qualidade de foto).

---

## FASE C — Validação Cruzada (a etapa mais importante)

**Objetivo**: provar que o novo descritor (`face_descriptor_v2`) reconhece a mesma pessoa tão bem
quanto (ou melhor que) o antigo, **antes** de considerar usá-lo de verdade.

Passos:
1. Para uma amostra representativa de pessoas com `face_descriptor_v2` gerado, capturar uma NOVA foto
   de teste (webcam, condições reais — aqui sim precisa de alguém presente, mas só pra teste, não pra
   recadastro de produção).
2. Rodar essa foto de teste contra:
   - `face_descriptor` antigo (via `face-api.js`, algoritmo atual).
   - `face_descriptor_v2` novo (via `Human`).
3. Comparar: os dois reconhecem a pessoa corretamente? Os dois rejeitam corretamente uma pessoa
   diferente (teste de falso positivo, reaproveitando o aprendizado do caso Hanaynna Schmitz — testar
   especificamente pares de pessoas parecidas/pessoas com biometria de baixa qualidade)?
4. Medir taxa de acerto/erro dos dois lado a lado.

**Critério de sucesso**: taxa de reconhecimento do `Human` igual ou melhor que a do `face-api.js`
atual, na mesma amostra de teste, sem introduzir novos falsos positivos.

**Ponto de parada**: se o `Human` tiver taxa de erro pior que o atual, ou gerar novos falsos positivos
entre pessoas diferentes, **não prosseguir** — o objetivo é melhorar, não regredir.

---

## FASE D — Recalibração de Threshold

**Objetivo**: encontrar o equivalente de `MATCH_THRESHOLD`/`MATCH_MARGIN`/`CONSISTENCY_FRAMES` pro
novo algoritmo — os valores atuais foram calibrados especificamente pro `face-api.js`, não têm por que
valer igual pro `Human`.

Passos:
1. Usar o dataset de validação da Fase C (idealmente ampliado) para testar diferentes valores de
   threshold do `Human`.
2. Buscar o ponto de equilíbrio entre: poucos falsos positivos (pessoa errada reconhecida como certa —
   o problema mais grave) e poucos falsos negativos (pessoa certa não reconhecida — o problema mais
   comum/irritante no dia a dia).
3. Documentar os novos valores e o raciocínio por trás deles (igual ao comentário que já existe no
   código hoje sobre o caso Hanaynna Schmitz).

**Critério de sucesso**: threshold definido com base em dado real, não em "chute" ou valor default da
lib.

---

## FASE E — Implementação de Código (isolada, sem deploy)

**Objetivo**: escrever o código novo, mas mantendo o `face-api.js` funcionando em paralelo — nada de
deploy ainda.

Passos:
1. Criar uma nova versão de `faceModels.js` (ou um arquivo separado) carregando `Human` em vez de
   `face-api.js`.
2. Reescrever a lógica de matching (`findSecureMatch`, `evaluateFramePosition`, `enhanceForLowLight`)
   adaptada pra API do `Human` — **usando os valores calibrados na Fase D**, não os atuais.
3. Manter feature-flag ou variável de ambiente que permite alternar entre motor antigo/novo sem
   precisar reverter código (facilita a Fase F).
4. Build local, sem deploy.

**Nada muda em produção nesta fase** — é só escrita de código.

---

## FASE F — Teste Paralelo (Shadow Mode) em Produção

**Objetivo**: rodar o `Human` em produção **em paralelo** com o `face-api.js`, mas sem deixar o
resultado dele afetar o check-in real — só coletando dados de acerto/erro reais, com uso real.

Passos:
1. Deploy do código com o motor novo rodando em modo "observador": ele processa cada tentativa de
   reconhecimento real do Totem, registra o resultado (silenciosamente, em log/tabela própria), mas
   **quem decide o check-in continua sendo o `face-api.js` atual**.
2. Rodar assim por um período real (dias/semanas, dependendo do volume de uso das escolas).
3. Comparar: quantas vezes os dois motores concordaram? Quantas vezes discordaram, e quem estava certo
   nesses casos (checagem manual/comparação com o outcome real)?

**Critério de sucesso**: alta concordância entre os dois motores, e nos casos de discordância, o
`Human` acerta pelo menos tanto quanto o atual.

**Ponto de parada**: qualquer sinal de que o `Human` erra sistematicamente em algum padrão (ex: sempre
erra à noite, sempre erra com um grupo específico) — investigar antes de prosseguir.

---

## FASE G — Corte Definitivo (Switch)

**Objetivo**: só depois de todas as fases acima validadas, trocar o motor que decide o check-in de
verdade.

Passos:
1. Reverter a feature-flag: `Human` passa a decidir, `face-api.js` passa a rodar só como observador
   (invertendo os papéis da Fase F) por um período curto de segurança.
2. Se tudo continuar estável, remover o `face-api.js` do código.
3. **Só então** considerar limpar `face_descriptor` (antigo) e a coluna auxiliar
   `face_descriptor_v2_status` — nunca antes, e sempre com backup, seguindo o mesmo padrão da Fase 8
   de remoção de Base64 desta sessão.

---

## FASE H — Rollback (válido em qualquer ponto até a Fase G)

Como o `face_descriptor` original nunca é tocado até a Fase G, o rollback é trivial em qualquer ponto
anterior: basta reverter a feature-flag/deploy pro código antigo. O único dado novo criado
(`face_descriptor_v2`) é aditivo — removê-lo não afeta nada em produção.

---

## Riscos e Ressalvas (consolidado da conversa anterior)

| Risco | Mitigação no plano |
|---|---|
| Foto salva de baixa qualidade gera descritor ruim | Fase B classifica e isola quem falha — só essa minoria precisaria de recadastro real |
| Novo algoritmo tem taxa de erro pior que o atual | Fase C mede isso antes de qualquer troca real; Fase G só acontece se Fase C/F comprovarem melhora ou paridade |
| Threshold errado causa falso positivo (caso Hanaynna Schmitz de novo) | Fase D recalibra com dado real antes de qualquer uso real |
| Migração de código introduz bug não relacionado a reconhecimento | Fase F roda em paralelo sem afetar o check-in real antes do corte |
| Perda de dado / impossibilidade de reverter | `face_descriptor` original nunca é apagado até a Fase G, que só remove depois de período de estabilidade comprovada |

## Estimativa de esforço (qualitativa, não um compromisso de prazo)

- Fases A-C: a mais trabalhosa é a C (precisa de fotos de teste reais e comparação cuidadosa) — é
  também a mais importante, não deve ser apressada.
- Fase E: reescrita real de componentes de reconhecimento facial — esforço de desenvolvimento
  comparável ao que já foi feito nesta sessão pra Storage, mas em código mais sensível.
- Fase F: depende do volume de uso real das escolas pra gerar dado suficiente — pode levar mais tempo
  de calendário (esperando uso real) do que de trabalho ativo.

## Autorização

Cada fase acima deve ser autorizada separadamente, exatamente como todas as fases de Storage desta
sessão. Nenhuma delas está autorizada a começar por este documento — ele é só o roteiro.
