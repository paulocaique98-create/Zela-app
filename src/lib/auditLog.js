import { supabase } from './supabase';

// Registra uma ação administrativa sensível (publicar/arquivar/excluir) no
// log de auditoria. Best-effort: uma falha aqui nunca deve travar a ação
// principal que está sendo registrada.
export async function logAction({ schoolId, actorId, action, entityType, entityId, details }) {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      school_id: schoolId,
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || null,
    });
    if (error) console.warn('[auditLog] Falha ao registrar:', error.message);
  } catch (err) {
    console.warn('[auditLog] Falha ao registrar:', err);
  }
}
