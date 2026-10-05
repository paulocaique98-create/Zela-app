const PAGINA = 1000;

// O Supabase devolve no máximo 1000 linhas por consulta. Recebe uma função que
// monta a consulta (com order estável) e junta todas as páginas.
export async function buscarTodos(montar) {
  const todos = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1);
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < PAGINA) return todos;
  }
}
