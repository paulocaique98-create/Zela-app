import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading, Notice } from './GestaoShared';

// Só o Administrativo por enquanto: o portal das professoras não tem estes
// módulos (a tabela no banco já aceita 'teacher' pra quando tiver).
const ROLES = [
  { id: 'admin', label: 'Administrativo' },
];

// Permissões · Perfis e Permissões. A Gestão tem tudo sempre (não dá pra se
// trancar pra fora); aqui ela libera ou retira dos perfis Administrativo e
// Professoras o acesso aos módulos novos (despesas, contratos, baixa manual…).
// O que for liberado aparece no Portal do Admin, no grupo "Gestão".
export default function GestaoPermissoes({ currentUser }) {
  const [catalog, setCatalog] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [cat, ov] = await Promise.all([
      supabase.from('permission_catalog').select('*').order('area').order('label'),
      supabase.from('school_role_permissions').select('role, permission, granted').eq('school_id', currentUser.school_id),
    ]);
    if (cat.error || ov.error) { setError('Não foi possível carregar as permissões.'); setCatalog([]); return; }
    setCatalog(cat.data || []);
    const map = {};
    (ov.data || []).forEach(o => { map[`${o.role}:${o.permission}`] = o.granted; });
    setOverrides(map);
  }, [currentUser.school_id]);
  useEffect(() => { load(); }, [load]);

  const effective = (perm, role) => {
    const key = `${role}:${perm.permission}`;
    return key in overrides ? overrides[key] : (perm.default_roles || []).includes(role);
  };

  const toggle = async (perm, role) => {
    const key = `${role}:${perm.permission}`;
    const next = !effective(perm, role);
    setSaving(key);
    setError('');
    const { error: e } = await supabase.from('school_role_permissions').upsert({
      school_id: currentUser.school_id, role, permission: perm.permission, granted: next,
      updated_by: currentUser.id, updated_at: new Date().toISOString(),
    });
    setSaving('');
    if (e) { setError(e.message); return; }
    setOverrides(prev => ({ ...prev, [key]: next }));
  };

  const areas = useMemo(() => {
    const map = {};
    (catalog || []).forEach(p => { (map[p.area] = map[p.area] || []).push(p); });
    return Object.entries(map);
  }, [catalog]);

  const isGestao = currentUser.role === 'gestao';

  return (
    <PageShell description="O que cada perfil da equipe pode fazer nos módulos de gestão. A Gestão sempre tem acesso a tudo.">
      <div className="space-y-4">
        <Notice>{error}</Notice>
        {!isGestao && <Notice>Somente a Gestão altera permissões.</Notice>}
        {catalog === null ? <Loading /> : (
          <div className="overflow-x-auto bg-surface-container-lowest border border-outline-variant rounded-zela-lg">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
                <th className="py-3 px-4">Permissão</th>
                <th className="py-3 px-3 text-center">Gestão</th>
                {ROLES.map(r => <th key={r.id} className="py-3 px-3 text-center">{r.label}</th>)}
              </tr></thead>
              <tbody>
                {areas.map(([area, perms]) => (
                  <React.Fragment key={area}>
                    <tr><td colSpan={2 + ROLES.length} className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-primary">{area}</td></tr>
                    {perms.map(p => (
                      <tr key={p.permission} className="border-b border-outline-variant/50">
                        <td className="py-2.5 px-4 text-on-surface">{p.label}</td>
                        <td className="py-2.5 px-3 text-center"><span className="inline-flex items-center gap-1 text-xs text-on-surface-variant"><Lock size={12} /> sempre</span></td>
                        {ROLES.map(r => {
                          const key = `${r.id}:${p.permission}`;
                          const on = effective(p, r.id);
                          return (
                            <td key={r.id} className="py-2.5 px-3 text-center">
                              <button
                                id={`perm-${r.id}-${p.permission}`}
                                role="switch"
                                aria-checked={on}
                                aria-label={`${p.label} para ${r.label}`}
                                disabled={!isGestao || saving === key}
                                onClick={() => toggle(p, r.id)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${on ? 'bg-primary' : 'bg-outline-variant'}`}
                              >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-on-surface-variant">
          O que você liberar aqui aparece no Portal do Administrativo, no menu "Gestão" (no próximo acesso ou ao recarregar a página). As telas que já existiam antes (alunos, matrículas, presença) seguem as regras fixas de cada perfil.
        </p>
      </div>
    </PageShell>
  );
}
