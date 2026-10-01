import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScanFace, Play, Square } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { preloadFaceModels, faceapi } from '../lib/faceModels';
import { getAuthorizedPersonPhotoSignedUrls } from '../lib/storage';
import {
  medirRostoNaImagem, situacaoDaFoto, resumoDaQualidade, PROBLEMAS_DA_FOTO, ROTULO_DESCRITOR_HUMAN,
} from '../lib/qualidadeFoto';
import { PageShell, Loading, EmptyState, Notice, StatCard, ResponsiveTable, PrimaryButton, SecondaryButton } from './GestaoShared';

// Cadastros · Qualidade da biometria (01/10/2026). Mede as fotos de rosto já
// guardadas da escola (resolução, tamanho do rosto, brilho e nitidez) aqui
// no navegador da escola e grava SÓ os números em
// authorized_persons.foto_qualidade. Nenhuma foto sai da escola; o suporte
// Zela vê apenas os números. Nada é apagado nem refeito sozinho: a lista
// mostra quem se beneficia de cadastrar o rosto de novo.

function carregarImagem(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // para poder medir os pixels da foto
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível abrir a foto.'));
    img.src = url;
  });
}

const ROTULO_SITUACAO = { ok: 'Boa', refazer: 'Refazer', sem_analise: 'Sem análise' };
const ESTILO_SITUACAO = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  refazer: 'bg-amber-50 text-amber-800 border-amber-300',
  sem_analise: 'bg-surface-container-low text-on-surface-variant border-outline-variant',
};
const ORDEM_SITUACAO = { refazer: 0, sem_analise: 1, ok: 2 };

export default function GestaoQualidadeBiometria({ currentUser }) {
  const [pessoas, setPessoas] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [progresso, setProgresso] = useState(null); // { feitos, total }
  const interromperRef = useRef(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('authorized_persons')
      .select('id, name, relation, photo_storage_path, foto_qualidade, face_descriptor_v2_status')
      .eq('school_id', currentUser.school_id)
      .not('face_descriptor', 'is', null)
      .order('name');
    if (error) { setErro(error.message); setPessoas([]); return; }
    setPessoas(data || []);
  }, [currentUser.school_id]);
  useEffect(() => { carregar(); }, [carregar]);

  const resumo = useMemo(() => resumoDaQualidade(pessoas || []), [pessoas]);
  const linhas = useMemo(() => (pessoas || [])
    .map(p => ({ ...p, ...situacaoDaFoto(p.foto_qualidade) }))
    .sort((a, b) => ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] || a.name.localeCompare(b.name)), [pessoas]);

  const analisar = async () => {
    setErro('');
    setAviso('');
    interromperRef.current = false;
    const comFoto = (pessoas || []).filter(p => p.photo_storage_path);
    if (comFoto.length === 0) { setAviso('Nenhuma foto guardada para analisar.'); return; }
    setProgresso({ feitos: 0, total: comFoto.length });
    let analisadas = 0;
    let falhas = 0;
    try {
      await preloadFaceModels();
      const links = await getAuthorizedPersonPhotoSignedUrls(comFoto.map(p => p.photo_storage_path), 900);
      for (const pessoa of comFoto) {
        if (interromperRef.current) break;
        try {
          const link = links.get(pessoa.photo_storage_path);
          if (!link) throw new Error('sem link');
          const img = await carregarImagem(link);
          // Detector mais preciso (SSD) para foto parada.
          const deteccao = await faceapi.detectSingleFace(img);
          const qualidade = medirRostoNaImagem(img, deteccao?.box, 'analise');
          const { error } = await supabase.from('authorized_persons').update({ foto_qualidade: qualidade }).eq('id', pessoa.id);
          if (error) throw error;
          setPessoas(prev => prev.map(p => (p.id === pessoa.id ? { ...p, foto_qualidade: qualidade } : p)));
          analisadas += 1;
        } catch {
          falhas += 1;
        }
        setProgresso(prev => (prev ? { ...prev, feitos: prev.feitos + 1 } : prev));
      }
      const interrompida = interromperRef.current;
      setAviso(`${interrompida ? 'Análise interrompida. ' : ''}${analisadas} ${analisadas === 1 ? 'foto analisada' : 'fotos analisadas'}${falhas ? ` · ${falhas} não ${falhas === 1 ? 'pôde' : 'puderam'} ser aberta${falhas === 1 ? '' : 's'}` : ''}.`);
    } catch (e) {
      setErro(e.message || 'Não foi possível analisar as fotos agora.');
    } finally {
      setProgresso(null);
    }
  };

  const colunas = [
    { label: 'Pessoa', primary: true, render: p => (
      <div className="min-w-0">
        <p className="font-semibold text-on-surface truncate">{p.name}</p>
        {p.relation && <p className="text-xs text-on-surface-variant">{p.relation}</p>}
      </div>
    ) },
    { label: 'Situação', render: p => (
      <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border ${ESTILO_SITUACAO[p.situacao]}`}>{ROTULO_SITUACAO[p.situacao]}</span>
    ) },
    { label: 'Motivo', render: p => (p.codigos.length ? p.codigos.map(c => PROBLEMAS_DA_FOTO[c]).join(' · ') : (p.photo_storage_path ? '·' : 'Sem foto guardada')) },
    { label: 'Foto', hideOnMobile: true, className: 'whitespace-nowrap tabular-nums', render: p => (p.foto_qualidade?.largura_px ? `${p.foto_qualidade.largura_px}×${p.foto_qualidade.altura_px}` : '·') },
    { label: 'Rosto (px)', hideOnMobile: true, align: 'right', className: 'tabular-nums', render: p => (p.foto_qualidade && !p.foto_qualidade.sem_rosto ? p.foto_qualidade.rosto_px : '·') },
    { label: 'Brilho', hideOnMobile: true, align: 'right', className: 'tabular-nums', render: p => p.foto_qualidade?.brilho ?? '·' },
    { label: 'Nitidez', hideOnMobile: true, align: 'right', className: 'tabular-nums', render: p => p.foto_qualidade?.nitidez ?? '·' },
    { label: 'Descritor novo', hideOnMobile: true, render: p => ROTULO_DESCRITOR_HUMAN[p.face_descriptor_v2_status || 'PENDING'] || p.face_descriptor_v2_status },
  ];

  return (
    <PageShell
      description="Mede as fotos de rosto já cadastradas e mostra quem se beneficia de cadastrar o rosto de novo. Só números são guardados; nenhuma foto sai da escola."
      actions={progresso ? (
        <SecondaryButton onClick={() => { interromperRef.current = true; }}><Square size={15} /> Interromper</SecondaryButton>
      ) : (
        <PrimaryButton onClick={analisar} disabled={!pessoas || pessoas.length === 0}><Play size={15} /> {resumo.total - resumo.sem_analise > 0 ? 'Analisar de novo' : 'Analisar fotos'}</PrimaryButton>
      )}
    >
      <div className="space-y-4">
      <Notice>{erro}</Notice>
      {aviso && <Notice type="success">{aviso}</Notice>}
      {progresso && (
        <div className="p-3 rounded-zela-md border border-outline-variant bg-surface-container-low text-sm text-on-surface">
          Analisando {Math.min(progresso.feitos + 1, progresso.total)} de {progresso.total}… Pode continuar usando o sistema em outra aba.
          <div className="mt-2 h-1.5 rounded-full bg-outline-variant/40 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((progresso.feitos / progresso.total) * 100)}%` }} />
          </div>
        </div>
      )}
      {pessoas === null ? <Loading /> : pessoas.length === 0 ? (
        <EmptyState icon={ScanFace} text="Nenhuma biometria cadastrada nesta escola." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Com biometria" value={resumo.total} />
            <StatCard label="Fotos boas" value={resumo.ok} tone="good" />
            <StatCard label="Convém refazer" value={resumo.refazer} tone={resumo.refazer ? 'warn' : 'default'} />
            <StatCard label="Sem análise" value={resumo.sem_analise} />
          </div>
          <p className="text-xs text-on-surface-variant">
            Para refazer, cadastre o rosto da pessoa de novo (Recepção ou portal da família). O cadastro novo já usa a melhor resolução da câmera e confere a qualidade antes de salvar.
          </p>
          <ResponsiveTable columns={colunas} rows={linhas} />
        </>
      )}
      </div>
    </PageShell>
  );
}
