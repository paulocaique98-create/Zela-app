import React, { useEffect, useMemo, useState } from 'react';
import { Camera, UserX, Search, Trash2, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAuthorizedPersonPhotoSignedUrls } from '../lib/storage';
import ConfirmModal from './ConfirmModal';
import FaceCameraCapture from './FaceCameraCapture';

// Cadastro de foto facial pelo Admin — auxilia responsáveis que esqueceram
// de cadastrar a própria biometria pelo Portal da Família. Lista só quem
// AINDA NÃO tem foto, com busca por nome do responsável ou do filho, e
// captura a foto AO VIVO pela câmera (nunca por upload de arquivo do
// dispositivo — evita fotos antigas/de terceiros sendo usadas na biometria).
export default function AdminFaceEnrollment({ authorized: authorizedProp, togglePhoto, students, currentUser, onClose }) {
  const [tab, setTab] = useState('pending'); // 'pending' | 'enrolled'
  const [search, setSearch] = useState('');
  const [studentsByPersonId, setStudentsByPersonId] = useState({});
  const [cameraFor, setCameraFor] = useState(null); // pessoa sendo fotografada agora
  const [removeTarget, setRemoveTarget] = useState(null); // pessoa com remoção de foto pendente de confirmação
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState('');

  // Busca a lista direto do banco toda vez que a tela abre — não confia só
  // no estado global `authorized` do App.jsx (alimentado no login e por
  // Realtime). Isso cobre qualquer situação em que aquele estado ainda não
  // refletiu uma remoção/cadastro recente (sessão aberta antes de uma
  // mudança, atraso de propagação, etc) — igual ao AdminFaceScanner, que já
  // faz sua própria busca a cada abertura em vez de reaproveitar cache.
  const [authorized, setAuthorized] = useState(authorizedProp || []);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (!currentUser?.school_id) return;
      const { data, error: fetchError } = await supabase
        .from('authorized_persons')
        .select('id, name, relation, has_photo, photo_storage_path, face_descriptor, status, emergency_order, temporary_until, family_id')
        .eq('school_id', currentUser.school_id);
      if (fetchError || cancelled) return;

      const pathsToResolve = (data || []).map(a => a.photo_storage_path).filter(Boolean);
      const signedUrlByPath = pathsToResolve.length > 0
        ? await getAuthorizedPersonPhotoSignedUrls(pathsToResolve).catch(() => new Map())
        : new Map();
      if (cancelled) return;

      setAuthorized((data || []).map(a => ({
        id: a.id,
        name: a.name,
        relation: a.relation,
        hasPhoto: a.has_photo,
        photo_url: a.photo_storage_path ? (signedUrlByPath.get(a.photo_storage_path) || null) : null,
        photo_storage_path: a.photo_storage_path,
        has_biometrics: a.face_descriptor != null,
        status: a.status,
        emergencyOrder: a.emergency_order,
        temporaryUntil: a.temporary_until,
        family_id: a.family_id,
      })));
    };
    refresh();
    return () => { cancelled = true; };
  }, [currentUser?.school_id]);

  // Depois da busca inicial, continua acompanhando o estado global (que o
  // Realtime do App.jsx mantém atualizado) — cobre remoções/cadastros feitos
  // com esta tela já aberta, sem precisar reabrir.
  useEffect(() => {
    setAuthorized(authorizedProp || []);
  }, [authorizedProp]);

  const pending = useMemo(
    () => (authorized || []).filter(p => !p.photo_url && !p.hasPhoto && !p.has_biometrics),
    [authorized]
  );

  // Quem já tem foto/biometria cadastrada — aba onde a escola pode remover
  // uma foto pra liberar o responsável a cadastrar uma nova.
  const enrolled = useMemo(
    () => (authorized || []).filter(p => p.photo_url || p.hasPhoto || p.has_biometrics),
    [authorized]
  );

  const activeList = tab === 'pending' ? pending : enrolled;

  // Monta um índice pessoa -> nomes dos filhos, pra permitir buscar tanto pelo
  // nome do responsável quanto pelo nome da criança (usado nas duas abas).
  useEffect(() => {
    let cancelled = false;
    const buildIndex = async () => {
      const all = authorized || [];
      const familyIds = [...new Set(all.map(p => p.family_id).filter(Boolean))];
      if (familyIds.length === 0) return;

      const byFamilyId = new Map();
      (students || []).forEach(s => {
        const fid = s.family_id || s.familyId;
        if (!fid) return;
        if (!byFamilyId.has(fid)) byFamilyId.set(fid, []);
        byFamilyId.get(fid).push(s.name);
      });

      let guardianLinks = [];
      if (currentUser?.school_id) {
        const { data } = await supabase
          .from('student_guardians')
          .select('guardian_id, student_id')
          .in('guardian_id', familyIds);
        guardianLinks = data || [];
      }
      const studentsById = new Map((students || []).map(s => [s.id, s.name]));

      if (cancelled) return;
      const index = {};
      all.forEach(p => {
        const names = new Set(byFamilyId.get(p.family_id) || []);
        guardianLinks.filter(l => l.guardian_id === p.family_id).forEach(l => {
          const name = studentsById.get(l.student_id);
          if (name) names.add(name);
        });
        index[p.id] = [...names];
      });
      setStudentsByPersonId(index);
    };
    buildIndex();
    return () => { cancelled = true; };
  }, [authorized, students, currentUser?.school_id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return activeList;
    return activeList.filter(p => {
      if (p.name?.toLowerCase().includes(term)) return true;
      return (studentsByPersonId[p.id] || []).some(name => name.toLowerCase().includes(term));
    });
  }, [activeList, search, studentsByPersonId]);

  // Remove a foto/biometria da pessoa — ela volta a aparecer em "Pendentes"
  // e o responsável (ou a escola) pode cadastrar uma foto nova no lugar.
  const confirmRemovePhoto = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await togglePhoto(removeTarget.id, null, null);
      setRemoveTarget(null);
    } catch (err) {
      console.error(err);
      setError('Erro ao remover a foto. Tente novamente.');
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={cameraFor ? undefined : onClose}>
      <div
        className="bg-white rounded-zela-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {cameraFor ? (
          <FaceCameraCapture
            personName={cameraFor.name}
            consentMessage={`Ao continuar, você confirma que ${cameraFor.name} (ou seu responsável) autoriza o uso desta foto e dos dados biométricos faciais exclusivamente para identificação no sistema de reconhecimento facial da escola (check-in/check-out), conforme a Lei Geral de Proteção de Dados (LGPD).`}
            onSave={(imageDataUrl, descriptorArray) => togglePhoto(cameraFor.id, imageDataUrl, descriptorArray, true)}
            onDone={() => setCameraFor(null)}
            onCancel={() => setCameraFor(null)}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 p-5 border-b border-outline-variant shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
                  <Camera size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-h3 text-on-surface">Biometria de Responsáveis</h2>
                  <p className="text-xs text-on-surface-variant">Cadastre novas fotos ou remova uma já cadastrada</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-zela-md transition shrink-0">
                <X size={20} />
              </button>
            </div>

            {/* Abas: Pendentes (cadastrar) / Já Cadastrados (remover) */}
            <div className="px-5 pt-4 shrink-0">
              <div className="flex gap-1 p-1 bg-surface-container-low rounded-xl">
                <button
                  onClick={() => { setTab('pending'); setSearch(''); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition ${
                    tab === 'pending' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Camera size={14} /> Pendentes ({pending.length})
                </button>
                <button
                  onClick={() => { setTab('enrolled'); setSearch(''); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition ${
                    tab === 'enrolled' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <ShieldCheck size={14} /> Já Cadastrados ({enrolled.length})
                </button>
              </div>
            </div>

            {activeList.length > 0 && (
              <div className="px-5 pt-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por responsável ou criança"
                    className="w-full pl-9 pr-3 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium">{error}</div>
              )}

              {activeList.length === 0 ? (
                <div className="text-center py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
                  <UserX className="mx-auto h-10 w-10 text-outline-variant mb-3" />
                  <p className="text-on-surface-variant font-medium">
                    {tab === 'pending' ? 'Todos os responsáveis já têm foto cadastrada' : 'Nenhum responsável com foto cadastrada ainda'}
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
                  <Search className="mx-auto h-10 w-10 text-outline-variant mb-3" />
                  <p className="text-on-surface-variant font-medium">Nenhum resultado para "{search}"</p>
                </div>
              ) : (
                filtered.map(person => (
                  <div key={person.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border border-outline-variant rounded-zela-lg bg-surface-container-low gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 bg-slate-200 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm overflow-hidden">
                        {tab === 'enrolled' && person.photo_url ? (
                          <img src={person.photo_url} alt={person.name} className="w-full h-full object-cover" />
                        ) : (
                          <Camera size={16} className="text-on-surface-variant/70" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-on-surface break-words">{person.name}</p>
                        <p className="text-xs text-on-surface-variant/70 break-words">
                          {person.relation}{(studentsByPersonId[person.id]?.length > 0) ? ` · ${studentsByPersonId[person.id].join(', ')}` : ''}
                        </p>
                      </div>
                    </div>
                    {tab === 'pending' ? (
                      <button
                        onClick={() => { setError(''); setCameraFor(person); }}
                        className="w-full sm:w-auto text-xs font-bold flex items-center justify-center gap-1.5 bg-white border border-outline-variant px-3 py-2 rounded-lg shadow-sm shrink-0 text-primary hover:bg-primary/10 hover:border-primary/20 transition"
                      >
                        <Camera size={14} /> Cadastrar
                      </button>
                    ) : (
                      <button
                        onClick={() => { setError(''); setRemoveTarget(person); }}
                        className="w-full sm:w-auto text-xs font-bold flex items-center justify-center gap-1.5 bg-white border border-red-200 px-3 py-2 rounded-lg shadow-sm shrink-0 text-red-600 hover:bg-red-50 transition"
                      >
                        <Trash2 size={14} /> Remover Foto
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {removeTarget && (
        <ConfirmModal
          title="Remover foto cadastrada?"
          message={`A foto e a biometria de ${removeTarget.name} serão apagadas. ${removeTarget.name} deixará de ser reconhecido(a) no check-in/check-out até que uma nova foto seja cadastrada.`}
          confirmLabel="Remover Foto"
          danger
          isLoading={isRemoving}
          onConfirm={confirmRemovePhoto}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
