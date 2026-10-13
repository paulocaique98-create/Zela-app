# Política de SLA e Atendimento ao Cliente do Zela Edu

Anexo ao contrato de prestação de serviços. Versão 1.1 (rascunho de 13/10/2026).

Os valores abaixo foram calibrados para uma operação enxuta, com um único profissional responsável por desenvolvimento e suporte, e seguem faixas usuais de mercado para SaaS de pequeno porte. Revisar com o jurídico antes da assinatura. Só aparece entre colchetes o que depende de dados pessoais ou de decisão ainda não tomada.

## 1. Objetivo

Definir prazos, canais e responsabilidades no atendimento às escolas contratantes, para que ambas as partes saibam o que esperar em caso de dúvida, falha ou incidente. O Zela Edu apoia a rotina de segurança escolar (entrada e saída de alunos), por isso falhas que afetam essa rotina têm prioridade.

## 2. Canais de atendimento

| Canal | Uso | Contato |
|---|---|---|
| E-mail de suporte | Todos os chamados, com registro | zela.dev26@gmail.com (trocar pelo e-mail do domínio quando existir) |
| Página de suporte | Orientações e abertura de chamado | https://zelaedu.com.br/suporte.html |
| WhatsApp | Somente severidade Crítica, depois de abrir chamado por e-mail | [informar número comercial] |

Todo chamado recebe um número de protocolo. Pedidos feitos fora do e-mail só valem como chamado depois de registrados com protocolo.

Quem pode abrir chamado: a Gestão da escola e os contatos autorizados no contrato (até 3 por escola). Famílias e professores falam primeiro com a Gestão da própria escola, que é a ponte com o suporte.

## 3. Horário de atendimento

- Atendimento padrão: dias úteis, das 09h às 18h, horário de Brasília, exceto feriados nacionais e do estado do prestador.
- Severidade Crítica: nos dias letivos, das 07h às 19h, para cobrir a entrada e a saída dos alunos. Não há plantão de madrugada, fim de semana ou feriado.
- Fora dessas janelas, o chamado é registrado e o prazo começa a contar na próxima janela de atendimento.
- Ausências previstas do prestador (férias, viagem, saúde) são avisadas com no mínimo 7 dias, quando previsíveis, e informam o procedimento alternativo. Em ausência imprevista, os prazos são suspensos pelo período e a escola é comunicada assim que possível.

## 4. Níveis de severidade

| Nível | Definição | Exemplos |
|---|---|---|
| Crítica (S1) | Serviço parado ou risco à segurança dos alunos, sem alternativa | Check in e check out indisponíveis para toda a escola, login geral fora do ar, suspeita de acesso indevido a dados, dados de uma escola visíveis para outra |
| Alta (S2) | Função importante com falha, existe alternativa parcial | Reconhecimento facial falhando, notificações não chegando, Monitor da Recepção instável |
| Média (S3) | Falha que não impede o uso principal | Relatório com erro, tela com defeito, lentidão pontual |
| Baixa (S4) | Dúvida, melhoria ou ajuste cosmético | Como usar um recurso, pedido de nova função |

A severidade inicial é proposta pela escola e confirmada pelo suporte, que pode reclassificar com justificativa registrada no chamado.

## 5. Prazos de resposta e solução

Prazo de resposta é o tempo até o primeiro retorno do suporte, com análise inicial. Prazo de solução é o tempo até a correção ou uma solução de contorno aceita pela escola. Os tempos contam dentro das janelas da seção 3 e são metas de melhor esforço, exceto a resposta, que é compromisso.

| Severidade | Resposta | Solução ou contorno | Atualizações ao cliente |
|---|---|---|---|
| Crítica (S1) | 2 horas | 8 horas | A cada 2 horas |
| Alta (S2) | 4 horas | 3 dias úteis | A cada dia útil |
| Média (S3) | 2 dias úteis | 10 dias úteis | Na conclusão |
| Baixa (S4) | 5 dias úteis | Avaliada para o roadmap | Na conclusão |

A solução definitiva pode vir depois do contorno, em prazo combinado no chamado. Quando a correção depende de fornecedor terceiro (hospedagem, banco de dados, lojas de aplicativos), o prazo de solução fica suspenso e a escola recebe atualizações enquanto durar.

## 6. Disponibilidade do serviço

- Meta de disponibilidade mensal: 99,0% (cerca de 7 horas de indisponibilidade no mês), medida sobre o serviço em produção, excluídas as hipóteses da seção 8. A meta é realista para quem depende de infraestrutura de terceiros e opera sem plantão 24 horas.
- Manutenções programadas: avisadas com no mínimo 48 horas de antecedência, em janela fora do horário letivo (noite ou fim de semana) e limitadas a 4 horas por mês.
- Manutenções emergenciais (correção de segurança): podem ocorrer sem aviso prévio, com comunicação logo que possível.
- O relatório mensal de disponibilidade fica à disposição da escola mediante pedido.

## 7. Compensação por descumprimento

Se a disponibilidade mensal ficar abaixo da meta por causa do Zela Edu, a escola pode pedir crédito na mensalidade seguinte:

| Disponibilidade no mês | Crédito sobre a mensalidade |
|---|---|
| Abaixo de 99,0% e até 98,0% | 5% |
| Abaixo de 98,0% e até 95,0% | 10% |
| Abaixo de 95,0% | 15% |

- O pedido deve ser feito por escrito em até 30 dias após o fim do mês.
- O crédito é a compensação única por indisponibilidade, salvo o que a lei determinar, e tem teto de 15% da mensalidade do mês.
- Descumprir só prazo de resposta ou solução, sem queda de disponibilidade, não gera crédito, mas entra no escalonamento da seção 11.
- Cabe ao jurídico revisar esta seção frente ao Código de Defesa do Consumidor e ao tipo de contrato (escola pessoa jurídica).

## 8. O que não conta como descumprimento

- Falhas de internet, energia, tablets, câmeras ou aparelhos da escola e das famílias.
- Indisponibilidade de provedores terceiros (hospedagem, banco de dados, e-mail, notificações push, lojas de aplicativos, meios de pagamento), enquanto o fornecedor estiver fora do ar.
- Manutenção programada avisada conforme a seção 6.
- Uso fora do previsto, aparelhos ou versões sem suporte, ou alteração feita pela escola fora da plataforma.
- Casos fortuitos e de força maior.
- Dados incorretos informados pela escola (cadastro, fotos, vínculos de autorizados).
- Ações da escola que o suporte tenha desaconselhado por escrito.

## 9. Contingência em falha do check in e check out

A escola deve manter um procedimento manual para a entrada e saída de alunos (lista de autorizados impressa ou salva, conferência de documento pela Recepção). A segurança dos alunos nunca deve depender só do sistema. O suporte orienta a escola, em caso de S1, sobre o procedimento de contingência durante o atendimento do chamado.

## 10. Incidentes de segurança e dados pessoais

- Suspeita de acesso indevido, vazamento ou exposição de dados é sempre tratada como S1.
- O Zela Edu comunica a escola em até 24 horas depois de confirmar o incidente que envolva dados pessoais, com o que se sabe, o impacto e as medidas tomadas. Esse prazo vale mesmo fora das janelas da seção 3, em melhor esforço.
- A comunicação à ANPD e aos titulares segue a LGPD e o contrato. A divisão de papéis entre controlador (escola) e operador (Zela Edu) deve estar descrita no contrato. [Revisar com o jurídico]
- Dados de menores e dados biométricos recebem tratamento prioritário.
- Pedidos de exclusão de conta feitos pelo app são concluídos pela escola em até 30 dias, conforme a política de privacidade.

## 11. Escalonamento

Se o prazo vencer ou a escola discordar do atendimento:

1. Suporte: todo chamado começa aqui.
2. Reclamação formal: a Gestão envia e-mail com o assunto "Escalonamento" e o protocolo. O prestador responde em até 2 dias úteis com plano de ação e prazo.
3. Persistindo o problema por mais de 10 dias úteis, ou em descumprimentos repetidos (3 ou mais no trimestre), as partes fazem reunião de alinhamento. Reincidência grave pode ser motivo de rescisão sem multa, nos termos do contrato. [Revisar com o jurídico]

## 12. Comunicação de incidentes e melhorias

- Falhas que afetam várias escolas são comunicadas à Gestão por e-mail e por aviso no app, com início, impacto, ações e previsão.
- Após todo incidente S1, o Zela Edu entrega em até 5 dias úteis um relatório curto com causa, correção e medida de prevenção.
- Mudanças que alterem o uso do sistema são avisadas com no mínimo 7 dias de antecedência, salvo correção urgente.

## 13. Responsabilidades da escola

- Indicar contatos autorizados e mantê-los atualizados.
- Descrever o problema com clareza: o que ocorreu, quando, quem foi afetado, prints e o aparelho usado.
- Dar acesso ou informações pedidas pelo suporte. O prazo pausa enquanto se aguarda a resposta da escola.
- Manter o app e o navegador atualizados.
- Treinar a equipe e manter o procedimento de contingência da seção 9.
- Não compartilhar senhas, PIN ou QR Code, e remover acessos de ex funcionários.

## 14. Calendário escolar

Nos períodos de matrícula, início de ano e fechamento de relatórios, o suporte pode oferecer reforço dentro do possível. A escola deve avisar com 15 dias de antecedência eventos grandes (reunião de pais, evento com muitas saídas) para planejamento. Nas primeiras 2 semanas após a implantação, o prestador oferece acompanhamento próximo, com resposta prioritária.

## 15. Indicadores acompanhados internamente

Tempo de primeira resposta, tempo de solução por severidade, percentual de chamados dentro do prazo, disponibilidade mensal e reincidência. Resumo disponível à escola a cada trimestre, mediante pedido.

## 16. Vigência e revisão

Esta política vale enquanto o contrato estiver ativo. Pode ser revisada a cada 12 meses ou quando houver mudança relevante de serviço, com aviso prévio de 30 dias. Em caso de conflito com o contrato, vale o contrato. Quando a equipe de suporte crescer, os prazos e a meta de disponibilidade poderão ser melhorados, nunca piorados, durante a vigência do contrato.

## Pendências para fechar o documento

1. Informar o número de WhatsApp comercial e trocar o e-mail pelo do domínio quando existir.
2. Revisão jurídica das seções 7 (crédito), 10 (LGPD), 11 (rescisão) e 16.
3. Decidir se haverá página de status pública (hoje o aviso é por e-mail e no app).
4. Anexar ao contrato e à página de suporte depois de aprovado.

## Notas de risco (internas, não vão para o contrato)

- Operação solo: férias, doença ou um incidente à noite derrubam o prazo. Vale ter um segundo profissional de confiança com acesso de emergência (conta de Supabase e deploy) para S1 e para a ausência prevista.
- Montar alertas de queda para saber do problema antes da escola. Use um monitor de uptime gratuito (UptimeRobot ou Better Stack; limites do plano gratuito a conferir) com alerta por e-mail ou Telegram, e monitore: (1) `https://zelaedu.com.br`; (2) a API do Supabase de produção, porque o site pode estar no ar com o backend fora; (3) opcionalmente `suporte.html` e `privacidade.html`, exigidas pelas lojas. O Sentry é monitor de erros, não de disponibilidade (o recurso de uptime dele não foi verificado), então não substitui o monitor de uptime. O `error_logs` do Portal do Dev já cobre erros do app; só adote o Sentry se ele trouxer algo a mais.
- Os horários de queda registrados pelo monitor servem de base para o relatório mensal de disponibilidade e para decidir pedidos de crédito (seção 7).
- Comece pelos valores deste documento. É mais fácil melhorar o SLA depois do que prometer mais e descumprir.
