# Rascunho de privacidade e permissões do app (para revisão jurídica)

Status: rascunho técnico, não é texto final nem parecer jurídico. Revisar com advogado (LGPD, dados de crianças e biometria) antes das lojas.

## Permissões Android (AndroidManifest)
| Permissão | Para quê | Obrigatória |
|---|---|---|
| CAMERA | Cadastro facial e reconhecimento no totem; leitura de QR Code | Não (recurso declarado como não obrigatório) |
| POST_NOTIFICATIONS | Avisos de entrada e saída, comunicados | Não, o usuário pode negar |
| INTERNET | Comunicação com o servidor | Sim |

## Dados tratados pelo app
- Cadastro: nome, e-mail, vínculo com a escola e com os alunos.
- Biometria facial (dado pessoal sensível, LGPD art. 5, II e art. 11): usada só para identificar responsáveis e autorizados no check-in/out. Pontos a definir com o jurídico: base legal (consentimento específico), prazo de retenção, exclusão a pedido, quem na escola acessa.
- Token de notificação (FCM) por aparelho, ligado à conta e à escola.
- Dados de crianças: tratamento com consentimento de um dos pais ou responsável (art. 14).

## Operadores e destinos
- Supabase (banco, autenticação, armazenamento, funções).
- Google Firebase Cloud Messaging (entrega de push; recebe só o token e o conteúdo do aviso).
- Asaas (cobrança), quando o módulo financeiro estiver ativo.

## Pontos para as lojas
- Google Play: formulário de Segurança de dados (coleta de imagem facial, identificadores, notificações) e URL da política.
- Apple: rótulos de privacidade e justificativa de câmera (`NSCameraUsageDescription`) quando o iOS existir.
- Política de privacidade pública, com contato do encarregado (DPO).

## Perguntas em aberto
1. As imagens faciais ficam armazenadas ou só o descritor numérico? (confirmar no fluxo atual antes de redigir)
2. Prazo de retenção após a saída do aluno da escola.
3. Quem é controlador (escola) e quem é operador (Zela).
