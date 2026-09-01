import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { TURMAS } from './constants';

// Flexibilidade de Método Pedagógico — Fase 1.
//
// Defaults por método vivem aqui no client (não em tabela de banco — só 2
// métodos conhecidos hoje, uma tabela pedagogical_methods seria over-
// engineering nesse tamanho; ver RELATORIO_MESTRE_ESTADO_ATUAL_ZELA.md).
// `custom_config` da escola (se houver) sobrescreve esses defaults campo a
// campo.
export const PEDAGOGICAL_METHOD_DEFAULTS = {
  tradicional: {
    terminology: { teacher: 'Professor(a)', student: 'Aluno', class: 'Turma' },
  },
  montessori: {
    terminology: { teacher: 'Guia', student: 'Aluno', class: 'Agrupamento' },
  },
  personalizado: {
    terminology: { teacher: 'Professor(a)', student: 'Aluno', class: 'Turma' },
  },
};

// `turmas` sem valor configurado (escola ainda não migrou) cai no fallback
// da constante global — mantém compatibilidade com o que já existia antes
// desta feature. Sem o item "Todas as Turmas" (é um sentinel de filtro de
// UI, não uma turma de verdade — cada tela decide se precisa dele).
const FALLBACK_TURMAS = TURMAS.filter(t => t !== 'Todas as Turmas');

// Carrega a configuração pedagógica da escola do usuário logado. Devolve
// { method, terminology, turmas, loading } — `turmas` já resolvido (dado
// real da escola, ou fallback global se ainda não configurado).
export function useSchoolConfig(schoolId) {
  const [state, setState] = useState({ method: 'tradicional', terminology: PEDAGOGICAL_METHOD_DEFAULTS.tradicional.terminology, turmas: FALLBACK_TURMAS, loading: true });

  useEffect(() => {
    let active = true;
    if (!schoolId) {
      setState(s => ({ ...s, loading: false }));
      return;
    }

    async function load() {
      const { data, error } = await supabase
        .from('schools')
        .select('pedagogical_method, custom_config, turmas')
        .eq('id', schoolId)
        .single();
      if (!active) return;
      if (error || !data) {
        setState(s => ({ ...s, loading: false }));
        return;
      }
      const method = data.pedagogical_method || 'tradicional';
      const defaults = PEDAGOGICAL_METHOD_DEFAULTS[method] || PEDAGOGICAL_METHOD_DEFAULTS.tradicional;
      const terminology = data.custom_config?.terminology
        ? { ...defaults.terminology, ...data.custom_config.terminology }
        : defaults.terminology;
      const turmas = (data.turmas && data.turmas.length > 0) ? data.turmas : FALLBACK_TURMAS;
      setState({ method, terminology, turmas, loading: false });
    }
    load();

    return () => { active = false; };
  }, [schoolId]);

  return state;
}
