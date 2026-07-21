# Changelog
Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [1.1.3] - 2026-07-21
### Adicionado
- Sistema de notificações em tempo real para responsáveis (check-in, check-out, lembretes de atraso e cobrança extra)
- Novo status "Pendente de Check-in" para alunos, substituindo o comportamento incorreto de "Ausente" por padrão
- Tela fullscreen de Totem Check-in dentro do Portal do Administrador, com proteção por senha para sair
- Edge Function de reset diário automático (daily-reset), rodando via pg_cron, eliminando dependência de navegador aberto
- PIN de acesso manual (CPF) como alternativa ao reconhecimento facial no totem

### Corrigido
- Recursão infinita em políticas RLS da tabela users e tabelas relacionadas (students, authorized_persons, attendance_logs)
- Erro "column status does not exist" na função get_kiosk_school_id()
- Vulnerabilidade de autenticação na Edge Function daily-reset (aceitava Anon Key indevidamente)
- Erro 404 em rotas internas no deploy da Vercel (adicionado vercel.json com rewrite para SPA)
- Ajustes de layout responsivo (desktop e mobile) em todos os portais

### Removido
- Recurso de Kiosk público (/totem) temporariamente isolado para relançamento futuro
- Formulário de Ficha Médica e Envio de Documentos do cadastro de responsáveis
