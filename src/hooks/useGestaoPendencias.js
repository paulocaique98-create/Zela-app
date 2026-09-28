import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/gestaoUtils';

// Documentos que todo aluno ativo precisa ter na pasta (Secretaria ·
// Documentos pendentes). Categorias de student_documents.
export const REQUIRED_DOCUMENTS = [
  { key: 'certidao_nascimento', label: 'Certidão de Nascimento' },
  { key: 'cartao_vacina', label: 'Cartão de Vacina' },
  { key: 'comprovante_residencia', label: 'Comprovante de Residência' },
];

export async function fetchDocumentosPendentes(schoolId) {
  const [{ data: students }, { data: docs }] = await Promise.all([
    supabase.from('students').select('id, name, turma, enrollment_status').eq('school_id', schoolId).order('name'),
    supabase.from('student_documents').select('student_id, category').eq('school_id', schoolId),
  ]);
  const byStudent = new Map();
  for (const d of docs || []) {
    if (!byStudent.has(d.student_id)) byStudent.set(d.student_id, new Set());
    byStudent.get(d.student_id).add(d.category);
  }
  return (students || [])
    .filter(s => (s.enrollment_status || 'ativo') === 'ativo')
    .map(s => ({ ...s, missing: REQUIRED_DOCUMENTS.filter(r => !byStudent.get(s.id)?.has(r.key)) }))
    .filter(s => s.missing.length > 0);
}

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function useGestaoPendencias(currentUser) {
  const schoolId = currentUser?.school_id;
  const [state, setState] = useState({ isLoading: true, data: null, error: '' });

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setState(s => ({ ...s, isLoading: true, error: '' }));
    try {
      const [cadastros, matriculas, correcoes, vencidas, contratos, despesas, exclusoes, biometria, documentos] = await Promise.all([
        supabase.from('users').select('id, name, role').eq('school_id', schoolId).eq('status', 'pending').in('role', ['family', 'teacher']),
        supabase.from('matricula_solicitacoes').select('id, tipo, criancas, submitted_at').eq('school_id', schoolId).eq('status', 'pending'),
        supabase.from('attendance_corrections').select('id, requested_at, increases_billing, students:student_id(name)').eq('school_id', schoolId).eq('status', 'pending'),
        supabase.from('financial_charges').select('id, amount_cents, due_date, students:student_id(name)').eq('school_id', schoolId).eq('status', 'OVERDUE'),
        supabase.from('contract_documents').select('id, title, sent_at, students:student_id(name)').eq('school_id', schoolId).eq('status', 'enviado'),
        supabase.from('expenses').select('id, description, amount_cents, due_date').eq('school_id', schoolId).eq('status', 'pendente').lte('due_date', inDays(7)),
        supabase.from('account_deletion_requests').select('id, user_name, user_role, requested_at').eq('school_id', schoolId).eq('status', 'pendente'),
        supabase.rpc('list_biometria_para_limpar'),
        fetchDocumentosPendentes(schoolId),
      ]);
      const firstError = [cadastros, matriculas, correcoes, vencidas, contratos, despesas, exclusoes, biometria].find(r => r.error)?.error;
      if (firstError) throw firstError;
      setState({
        isLoading: false,
        error: '',
        data: {
          cadastros: cadastros.data || [],
          matriculas: matriculas.data || [],
          correcoes: correcoes.data || [],
          vencidas: vencidas.data || [],
          vencidasTotal: (vencidas.data || []).reduce((sum, c) => sum + (c.amount_cents || 0), 0),
          contratos: contratos.data || [],
          despesas: despesas.data || [],
          despesasAtrasadas: (despesas.data || []).filter(d => d.due_date < todayISO()),
          exclusoes: exclusoes.data || [],
          biometria: (biometria.data || []).map(b => ({ ...b, id: b.person_id })),
          documentos,
        },
      });
    } catch (err) {
      console.error('[useGestaoPendencias] Erro ao carregar pendências:', err);
      setState({ isLoading: false, data: null, error: 'Não foi possível carregar as pendências.' });
    }
  }, [schoolId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
