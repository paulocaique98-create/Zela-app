---
description: Versão enxuta do /finalizar para mudanças pequenas de tela, texto ou estilo: commita, dá push e abre PR e faz o merge, sem atualizar docs
---

Entrega rápida de mudança pequena no Zela. Siga na ordem e pare ao primeiro problema, avisando o motivo.

**Quando usar**: ajustes de interface, textos, estilos, comentários, botões ligados/desligados. **Não usar** (rodar `/finalizar`): RLS, policies, Auth, Storage, Realtime, migrations, Edge Functions, check-in/out, facial, financeiro ou qualquer mudança relevante que mereça registro em `docs/`.

1. **Verificar**: `git status -s` e `git diff --stat`. Sem mudanças: dizer isso e parar.
   - Se o diff tocar `supabase/`, RLS, Auth, Storage, Realtime, facial, check-in/out ou financeiro: parar e recomendar `/finalizar`.
   - Nunca incluir `android/app/google-services.json`, `.env*`, chaves ou credenciais.
2. **Testes**: se mudou código, rodar só os testes relacionados (`npx vitest run <arquivo>`, se existirem) e o build filtrado (`2>&1 | grep -E "error|Error" | head -n 30`). Falhou: parar e mostrar só as falhas. Nunca declarar teste não executado.
3. **Branch**: se estiver na `main`, criar branch curta (`feat/...`, `fix/...`). Nunca commitar direto na `main`.
4. **Commit, push e PR**:
   - `git add` só dos arquivos da tarefa (por caminho, nunca `git add -A`).
   - Commit em português no padrão do histórico, com o Co-Authored-By indicado no contexto.
   - `git push -u origin <branch>`.
   - `gh pr create` com título e corpo curtos, com a linha de atribuição do contexto.
   - `gh pr merge --merge --delete-branch` (o repositório não tem proteção de branch, então `--auto` falha). Se o merge for negado por permissão, parar e avisar o usuário, sem contornar.
5. **Sincronizar**: voltar para a `main` e `git pull` (se o merge estiver pendente, dizer).
6. **Resposta final** (até 5 linhas): resumo, link do PR, validações realmente executadas. Não atualiza `ZELA_STATUS.md`, `CHANGELOG.md` nem memória. Dizer se a tarefa está concluída e se deve dar `/clear`.
