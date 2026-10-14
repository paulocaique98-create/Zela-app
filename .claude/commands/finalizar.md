---
description: Encerra a sessão, atualiza status, commita, faz push, abre PR, faz o merge e avisa para /clear
---

Finalize a sessão atual do Zela. Siga na ordem e pare ao primeiro problema, avisando o motivo.

1. **Verificar**: `git status -s` e `git diff --stat`. Se não houver mudanças, diga isso e vá direto ao passo 6.
   - Nunca incluir `android/app/google-services.json`, `.env*`, chaves ou credenciais. Se aparecerem no diff, parar e avisar.
2. **Testes**: se houve mudança de código, rodar só os testes relacionados (`npx vitest run <arquivo>`) e o build filtrado (`2>&1 | grep -E "error|Error" | head -n 30`). Se algo falhar, parar e mostrar só as falhas. Nunca declarar teste não executado.
3. **Status**: atualizar `docs/ZELA_STATUS.md` em até 5 linhas (o que mudou, pendências). Se houve mudança relevante, acrescentar linha em `docs/CHANGELOG.md`. Se a sessão deixou pendência ou decisão não óbvia, salvar na memória.
4. **Branch**: se estiver na `main`, criar branch (`feat/...`, `fix/...`) com nome curto sobre a mudança. Nunca commitar direto na `main`.
5. **Commit, push e PR**:
   - `git add` só dos arquivos da tarefa (por caminho, nunca `git add -A`).
   - Commit em português no padrão do histórico (`feat(escopo): ...`, `fix(escopo): ...`), com o Co-Authored-By indicado no contexto.
   - `git push -u origin <branch>`.
   - `gh pr create` com título e corpo curtos (o que mudou, impacto em segurança/RLS/dados se houver, o que foi testado), com a linha de atribuição do contexto.
   - `gh pr merge --merge --delete-branch` (o repositório não tem proteção de branch, então `--auto` falha). Se o merge for negado por permissão, parar e avisar o usuário, sem contornar.
   - Mudanças em RLS, policies, Auth, Storage, Realtime, migrations ou Edge Functions: avisar que o merge vai para produção e que migrations/funções precisam de deploy separado no Supabase. Não rodar esse deploy sem pedido.
6. **Sincronizar**: voltar para a `main` e `git pull` para ficar atualizado após o merge (se o merge ainda estiver pendente, dizer).
7. **Resposta final** (até 10 linhas): resumo, arquivos alterados, link do PR, validações realmente executadas, pendências. Terminar dizendo se a tarefa está 100% concluída e se o usuário deve dar `/clear`.
