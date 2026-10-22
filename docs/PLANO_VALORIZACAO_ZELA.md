# PLANO DE VALORIZAÇÃO DO ZELA EDU (16/10/2026)

Objetivo: recursos que mais aumentam o valor percebido do Zela para escolas novas (decidir trocar de sistema) e para as atuais (renovar e subir de plano). Ordem: do mais relevante ao menos relevante. Nada foi implementado; cada fase exige plano próprio e OK antes de editar.

Base consultada: modulosCatalogo.js, ZELA_STATUS.md e títulos de Proximas_Atualizações.md. Já existem e NÃO entram como novidade: Diário, Mural de fotos, Cardápio, Ficha médica, Ocorrências, Contratos com assinatura pelo app, Chat por setor, Calendário, Comunicados, Matrícula pública e importação, Financeiro Asaas (boleto, Pix, avulsa, reajuste, lembretes), hora extra, modo Emergência, Mapa de Habilidades, app nativo com push.

---

## 0. Regras antes de QUALQUER fase (proteção contra quebra)

1. Linha de base: rodar a suíte completa (103 arquivos / 744 testes em 14/10) antes de começar e ao final de cada fase. Fase não fecha com teste vermelho.
2. Tudo nasce como módulo/adicional DESLIGADO (chave lida como `=== true`). Escola atual não vê mudança até ser ligada.
3. Migrations só aditivas: tabela/coluna nova, nunca renomear ou apagar. RLS por school_id em toda tabela nova, com teste adversarial (padrão de rlsRemainingTablesAdversarial.test.js).
4. Ordem de ambiente: local → homologação (testada logada) → produção só com OK explícito. Registrar migration (não usar db push onde houve db query).
5. Arquivos grandes (App.jsx, AdminFaceScanner.jsx, AdminPortal.jsx): só um ponto de encaixe (import + rota/menu). Lógica nova em componente e lib próprios, com teste.
6. Pontos sensíveis que exigem análise de segurança antes: fluxo de check-in/out, payment-webhook e processPaymentEvent, canais Realtime, Storage, Auth, Edge Functions.
7. Cada fase termina com atualização de ZELA_STATUS.md e /clear.

Escala de risco de quebra: BAIXO (tela nova isolada) · MÉDIO (toca fluxo existente de forma aditiva) · ALTO (altera fluxo crítico, dinheiro, biometria ou Auth).

---

## FASE 1. Entrada rápida de escola nova (onboarding, migração e demonstração)
Por que primeiro: o maior bloqueio para trocar de sistema é o trabalho de migrar e configurar. Reduz o tempo de implantação e justifica a taxa de 600 a 1.200.

- 1.1 Assistente de configuração (roadmap #28): passo a passo de turmas, horários, mensalidades, conta Asaas e convite da equipe, com barra de progresso.
- 1.2 Migração assistida: importar alunos, famílias e responsáveis de planilha exportada de outros sistemas, com mapeamento de colunas salvo por origem (modelos prontos para os concorrentes mais comuns) e relatório de linhas rejeitadas.
- 1.3 Modo demonstração (roadmap #38): escola fictícia com dados gerados, que o interessado usa sozinho, apagada após X dias.

Risco: BAIXO a MÉDIO.
- Assistente só chama RPCs e telas que já existem. Risco baixo.
- A importação reaproveita AdminImportModal e AdminMatriculaImportModal: risco de duplicar alunos e famílias. Mitigação: usar o aviso de duplicidade já existente (DuplicateStudentWarningModal), simular a importação antes de gravar e gravar em transação.
- A demonstração exige isolamento total: tenant próprio, sem push real, sem Asaas real e sem biometria de pessoas reais.

## FASE 2. Financeiro que fecha o ciclo (NFS-e, recibo de IR e régua de cobrança)
Por que: o diretor compra pelo dinheiro que entra. O catálogo já promete "no futuro, nota fiscal".

- 2.1 NFS-e automática ao confirmar pagamento. Verificar primeiro se dá para usar a emissão de notas do próprio Asaas, antes de considerar um emissor externo.
- 2.2 Recibo anual de pagamentos para o Imposto de Renda, em PDF pela Família e em lote pela Gestão.
- 2.3 Régua de cobrança configurável por escola: dias antes e depois do vencimento, canal (push, e-mail e, depois, WhatsApp) e texto. Evolui o send-financial-reminders.
- 2.4 Descontos automáticos: irmãos e pontualidade.
- 2.5 Cartão recorrente (roadmap #31), via Asaas, sem trocar de gateway.

Risco: ALTO (dinheiro e dados fiscais).
- Não alterar processPaymentEvent nem payment-webhook no primeiro momento. A NFS-e roda depois, disparada pelo pagamento já confirmado, em uma fila própria com retentativa. Uma falha na nota nunca pode reverter a baixa do pagamento.
- O desconto mexe no valor cobrado: separar em uma função pura com testes. Valores passados nunca são recalculados.
- Configurar a nota fiscal (CNPJ, município, alíquota) é por escola. Um erro gera nota errada de verdade, então testar no sandbox da homologação (TST01) com nota cancelada.
- Recibo de IR: confere com o mesmo cálculo do extrato da Família, para não mostrar valores diferentes.

## FASE 3. WhatsApp como canal oficial
Por que: muitas famílias não abrem o app. É o canal de maior alcance para cobrança, avisos e retirada.

- 3.1 Envio pela API oficial do WhatsApp Business (por um provedor homologado): comunicados, régua de cobrança e "seu filho saiu às 17h12".
- 3.2 Consentimento por responsável (opt-in), registro de envio e falha, e custo por escola visível na Gestão.
- 3.3 Vender como adicional, com franquia de mensagens.

Risco: MÉDIO.
- É um canal novo, que não substitui o push. Se o provedor cair, o push continua.
- O token do provedor fica só nos segredos da Edge Function, nunca no front.
- Risco de custo: fazer o limite por escola no servidor.
- Não enviar dado sensível (saúde, ocorrência) por WhatsApp, só um aviso com link para o app.

## FASE 4. Totem que não para (modo offline)
Por que: roadmap #1. A queda de internet na hora da saída é o pior momento possível. É um argumento forte de segurança e confiabilidade frente aos concorrentes.

- 4.1 Fila local de eventos de entrada e saída, com envio automático ao voltar a conexão e indicador visível de "offline" (já existe o useOnlineStatus).
- 4.2 Idempotência no servidor: cada evento com id gerado no aparelho, para não duplicar no histórico.
- 4.3 Regra de segurança: offline, a saída exige uma confirmação a mais da Recepção, registrada como "confirmada offline".

Risco: ALTO.
- Mexe no AdminFaceScanner (74KB) e no fluxo de check-in/out, que é o coração do produto.
- Guardar biometria no aparelho é sensível. Usar só o que o totem já carrega em memória, sem gravar descritores em disco sem criptografia e sem análise LGPD.
- Conflito de horário e ordem (saída antes da entrada sincronizada) pode quebrar a integridade do histórico e o cálculo de hora extra.
- Mitigação: módulo desligado por padrão, lógica de fila em um arquivo próprio com testes, encaixe mínimo no scanner, piloto em uma única escola.

## FASE 5. Segurança escolar ampliada
Por que: é o foco do produto, e nenhum concorrente brasileiro de agenda tem retirada auditável com biometria.

- 5.1 Autorização temporária com QR expirável (roadmap #11): o responsável gera o acesso para outra pessoa buscar a criança, com validade e uso único.
- 5.2 Restrição judicial de retirada: pessoa bloqueada, com documento anexado, gerando alerta forte no monitor da Recepção.
- 5.3 Visitantes e prestadores (roadmap #33): cadastro com foto, motivo, crachá e registro de entrada e saída.
- 5.4 Emergência evoluída: lista nominal de presentes na hora, chamada de evacuação (marcar quem está seguro) e push para todas as famílias.
- 5.5 Alerta de retirada fora do padrão: fora do horário, ou responsável que nunca buscou aquela criança.

Risco: MÉDIO.
- 5.1, 5.2 e 5.5 adicionam verificações ao fluxo de saída. Um erro pode bloquear uma retirada legítima. Toda regra nova só gera ALERTA para a Recepção decidir, sem bloqueio automático, salvo a restrição judicial (que também tem override registrado da Gestão).
- O QR expirável é validado só no servidor (RPC), nunca no front.
- Visitantes são uma tabela separada dos alunos, sem misturar com attendance.
- Emergência: o canal Realtime é filtrado por school_id no front (lição do CHANGELOG 1.2.3), e o teste de isolamento entre escolas é obrigatório.

## FASE 6. Painel da direção e retenção
Por que: roadmap #22. O dono da escola vê o valor do Zela em números, o que ajuda na venda e na renovação.

- 6.1 Indicadores: inadimplência, ocupação por turma, frequência, hora extra faturada e matrículas do mês.
- 6.2 Risco de evasão: queda de frequência, atraso de pagamento e família sem acessar o app.
- 6.3 Funil de matrícula: interessado, visita, pré-matrícula, matriculado, e lista de espera por turma.
- 6.4 Relatório mensal "o Zela na sua escola" (check-ins, cobranças, horas economizadas).

Risco: BAIXO.
- É só leitura. O cuidado é com desempenho e com o isolamento: RPCs com security invoker ou checagem de school_id, sem select('*') e com limites.
- O funil de matrícula reaproveita a PublicMatricula. Os novos status não podem mudar o fluxo atual de matrícula.

## FASE 7. Engajamento da família (o dia a dia que fideliza)
- 7.1 Autorizações de passeio e eventos assinadas no app, com prazo e lembrete.
- 7.2 Enquetes rápidas e confirmação de presença em eventos do Calendário.
- 7.3 Agendamento de reunião com a professora ou a coordenação (horários livres).
- 7.4 Portfólio do aluno: linha do tempo com fotos do Mural, Mapa de Habilidades e relatórios, exportável em PDF no fim do semestre.
- 7.5 Marcação de alunos nas fotos do Mural: cada família vê só as fotos em que o filho aparece (marcação manual primeiro).

Risco: BAIXO a MÉDIO.
- 7.1 a 7.3 são telas novas.
- 7.4 e 7.5 lidam com imagens de crianças: o Storage segue privado, com URLs assinadas e respeitando a autorização de uso de imagem.
- Marcação automática por reconhecimento facial fica FORA até haver análise LGPD própria (biometria de terceiros na mesma foto).
- Respeitar a regra das permissões: a família só vê Semestral e Mitigação.

## FASE 8. Confiança e conformidade (venda para escolas maiores e redes)
- 8.1 Verificação em dois fatores (roadmap #23) para Gestão, Recepção, Financeiro e Developer.
- 8.2 Central LGPD do titular (roadmap #25): exportação e pedido de exclusão, e relatório de consentimentos para a escola.
- 8.3 Página de status pública e o SLA já escrito (roadmap #30).
- 8.4 Central de ajuda dentro do app (roadmap #29).

Risco: MÉDIO (Auth).
- O 2FA pode trancar usuários fora. Liberar por perfil, de forma opcional no início, com recuperação pela Gestão e pelo Developer, e testar no app nativo (sessão, troca de conta).
- A exportação LGPD só traz os dados do próprio titular, validada no servidor.

## FASE 9. Assistente com IA
- 9.1 Rascunho do relatório semestral a partir de tópicos da professora, no tom da escola, sempre revisado antes de publicar.
- 9.2 Resumo do dia da turma para a família, a partir do Diário.
- 9.3 Tradução de comunicados (roadmap #36).

Risco: MÉDIO (dados de crianças enviados a terceiro).
- É um adicional desligado, com aceite da escola e um contrato de tratamento com o provedor.
- Enviar o mínimo necessário (primeiro nome, sem saúde nem ocorrências), pela Edge Function, nunca com a chave no front.
- Nada é publicado sem revisão humana.

## FASE 10. Expansão (só sob demanda de cliente pagante)
- 10.1 Múltiplas unidades por rede (roadmap #4). Risco ALTO: muda o modelo de tenant e as policies. Exige um plano próprio de arquitetura e segurança.
- 10.2 Ponto facial de funcionários, reaproveitando o motor facial. Risco MÉDIO (biometria de adultos, legislação trabalhista do ponto).
- 10.3 Transporte escolar com embarque e desembarque. Risco MÉDIO.
- 10.4 Cantina pré-paga (roadmap #21). Risco ALTO (saldo e dinheiro).
- 10.5 Integração com catracas (roadmap #15). Risco ALTO (hardware).

---

## Resumo de risco por fase
| Fase | Tema | Risco | Toca fluxo crítico? |
|---|---|---|---|
| 1 | Onboarding, migração e demonstração | Baixo/Médio | Não (importação sim) |
| 2 | NFS-e, recibo de IR e régua | Alto | Financeiro |
| 3 | WhatsApp | Médio | Não (canal novo) |
| 4 | Totem offline | Alto | Check-in/out e biometria |
| 5 | Segurança escolar ampliada | Médio | Saída (só alertas) |
| 6 | Painel da direção | Baixo | Não |
| 7 | Engajamento da família | Baixo/Médio | Storage de imagens |
| 8 | 2FA, LGPD e status | Médio | Auth |
| 9 | IA | Médio | Dados sensíveis |
| 10 | Expansão | Médio/Alto | Depende |

Sugestão de execução: as Fases 1 e 6 (risco baixo e valor imediato de venda) podem rodar em paralelo à preparação da Fase 2. As Fases 2 e 4 têm o maior risco: cada uma em uma sessão própria de planejamento detalhado antes de qualquer código.
