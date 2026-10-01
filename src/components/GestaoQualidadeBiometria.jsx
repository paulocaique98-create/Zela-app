import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScanFace, Play, Square, Search, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { preloadFaceModels, faceapi } from '../lib/faceModels';
import { getAuthorizedPersonPhotoSignedUrls } from '../lib/storage';
import {
  medirRostoNaImagem, situacaoDaPessoa, resumoDaQualidade, gruposParaAnalise, resultadoDaAnalise,
  PROBLEMAS_DA_FOTO, ROTULO_DESCRITOR_HUMAN,
} from '../lib/qualidadeFoto';
import { PageShell, Loading, EmptyState, Notice, StatCard, ResponsiveTable, PrimaryButton, SecondaryButton, inputCls } from './GestaoShared';

// Cadastros · Qualidade da biometria (01/10/2026). Mede as fotos de rosto já
// guardadas da escola (resolução, tamanho do rosto, brilho e nitidez) aqui
// no navegador da escola e grava SÓ os números em
// authorized_persons.foto_qualidade. Nenhuma foto sai da escola; o suporte
// Zela vê apenas os números. Nada é apagado nem refeito sozinho: a lista
// mostra quem se beneficia de cadastrar o rosto de novo.
// A análise pode ser de um grupo (Convém refazer, Sem análise, Todas) ou de
// uma pessoa só, pelo botão da linha, sem medir de novo a escola inteira.
// A lista traz todas as pessoas autorizadas da escola e se atualiza sozinha:
// pessoa nova ou com a biometria retirada aparece como "Sem análise" até
// cadastrar o rosto (o cadastro novo já entra com a medição).

function carregarImagem(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // para poder medir os pixels da foto
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível abrir a foto.'));
    img.src = url;
  });
}

// Mede a foto guardada (pelo link assinado) e devolve só os números.
async function medirFotoGuardada(link) {
  const img = await carregarImagem(link);
  // Detector mais preciso (SSD) para foto parada.
  const deteccao = await faceapi.detectSingleFace(img);
  return medirRostoNaImagem(img, deteccao?.box, 'analise');
}

const ROTULO_SITUACAO = { ok: 'Boa', refazer: 'Refazer', sem_analise: 'Sem análise' };
const ESTILO_SITUACAO = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  refazer: 'bg-amber-50 text-amber-800 border-amber-300',
  sem_analise: 'bg-surface-container-low text-on-surface-variant border-outline-variant',
};
const ORDEM_SITUACAO = { refazer: 0, sem_analise: 1, ok: 2 };
// A tabela de pessoas não está no tempo real do banco (o descritor facial
// iria inteiro a cada mudança), então a lista é relida de tempos em tempos.
const ATUALIZAR_A_CADA_MS = 15 * 1000;

export default function GestaoQualidadeBiometria({ currentUser }) {
  const [pessoas, setPessoas] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [progresso, setProgresso] = useState(null); // { feitos, total, rotulo } (análise de um grupo)
  const [analisandoId, setAnalisandoId] = useState(null); // análise de uma pessoa só
  const interromperRef = useRef(false);
  const ocupado = Boolean(progresso || analisandoId);
  const ocupadoRef = useRef(false);
  const geracaoRef = useRef(0); // muda a cada análise: leitura antiga não sobrescreve resultado novo
  useEffect(() => { ocupadoRef.current = ocupado; }, [ocupado]);

  // Todas as pessoas autorizadas da escola (menos as recusadas sem
  // biometria) e quais têm biometria. O descritor em si não é baixado: só
  // os ids de quem tem.
  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    const geracao = geracaoRef.current;
    const [todas, comBiometria] = await Promise.all([
      supabase.from('authorized_persons')
        .select('id, name, relation, status, photo_storage_path, foto_qualidade, face_descriptor_v2_status')
        .eq('school_id', currentUser.school_id)
        .order('name'),
      supabase.from('authorized_persons')
        .select('id')
        .eq('school_id', currentUser.school_id)
        .not('face_descriptor', 'is', null),
    ]);
    if (silencioso && (geracao !== geracaoRef.current || ocupadoRef.current)) return;
    const error = todas.error || comBiometria.error;
    if (error) {
      if (!silencioso) { setErro(error.message); setPessoas([]); }
      return;
    }
    const ids = new Set((comBiometria.data || []).map(p => p.id));
    setPessoas((todas.data || [])
      .map(p => ({ ...p, tem_biometria: ids.has(p.id) }))
      .filter(p => p.tem_biometria || p.status !== 'rejected'));
  }, [currentUser.school_id]);
  useEffect(() => { carregar(); }, [carregar]);

  // Atualiza sozinha: pessoa nova, biometria cadastrada ou retirada em outro
  // lugar aparece aqui sem recarregar a tela. Pausa durante uma análise.
  useEffect(() => {
    const atualizar = () => {
      if (ocupadoRef.current || document.visibilityState !== 'visible') return;
      carregar({ silencioso: true });
    };
    const timer = setInterval(atualizar, ATUALIZAR_A_CADA_MS);
    window.addEventListener('focus', atualizar);
    document.addEventListener('visibilitychange', atualizar);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', atualizar);
      document.removeEventListener('visibilitychange', atualizar);
    };
  }, [carregar]);

  const resumo = useMemo(() => resumoDaQualidade(pessoas || []), [pessoas]);
  const grupos = useMemo(() => gruposParaAnalise(pessoas || []), [pessoas]);
  const linhas = useMemo(() => (pessoas || [])
    .map(p => ({ ...p, ...situacaoDaPessoa(p) }))
    .sort((a, b) => ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] || a.name.localeCompare(b.name)), [pessoas]);
  const linhasVisiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return linhas;
    return linhas.filter(p => `${p.name} ${p.relation || ''}`.toLocaleLowerCase('pt-BR').includes(termo));
  }, [linhas, busca]);

  const gravarQualidade = async (pessoaId, qualidade, extras = {}) => {
    const { error } = await supabase.from('authorized_persons').update({ foto_qualidade: qualidade }).eq('id', pessoaId);
    if (error) throw error;
    setPessoas(prev => prev.map(p => (p.id === pessoaId ? { ...p, ...extras, foto_qualidade: qualidade } : p)));
  };

  // Analisa um grupo (Convém refazer, Sem análise ou Todas).
  const analisarGrupo = async (lista, rotulo) => {
    setErro('');
    setAviso('');
    interromperRef.current = false;
    geracaoRef.current += 1;
    if (lista.length === 0) { setAviso('Nenhuma foto guardada para analisar.'); return; }
    setProgresso({ feitos: 0, total: lista.length, rotulo });
    let analisadas = 0;
    let falhas = 0;
    try {
      await preloadFaceModels();
      const links = await getAuthorizedPersonPhotoSignedUrls(lista.map(p => p.photo_storage_path), 900);
      for (const pessoa of lista) {
        if (interromperRef.current) break;
        try {
          const link = links.get(pessoa.photo_storage_path);
          if (!link) throw new Error('sem link');
          await gravarQualidade(pessoa.id, await medirFotoGuardada(link));
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

  // Analisa a foto de uma pessoa só. Relê o cadastro antes: se a pessoa
  // refez a biometria depois que a tela abriu, mede a foto nova.
  const analisarPessoa = async (pessoa) => {
    setErro('');
    setAviso('');
    geracaoRef.current += 1;
    setAnalisandoId(pessoa.id);
    try {
      const { data: atual, error } = await supabase.from('authorized_persons')
        .select('photo_storage_path').eq('id', pessoa.id).single();
      if (error) throw error;
      if (!atual?.photo_storage_path) {
        setErro(`${pessoa.name} não tem foto guardada para analisar.`);
        return;
      }
      await preloadFaceModels();
      const links = await getAuthorizedPersonPhotoSignedUrls([atual.photo_storage_path], 900);
      const link = links.get(atual.photo_storage_path);
      if (!link) throw new Error('sem link');
      const qualidade = await medirFotoGuardada(link);
      await gravarQualidade(pessoa.id, qualidade, { photo_storage_path: atual.photo_storage_path });
      setAviso(resultadoDaAnalise(pessoa.name, qualidade));
    } catch {
      setErro(`Não foi possível analisar a foto de ${pessoa.name} agora. Tente de novo em instantes.`);
    } finally {
      setAnalisandoId(null);
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
    { label: 'Motivo', render: p => (
      !p.tem_biometria ? 'Sem biometria cadastrada'
        : p.codigos.length ? p.codigos.map(c => PROBLEMAS_DA_FOTO[c]).join(' · ')
          : (p.photo_storage_path ? '·' : 'Sem foto guardada')
    ) },
    { label: 'Foto', hideOnMobile: true, className: 'whitespace-nowrap tabular-nums', render: p => (p.foto_qualidade?.largura_px ? `${p.foto_qualidade.largura_px}×${p.foto_qualidade.altura_px}` : '·') },
    { label: 'Rosto (px)', hideOnMobile: true, align: 'right', className: 'tabular-nums', render: p => (p.foto_qualidade && !p.foto_qualidade.sem_rosto ? p.foto_qualidade.rosto_px : '·') },
    { label: 'Brilho', hideOnMobile: true, align: 'right', className: 'tabular-nums', render: p => p.foto_qualidade?.brilho ?? '·' },
    { label: 'Nitidez', hideOnMobile: true, align: 'right', className: 'tabular-nums', render: p => p.foto_qualidade?.nitidez ?? '·' },
    { label: 'Descritor novo', hideOnMobile: true, render: p => (!p.tem_biometria ? '·' : ROTULO_DESCRITOR_HUMAN[p.face_descriptor_v2_status || 'PENDING'] || p.face_descriptor_v2_status) },
    { label: '', actions: true, align: 'right', className: 'whitespace-nowrap', render: p => p.tem_biometria && p.photo_storage_path && (
      <button
        type="button"
        onClick={() => analisarPessoa(p)}
        disabled={ocupado}
        aria-label={`Analisar a foto de ${p.name}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-on-surface-variant border border-outline-variant rounded-zela-md hover:text-primary hover:bg-primary/10 transition disabled:opacity-50 disabled:pointer-events-none"
      >
        {analisandoId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        {analisandoId === p.id ? 'Analisando…' : 'Analisar'}
      </button>
    ) },
  ];

  return (
    <PageShell
      description="Mede as fotos de rosto já cadastradas e mostra quem se beneficia de cadastrar o rosto de novo. Só números são guardados; nenhuma foto sai da escola."
      actions={progresso ? (
        <SecondaryButton onClick={() => { interromperRef.current = true; }}><Square size={15} /> Interromper</SecondaryButton>
      ) : (
        <>
          <span className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/80">Analisar</span>
          <PrimaryButton onClick={() => analisarGrupo(grupos.refazer, 'Convém refazer')} disabled={ocupado || grupos.refazer.length === 0}><Play size={15} /> Convém refazer ({grupos.refazer.length})</PrimaryButton>
          <SecondaryButton onClick={() => analisarGrupo(grupos.sem_analise, 'Sem análise')} disabled={ocupado || grupos.sem_analise.length === 0}><Play size={15} /> Sem análise ({grupos.sem_analise.length})</SecondaryButton>
          <SecondaryButton onClick={() => analisarGrupo(grupos.todas, 'Todas')} disabled={ocupado || grupos.todas.length === 0}><Play size={15} /> Todas ({grupos.todas.length})</SecondaryButton>
        </>
      )}
    >
      <div className="space-y-4">
      <Notice>{erro}</Notice>
      {aviso && <Notice type="success">{aviso}</Notice>}
      {progresso && (
        <div className="p-3 rounded-zela-md border border-outline-variant bg-surface-container-low text-sm text-on-surface">
          Analisando {Math.min(progresso.feitos + 1, progresso.total)} de {progresso.total} · {progresso.rotulo}… Pode continuar usando o sistema em outra aba.
          <div className="mt-2 h-1.5 rounded-full bg-outline-variant/40 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((progresso.feitos / progresso.total) * 100)}%` }} />
          </div>
        </div>
      )}
      {pessoas === null ? <Loading /> : pessoas.length === 0 ? (
        <EmptyState icon={ScanFace} text="Nenhuma pessoa autorizada cadastrada nesta escola." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Com biometria" value={resumo.total - resumo.sem_biometria} />
            <StatCard label="Fotos boas" value={resumo.ok} tone="good" />
            <StatCard label="Convém refazer" value={resumo.refazer} tone={resumo.refazer ? 'warn' : 'default'} />
            <StatCard label="Sem análise" value={resumo.sem_analise} hint={resumo.sem_biometria ? `${resumo.sem_biometria} sem biometria` : undefined} />
          </div>
          <p className="text-xs text-on-surface-variant">
            Para refazer, cadastre o rosto da pessoa de novo (Recepção ou portal da família). O cadastro novo já usa a melhor resolução da câmera e confere a qualidade antes de salvar. Pessoa nova ou com a biometria retirada fica em Sem análise até cadastrar o rosto. A lista se atualiza sozinha.
          </p>
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70" />
            <input id="biometria-busca" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa pelo nome" aria-label="Buscar pessoa pelo nome" className={`${inputCls} pl-9`} />
          </div>
          {linhasVisiveis.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Ninguém encontrado com esse nome.</p>
          ) : (
            <ResponsiveTable columns={colunas} rows={linhasVisiveis} />
          )}
        </>
      )}
      </div>
    </PageShell>
  );
}
