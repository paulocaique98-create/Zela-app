import React, { useEffect, useState, useCallback } from 'react';
import { Fingerprint, Loader2, ShieldAlert, RefreshCw, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAuthorizedPersonPhotoSignedUrls } from '../lib/storage';
import { FACE_DUPLICATE_THRESHOLD, euclideanDistance, parseDescriptor } from '../lib/faceMatch';

// Varredura de duplicidade facial entre CONTAS diferentes — complementa a
// checagem que já existe em togglePhoto() (App.jsx), que só bloqueia no
// MOMENTO de uma biometria nova ser cadastrada. Duas situações escapam
// daquele bloqueio e só aparecem aqui:
//   1. As duas biometrias já existiam ANTES da checagem existir (dado
//      histórico) — foi o caso real da Hanaynna Schmitz.
//   2. Uma mesma pessoa se cadastra duas vezes com contas de login
//      diferentes (ex: erro de digitação no e-mail na 2ª vez) e cadastra a
//      biometria em cada uma — foi o caso real da Maria Elisa de Freitas
//      Falcão, achado nesta mesma sessão.
// Aqui é só DETECÇÃO — decidir o que fazer (mesclar contas, remover uma
// biometria) continua manual, no mesmo espírito de "diagnóstico antes de
// aplicar" já usado nas outras correções desta sessão.
export default function AdminDuplicateBiometrics({ currentUser }) {
  const [pairs, setPairs] = useState(null); // null = ainda não escaneou
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');

  const scan = useCallback(async () => {
    if (!currentUser?.school_id) return;
    setIsScanning(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('authorized_persons')
        .select('id, name, relation, family_id, face_descriptor, photo_storage_path')
        .eq('school_id', currentUser.school_id)
        .not('face_descriptor', 'is', null);
      if (fetchError) throw fetchError;

      const people = (data || [])
        .map(p => ({ ...p, descriptor: parseDescriptor(p.face_descriptor) }))
        .filter(p => Array.isArray(p.descriptor));

      // Fotos das pessoas envolvidas em algum par encontrado — resolvidas só
      // depois de saber quem entrou em algum par, pra não gastar signed URL
      // de gente que não tem nenhuma duplicidade.
      const found = [];
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          const a = people[i], b = people[j];
          if (a.family_id === b.family_id) continue; // mesma conta, mesma pessoa — não é duplicidade de conta
          const distance = euclideanDistance(a.descriptor, b.descriptor);
          if (distance < FACE_DUPLICATE_THRESHOLD) {
            found.push({ a, b, distance });
          }
        }
      }

      const paths = found.flatMap(f => [f.a.photo_storage_path, f.b.photo_storage_path]).filter(Boolean);
      const signedUrlByPath = paths.length > 0
        ? await getAuthorizedPersonPhotoSignedUrls(paths).catch(() => new Map())
        : new Map();

      setPairs(found.map(f => ({
        ...f,
        aPhoto: f.a.photo_storage_path ? signedUrlByPath.get(f.a.photo_storage_path) : null,
        bPhoto: f.b.photo_storage_path ? signedUrlByPath.get(f.b.photo_storage_path) : null,
      })));
    } catch (err) {
      console.error('Erro ao varrer duplicidade de biometria:', err);
      setError('Não foi possível concluir a varredura. Tente novamente.');
    } finally {
      setIsScanning(false);
    }
  }, [currentUser?.school_id]);

  useEffect(() => { scan(); }, [scan]);

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-3 mb-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
            <Fingerprint size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-h3 text-on-surface">Verificação de Duplicidade Facial</h2>
            <p className="text-small text-on-surface-variant">Mesmo rosto cadastrado em contas diferentes da escola</p>
          </div>
        </div>
        <button
          onClick={scan}
          disabled={isScanning}
          className="flex items-center gap-2 text-sm font-bold text-primary bg-primary/10 hover:bg-primary/20 px-4 py-2.5 rounded-zela-md transition disabled:opacity-60 shrink-0"
        >
          <RefreshCw size={15} className={isScanning ? 'animate-spin' : ''} /> {isScanning ? 'Verificando...' : 'Verificar de novo'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium shrink-0">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isScanning && pairs === null ? (
          <div className="flex items-center justify-center py-16 text-on-surface-variant/70">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : pairs && pairs.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-zela-lg border border-dashed border-outline-variant">
            <Fingerprint className="mx-auto h-10 w-10 text-green-400 mb-3" />
            <p className="text-on-surface-variant font-medium">Nenhuma duplicidade encontrada — cada biometria cadastrada corresponde a uma pessoa diferente.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(pairs || []).map((pair, i) => (
              <div key={i} className="p-4 bg-white border-2 border-amber-200 rounded-zela-lg space-y-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 uppercase tracking-wide">
                  <ShieldAlert size={13} /> Possível mesma pessoa em 2 contas
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-surface-container overflow-hidden shrink-0 border border-outline-variant">
                      {pair.aPhoto ? <img src={pair.aPhoto} alt={pair.a.name} className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-on-surface truncate">{pair.a.name}</p>
                      <p className="text-[11px] text-on-surface-variant/70 truncate">{pair.a.relation}</p>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-on-surface-variant/50 shrink-0" />
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-surface-container overflow-hidden shrink-0 border border-outline-variant">
                      {pair.bPhoto ? <img src={pair.bPhoto} alt={pair.b.name} className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-on-surface truncate">{pair.b.name}</p>
                      <p className="text-[11px] text-on-surface-variant/70 truncate">{pair.b.relation}</p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-on-surface-variant/70">
                  Se for a mesma pessoa (ex: conta duplicada por erro de e-mail), revise em Gestão de Usuários e remova a biometria/conta que sobrar.
                  Se forem parecidos mas realmente pessoas diferentes, pode ignorar — isso não bloqueia nada, é só um alerta.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
