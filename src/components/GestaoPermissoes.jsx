import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading, Notice } from './GestaoShared';

// Só o Administrativo por enquanto: o portal das professoras não tem estes
// módulos (a tabela no banco já aceita 'teacher' pra quando tiver).
const ROLES = [
  { id: 'admin', label: 'Administrativo' },
];

// Permissões, Perfis e Permissões. A Gestão tem tudo sempre (não dá pra se
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
    <PageShell description="O que cada perfil da equipe pode fazer nos módulos de gestão. A Gestão sempre tem acesso a tudo." infoOnMobile>
      <div className="space-y-4">
        <Notice>{error}</Notice>
        {!isGestao && <Notice>Somente a Gestão altera permissões.</Notice>}
        {catalog === null ? <Loading /> : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container font-semibold"><Lock size={12} /> A Gestão sempre tem acesso a tudo</span>
              {ROLES.length === 1 && <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold">Ligue ou desligue para o {ROLES[0].label}</span>}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {areas.map(([area, perms]) => {
                const liberadas = ROLES.length === 1 ? perms.filter(p => effective(p, ROLES[0].id)).length : null;
                return (
                  <section key={area} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-surface-container-low border-b border-outline-variant">
                      <h3 className="text-sm font-bold text-primary">{area}</h3>
                      {liberadas !== null && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${liberadas ? 'bg-success/10 text-success' : 'bg-surface-container text-on-surface-variant'}`}>{liberadas} de {perms.length} liberada{perms.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <ul className="divide-y divide-outline-variant/50">
                      {perms.map(p => (
                        <li key={p.permission} className="flex items-center justify-between gap-3 px-4 py-3">
                          <span className="text-sm text-on-surface min-w-0">{p.label}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            {ROLES.map(r => {
                              const key = `${r.id}:${p.permission}`;
                              const on = effective(p, r.id);
                              return (
                                <div key={r.id} className="flex items-center gap-2">
                                  {ROLES.length > 1 && <span className="text-[11px] text-on-surface-variant">{r.label}</span>}
                                  <button
                                    id={`perm-${r.id}-${p.permission}`}
                                    role="switch"
                                    aria-checked={on}
                                    aria-label={`${p.label} para ${r.label}`}
                                    disabled={!isGestao || saving === key}
                                    onClick={() => toggle(p, r.id)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${on ? 'bg-primary' : 'bg-outline-variant'}`}
                                  >
                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-surface-container-lowest shadow transition ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </>
        )}
        <p className="text-xs text-on-surface-variant">
          O que você liberar aqui aparece no Portal do Administrativo, no menu "Gestão" (no próximo acesso ou ao recarregar a página). As telas que já existiam antes (alunos, matrículas, presença) seguem as regras fixas de cada perfil.
        </p>
      </div>
    </PageShell>
  );
}
