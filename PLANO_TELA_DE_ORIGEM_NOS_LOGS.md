# PLANO — Identificar a Tela de Origem em Cada Log de Erro

Status: **PLANEJAMENTO. Nada foi executado.** Complementa o
`PLANO_LOGGING_ERROS_PORTAL_DEV.md`. Cada fase precisa de autorização
separada, mesmo padrão desta sessão.

## Motivação

Hoje um log de erro mostra fonte (frontend/edge function/etc), categoria e
mensagem, mas não diz **em qual tela do app** aconteceu — só dá pra saber
isso é vasculhando `url`/`stack`/`context`, quando existe algo útil ali.
Saber se foi no Monitor, no Autoatendimento, no Cadastro de Usuário ou no
Cadastro de Funcionário ajuda a priorizar (ex: erro recorrente no
Autoatendimento é mais urgente, é ele que trava a fila na porta da escola).

## Achados da investigação (resumo)

- O app **não usa URL por tela** (Monitor/Autoatendimento não mudam o
  endereço) — é tudo `useState` trocando qual componente renderiza.
- Os 3 portais principais já têm essa informação, só que espalhada: `App.jsx`
  centraliza `adminTab`/`familyTab`/`teacherTab` (cada um com sua própria
  variável e chave de `sessionStorage`), repassados como prop pra dentro de
  `AdminPortal`/`FamilyPortal`/`TeacherPortal`. O `DeveloperLayout.jsx` é
  separado, com seu próprio `activeTab` local, sem subir até o `App.jsx`.
- `errorLogger.js` já tem exatamente o mecanismo que precisamos: um
  singleton de módulo (`currentContext`) que guarda dados do usuário logado
  e é lido tanto pelos logs manuais quanto pelos globais (`window.onerror`,
  `unhandledrejection`, ErrorBoundary) — que rodam FORA da árvore React e
  não teriam acesso à tela ativa de outra forma. Adicionar "tela atual" nesse
  mesmo lugar é aditivo, sem mudar nada de navegação.
- **Achado à parte, fora do request original, mas relevante**: `AdminFaceScanner`
  tem uma prop `isKioskMode`, mas ela nunca é passada na única chamada
  existente dentro do `AdminPortal.jsx` (fica sempre `false` por omissão) —
  hoje não há como saber, olhando só pro scanner, se ele foi aberto de dentro
  do Autoatendimento ou não. Precisa de uma correção pequena e não-destrutiva
  (Fase B) pra esse dado ficar confiável.

## FASE A — Decisões de nomenclatura (bloqueante, usuário decide)

Cada aba do Admin já tem um id técnico estável (`adminTab`). Existem duas
telas de cada para "Usuário" e "Funcionário" — uma de CRIAR, outra de
GERENCIAR quem já existe:

| Nome amigável proposto | id técnico (`adminTab`) | Componente |
|---|---|---|
| Monitor | `monitor` | (view inline no AdminPortal) |
| Autoatendimento | `kiosk` | (view inline no AdminPortal) |
| **Cadastro de Usuário** | `register` | `AdminUserRegistration` |
| Gestão de Usuários | `users` | `AdminUserManagement` |
| **Cadastro de Funcionário** | `cadastro-funcionarios` | `AdminCadastroFuncionarios` |
| Gestão de Funcionários | `gerenciar-funcionarios` | `AdminGerenciarFuncionarios` |

**Recomendação**: pelos nomes que você usou ("cadastro de usuário", "cadastro
de funcionário"), o mapeamento acima (`register`/`cadastro-funcionarios`, em
negrito) parece ser exatamente o que você quer — mas confirme, porque as
telas de "Gestão" (`users`/`gerenciar-funcionarios`) também aparecem como
"Usuários"/"Funcionários" no menu, é fácil confundir.

Além dessas 4, o plano cobre **todas as outras abas** do Admin/Family/Teacher/
Developer com um rótulo amigável (ex: `presence` → "Presença Diária",
`financeiro` → "Financeiro") — não faz sentido identificar só 4 e deixar o
resto aparecendo como id técnico cru no log.

**Ação necessária**: você confirma o mapeamento acima (ou ajusta), e eu
completo a lista pras demais abas antes de implementar a Fase E.

---

## FASE B — Corrigir `isKioskMode` (pré-requisito pro reconhecimento facial)

Em `AdminPortal.jsx`, a chamada de `<AdminFaceScanner ... />` (linha ~716)
não passa `isKioskMode`. Adicionar `isKioskMode={adminTab === 'kiosk'}` —
mudança pequena, não muda nenhum comportamento visual (a prop já existe e é
usada só pra UI condicional dentro do próprio scanner), só passa a refletir
a realidade. Sem isso, todo log de reconhecimento facial (Fase B1 do outro
plano) ficaria marcado como "fora do Autoatendimento" mesmo quando não é.

**Critério de sucesso**: abrir a câmera pelo Autoatendimento vs. por outro
caminho (se existir algum) reflete corretamente em `isKioskMode` (visível
indiretamente pela UI do próprio scanner, que já se comporta diferente com
essa prop).

---

## FASE C — Schema aditivo: coluna `screen` em `error_logs`

```sql
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS screen text;
```

Coluna própria (não só dentro de `context` jsonb) porque "tela de origem" é
uma dimensão de filtro tão importante quanto `source`/`severity` — merece
aparecer nos filtros da tela (Fase F) do mesmo jeito. `log_error()` (RPC)
ganha um parâmetro novo opcional `p_screen text DEFAULT NULL`.

**Critério de sucesso**: coluna existe, RPC aceita o parâmetro sem quebrar
nenhuma chamada existente (todas continuam passando só os parâmetros que já
usam).

---

## FASE D — Capturar a tela atual (frontend)

1. Em `errorLogger.js`, adicionar `screen: null` ao `currentContext` e uma
   função `setCurrentScreen(screen)` (ao lado de `setErrorLogContext`) que só
   atualiza esse campo.
2. Em `logClientError`/`logAppError`, passar `p_screen: currentContext.screen`
   pra `log_error()`.
3. Em `App.jsx`, um único `useEffect` observando `adminTab`/`familyTab`/
   `teacherTab` (já centralizados ali) chama `setCurrentScreen(...)` com o id
   da aba ativa no momento (o portal que estiver logado — só um está ativo
   por vez).
4. Em `DeveloperLayout.jsx`, um `useEffect` próprio observando seu
   `activeTab` local faz o mesmo (esse estado não sobe até `App.jsx`).
5. Chamadas manuais de `logAppError(...)` (ex: `App.jsx` >
   `updateStudentStatus`) e `logFaceEvent(...)` (`AdminFaceScanner.jsx`) não
   precisam de nenhuma mudança — já vão herdar a tela automaticamente do
   mesmo `currentContext`, incluindo a correção da Fase B (o
   `AdminFaceScanner` sempre roda dentro da aba `kiosk` ou de onde for
   aberto, então a tela capturada já reflete isso).

**Critério de sucesso**: forçar um erro manualmente em duas telas diferentes
do Admin e conferir via SQL Editor que a coluna `screen` bate com a tela
onde o erro foi disparado.

---

## FASE E — Exibir no card da tela de Logs

Em `DeveloperErrorLogs.jsx`: um dicionário `SCREEN_LABELS` (ids técnicos →
nomes amigáveis, baseado na Fase A) e um badge novo no card (ex: "📍 Monitor")
ao lado dos badges de fonte/categoria já existentes. Quando `screen` for
nulo (erros de edge function/cron, que não têm "tela" — rodam no servidor),
simplesmente não mostra o badge. Considerar também adicionar "Tela" como
mais um filtro no popover de Filtros (Modelo 10, já implementado), já que
virou uma coluna de verdade.

**Critério de sucesso**: um erro dado de propósito em duas telas diferentes
aparece com o badge de tela certo, e nenhum log de fonte sem tela mostra
badge nenhum ou nenhum texto quebrado.

---

## Riscos e Ressalvas

| Risco | Mitigação no plano |
|---|---|
| Nomenclatura ambígua (Cadastro vs. Gestão) gerar confusão no log | Fase A trava o plano até confirmação explícita do mapeamento |
| `isKioskMode` incorreto (Fase B) fazer logs de reconhecimento facial mentirem sobre a tela | Fase B corrige a origem do dado antes de qualquer log usar ele |
| Portais que não sobem o tab pro `App.jsx` (Developer) ficarem sem essa info | `DeveloperLayout.jsx` ganha seu próprio efeito, tratado explicitamente na Fase D |
| Abas novas criadas no futuro sem rótulo amigável mapeado | `SCREEN_LABELS` tem um fallback (mostra o id técnico cru) em vez de quebrar |

## Estimativa de esforço

- Fase A: decisão, não é código.
- Fase B: mínima (1 prop).
- Fase C: pequena (schema + parâmetro na RPC).
- Fase D: pequena-média (mecanismo replicado 2x: App.jsx + DeveloperLayout.jsx).
- Fase E: pequena (1 badge + 1 dicionário + filtro opcional).
