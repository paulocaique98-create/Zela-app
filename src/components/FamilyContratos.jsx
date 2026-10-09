import React, { useCallback, useEffect, useState } from 'react';
import { FileSignature, Printer, ShieldCheck, Loader2, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sha256Hex } from '../lib/gestaoUtils';
import { printContract } from '../lib/printContract';

// Contratos e aditivos enviados pela escola: a família lê e assina pelo app
// (assinatura eletrônica simples: nome digitado + confirmação, com registro
// da data, IP e da impressão digital do texto que foi lido).
export default function FamilyContratos({ currentUser, currentSchool, onVoltar }) {
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('contract_documents')
      .select('*, students:student_id(name)')
      .in('status', ['enviado', 'assinado'])
      .order('sent_at', { ascending: false });
    if (e) { setError('Não foi possível carregar os contratos.'); setDocs([]); return; }
    setDocs(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (open) {
    return <ContratoDetalhe doc={open} currentUser={currentUser} currentSchool={currentSchool} onBack={() => { setOpen(null); load(); }} />;
  }

  const pending = (docs || []).filter(d => d.status === 'enviado');
  const signed = (docs || []).filter(d => d.status === 'assinado');

  return (
    <div className="h-full overflow-y-auto bg-surface p-4 md:p-6 space-y-5">
      {onVoltar && (
        <button onClick={onVoltar} className="flex items-center gap-1 text-sm font-bold text-primary"><ChevronLeft size={16} /> Configurações</button>
      )}
      {error && <div className="p-3 bg-error/10 border border-error/30 rounded-zela-md text-sm text-error">{error}</div>}
      {docs === null ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-on-surface-variant" /></div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 bg-surface-container-lowest rounded-zela-xl border border-dashed border-outline-variant">
          <FileSignature size={30} className="text-outline-variant mb-2" />
          <p className="text-sm font-semibold text-on-surface-variant">Nenhum contrato por aqui ainda.</p>
          <p className="text-xs text-on-surface-variant/70 mt-1">Quando a escola enviar um contrato para você assinar, ele aparece nesta tela.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-warning mb-2">Para assinar</h3>
              <div className="space-y-2">{pending.map(d => <DocCard key={d.id} doc={d} onOpen={() => setOpen(d)} />)}</div>
            </section>
          )}
          {signed.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-on-surface-variant mb-2">Assinados</h3>
              <div className="space-y-2">{signed.map(d => <DocCard key={d.id} doc={d} onOpen={() => setOpen(d)} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DocCard({ doc, onOpen }) {
  const pending = doc.status === 'enviado';
  return (
    <button onClick={onOpen} className={`w-full text-left p-4 rounded-zela-lg border bg-surface-container-lowest hover:shadow-sm transition ${pending ? 'border-outline-variant' : 'border-outline-variant'}`}>
      <p className="font-bold text-sm text-on-surface">{doc.title}</p>
      <p className="text-xs text-on-surface-variant mt-0.5">
        {doc.students?.name} · {pending ? 'Aguardando sua assinatura' : `Assinado em ${new Date(doc.signed_at).toLocaleDateString('pt-BR')}`}
      </p>
    </button>
  );
}

function ContratoDetalhe({ doc, currentUser, currentSchool, onBack }) {
  const [name, setName] = useState(currentUser.name || '');
  const [agree, setAgree] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState('');
  const [signedDoc, setSignedDoc] = useState(doc.status === 'assinado' ? doc : null);

  const sign = async () => {
    setError('');
    if (!name.trim()) { setError('Digite seu nome completo.'); return; }
    setIsSigning(true);
    try {
      // A impressão digital é do texto que está na tela: se a escola tivesse
      // mudado algo depois do envio, o servidor recusa a assinatura.
      const hash = await sha256Hex(doc.body);
      const { error: e } = await supabase.rpc('sign_contract_document', { p_document_id: doc.id, p_signer_name: name.trim(), p_content_hash: hash });
      if (e) throw e;
      const { data } = await supabase.from('contract_documents').select('*, students:student_id(name)').eq('id', doc.id).single();
      setSignedDoc(data || { ...doc, status: 'assinado', signer_name: name.trim(), signed_at: new Date().toISOString() });
    } catch (err) {
      setError(err.message || 'Não foi possível assinar.');
    } finally {
      setIsSigning(false);
    }
  };

  const current = signedDoc || doc;
  return (
    <div className="h-full overflow-y-auto bg-surface p-4 md:p-6 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-primary"><ChevronLeft size={16} /> Voltar</button>
      <div>
        <h2 className="text-lg font-bold text-on-surface">{current.title}</h2>
        <p className="text-xs text-on-surface-variant">{current.students?.name}</p>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">{current.body}</div>

      {current.status === 'assinado' ? (
        <div className="p-4 bg-success/10 border border-success/30 rounded-zela-lg text-sm text-success space-y-1">
          <p className="font-bold flex items-center gap-1.5"><ShieldCheck size={16} /> Contrato assinado</p>
          <p>Assinado por {current.signer_name} em {new Date(current.signed_at).toLocaleString('pt-BR')}.</p>
          <button onClick={() => printContract(current, currentSchool?.name)} className="mt-2 flex items-center gap-1.5 px-3 py-2 bg-white border border-success/30 rounded-zela-md text-xs font-bold"><Printer size={14} /> Imprimir ou salvar em PDF</button>
        </div>
      ) : (
        <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-zela-lg space-y-3">
          <p className="text-sm font-bold text-on-surface">Assinar eletronicamente</p>
          <label htmlFor="sign-name" className="block text-xs font-bold text-on-surface-variant">Seu nome completo
            <input id="sign-name" value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white border border-outline-variant rounded-zela-md text-sm" />
          </label>
          <label htmlFor="sign-agree" className="flex items-start gap-2 text-xs text-on-surface">
            <input id="sign-agree" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5" />
            Li todo o documento acima e concordo com os termos. Entendo que esta assinatura eletrônica tem validade legal (Lei 14.063/2020) e que ficam registrados a data, o horário e o endereço de acesso.
          </label>
          {error && <div className="p-2 bg-error/10 border border-error/30 rounded-zela-md text-sm text-error">{error}</div>}
          <button onClick={sign} disabled={!agree || isSigning} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white font-bold rounded-zela-md text-sm disabled:opacity-50">
            {isSigning ? <Loader2 size={16} className="animate-spin" /> : <FileSignature size={16} />} Assinar contrato
          </button>
        </div>
      )}
    </div>
  );
}
