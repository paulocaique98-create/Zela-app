import React, { useEffect, useState, useCallback } from 'react';
import { ScrollText, Loader2, Trash2, Pencil, Send, UserRound, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, EmptyState } from './GestaoShared';

const PAGE_SIZE = 50;

const ACTION_LABELS = {
  publish: 'Publicou',
  archive: 'Arquivou',
  delete: 'Excluiu',
  correct_attendance: 'Corrigiu um registro de',
  delete_attendance: 'Apagou um registro de',
  delete_authorized_person: 'Excluiu o cadastro de',
  enroll_biometric_consent: 'Cadastrou biometria (com consentimento) de',
  remove_biometric_photo: 'Removeu foto/biometria de',
  cancel_checkin_request: 'Cancelou a solicitação de check-in/out de',
  update_student_profile: 'Editou o cadastro de',
  transfer_student_external: 'Transferiu para outra escola',
  upload_student_document: 'Enviou um documento de',
  delete_student_document: 'Excluiu um documento de',
  approve_matricula_solicitacao: 'Aprovou a matrícula de',
  reject_matricula_solicitacao: 'Rejeitou a matrícula de',
  request_matricula_changes: 'Pediu ajustes na matrícula de',
  trocar_conta: 'Trocou de conta',
};

// Ações que apagam ou removem algo ganham tom de alerta; as demais, tom neutro.
const DESTRUTIVAS = ['delete', 'delete_attendance', 'delete_authorized_person', 'remove_biometric_photo', 'delete_student_document', 'reject_matricula_solicitacao', 'cancel_checkin_request'];
function iconeDaAcao(action) {
  if (DESTRUTIVAS.includes(action)) return Trash2;
  if (action === 'publish' || action === 'archive') return Send;
  if (action === 'trocar_conta') return UserRound;
  if (action.startsWith('approve')) return ShieldCheck;
  return Pencil;
}

const ENTITY_LABELS = {
  mitigacao_report: 'Relatório de Mitigação',
  attendance_log: 'Presença',
  authorized_person: 'Autorizado',
  student: 'Aluno',
  matricula_solicitacao: 'Solicitação',
  user: '',
};

function formatWhen(iso) {
  const date = new Date(iso);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminAuditLog({ currentSchool }) {
  const [logs, setLogs] = useState([]);
  const [actorNames, setActorNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadActorNames = useCallback(async (rows) => {
    const actorIds = [...new Set(rows.map(r => r.actor_id).filter(Boolean))];
    if (actorIds.length === 0) return;
    const { data: users } = await supabase.from('users').select('id, name').in('id', actorIds);
    setActorNames(prev => {
      const map = { ...prev };
      (users || []).forEach(u => { map[u.id] = u.name; });
      return map;
    });
  }, []);

  const fetchPage = useCallback(async (offset, { append } = { append: false }) => {
    if (!currentSchool?.id) return;
    if (append) setLoadingMore(true); else setLoading(true);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('school_id', currentSchool.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(error);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    const rows = data || [];
    setLogs(prev => (append ? [...prev, ...rows] : rows));
    setHasMore(rows.length === PAGE_SIZE);
    await loadActorNames(rows);
    setLoading(false);
    setLoadingMore(false);
  }, [currentSchool?.id, loadActorNames]);

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  const handleLoadMore = () => fetchPage(logs.length, { append: true });

  return (
    <PageShell description="Ações sensíveis registradas por administradores da escola." infoOnMobile>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-on-surface-variant/70">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={ScrollText} text="Nenhuma ação registrada ainda." />
      ) : (
        <>
          <ul className="grid grid-cols-1 xl:grid-cols-2 gap-2 items-start">
            {logs.map(log => {
              const Icone = iconeDaAcao(log.action);
              const destrutiva = DESTRUTIVAS.includes(log.action);
              const alvo = ENTITY_LABELS[log.entity_type] ?? log.entity_type;
              const nome = log.details?.student_name || log.details?.name;
              return (
                <li key={log.id} className="flex items-start gap-3 p-3 border border-outline-variant rounded-zela-lg bg-surface-container-lowest">
                  <span className={`w-9 h-9 shrink-0 rounded-zela-md flex items-center justify-center ${destrutiva ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}><Icone size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-on-surface break-words">
                      {[ACTION_LABELS[log.action] || log.action.replace(/_/g, ' '), alvo].filter(Boolean).join(' ')}{nome ? `, ${nome}` : ''}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">por {actorNames[log.actor_id] || log.actor_name || 'Usuário'}</p>
                    <p className="text-xs text-on-surface-variant/70 mt-0.5 tabular-nums">{formatWhen(log.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full sm:w-auto h-10 flex items-center justify-center gap-2 text-sm font-bold text-primary bg-primary/10 hover:bg-primary/20 px-5 rounded-zela-md transition disabled:opacity-60"
              >
                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                {loadingMore ? 'Carregando' : 'Carregar mais'}
              </button>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
