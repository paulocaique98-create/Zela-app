import React, { useEffect, useState } from 'react';
import { Library, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ROTULO_SITUACAO, dataBR, hojeISO, situacaoEmprestimo } from '../lib/biblioteca';

const TOM = { atrasado: 'text-warning font-semibold', vence_hoje: 'text-warning font-semibold', em_dia: 'text-on-surface-variant', devolvido: 'text-success' };

// Biblioteca (módulo `biblioteca`): livros que os filhos estão com, só leitura.
// A RPC library_meus_emprestimos devolve apenas os empréstimos dos próprios filhos.
export default function FamilyBiblioteca() {
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    supabase.rpc('library_meus_emprestimos').then(({ data, error }) => {
      if (!ativo) return;
      if (error) setErro('Não foi possível carregar os livros.'); else setLinhas(data || []);
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, []);

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  const hoje = hojeISO();
  const comOsFilhos = linhas.filter(l => !l.devolvido_em);
  const devolvidos = linhas.filter(l => l.devolvido_em).slice(0, 10);

  const cartao = (l) => {
    const s = situacaoEmprestimo(l, hoje);
    return (
      <li key={l.id} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-3.5">
        <p className="font-semibold text-on-surface">{l.titulo}</p>
        {l.autor && <p className="text-xs text-on-surface-variant">{l.autor}</p>}
        <p className="text-sm text-on-surface mt-1.5">Com {l.student_name}</p>
        <p className="text-sm text-on-surface-variant">
          {l.devolvido_em ? `Devolvido em ${dataBR(l.devolvido_em)}` : `Devolver até ${dataBR(l.devolver_ate)}`}
        </p>
        <p className={`text-xs mt-1 ${TOM[s.codigo]}`}>
          {ROTULO_SITUACAO[s.codigo]}{s.diasAtraso ? ` há ${s.diasAtraso} ${s.diasAtraso === 1 ? 'dia' : 'dias'}` : ''}
        </p>
      </li>
    );
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Library size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Biblioteca</h2>
      </div>
      {erro && <p className="text-sm text-warning">{erro}</p>}
      {comOsFilhos.length === 0 && !erro ? (
        <p className="text-sm text-on-surface-variant">Nenhum livro emprestado no momento.</p>
      ) : (
        <ul className="space-y-2">{comOsFilhos.map(cartao)}</ul>
      )}
      {devolvidos.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-on-surface">Devolvidos recentemente</h3>
          <ul className="space-y-2">{devolvidos.map(cartao)}</ul>
        </>
      )}
    </div>
  );
}
