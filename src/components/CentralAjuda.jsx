import { useMemo, useState } from 'react';
import { Search, ChevronLeft, Lightbulb } from 'lucide-react';
import { AJUDA_POR_PERFIL, filtrarAjuda, secoesDoMetodo } from '../lib/ajuda';

// Central de Ajuda: para que serve cada menu e como usar. O conteúdo vem de
// src/lib/ajuda/<perfil>.js, então editar o texto não exige mexer aqui.
export default function CentralAjuda({ perfil, method = null, onRefazerTour = null }) {
  const secoes = useMemo(() => secoesDoMetodo(AJUDA_POR_PERFIL[perfil], method), [perfil, method]);
  const [texto, setTexto] = useState('');
  const [secaoId, setSecaoId] = useState('todas');
  const [aberto, setAberto] = useState(null); // { secao, item }

  const visiveis = useMemo(() => filtrarAjuda(secoes, texto, secaoId, method), [secoes, texto, secaoId, method]);

  if (aberto) {
    const { secao, item } = aberto;
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 md:p-6">
        <div className="w-full">
          <button
            type="button"
            onClick={() => setAberto(null)}
            className="inline-flex items-center gap-1 min-h-[44px] text-sm font-semibold text-brass hover:underline"
          >
            <ChevronLeft size={16} /> Central de Ajuda
          </button>
          <p className="text-xs text-on-surface-variant mt-1">{secao.titulo}</p>
          <h1 className="font-serif text-2xl font-bold text-on-surface mt-1">{item.titulo}</h1>

          <section className="mt-5 bg-surface-container-lowest border border-outline-variant rounded-xl p-5">
            <h2 className="font-serif text-lg font-semibold text-on-surface">Para que serve</h2>
            <p className="mt-1 text-sm text-on-surface leading-relaxed">{item.serve}</p>

            {item.campos?.length > 0 && (
              <>
                <h2 className="font-serif text-lg font-semibold text-on-surface mt-5">Campos da tela</h2>
                <dl className="mt-1 divide-y divide-outline-variant/60">
                  {item.campos.map(([nome, desc]) => (
                    <div key={nome} className="py-2 sm:grid sm:grid-cols-[180px_1fr] sm:gap-4">
                      <dt className="text-sm font-semibold text-on-surface">{nome}</dt>
                      <dd className="text-sm text-on-surface-variant">{desc}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            {item.faz?.length > 0 && (
              <>
                <h2 className="font-serif text-lg font-semibold text-on-surface mt-5">O que você faz aqui</h2>
                <ol className="mt-1 list-decimal pl-5 space-y-1 text-sm text-on-surface">
                  {item.faz.map((p, i) => <li key={i}>{p}</li>)}
                </ol>
              </>
            )}

            {item.dica && (
              <div className="mt-5 flex gap-2 bg-brass-50 border-l-4 border-brass rounded-md p-3 text-sm text-on-surface">
                <Lightbulb size={16} className="text-brass shrink-0 mt-0.5" aria-hidden="true" />
                <p><strong>Dica.</strong> {item.dica}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-2.5 md:p-6">
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="ajuda-busca" className="flex-1 min-w-[240px] flex items-center gap-2 max-w-xl bg-surface-container-lowest border border-outline-variant rounded-xl px-3 min-h-[44px] focus-within:border-brass">
            <Search size={16} className="text-on-surface-variant shrink-0" aria-hidden="true" />
            <input
              id="ajuda-busca"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar, por exemplo: saída, biometria, mensalidade"
              className="flex-1 bg-transparent outline-none text-sm text-on-surface"
            />
          </label>
          {onRefazerTour && (
            <button
              type="button"
              onClick={onRefazerTour}
              className="min-h-[44px] px-4 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm font-semibold text-on-surface hover:border-brass"
            >
              Refazer o tour guiado
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar por menu">
          {[{ id: 'todas', titulo: 'Tudo' }, ...secoes].map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={secaoId === s.id}
              onClick={() => setSecaoId(s.id)}
              className={`px-3 min-h-[36px] rounded-full border text-xs font-semibold transition-colors ${secaoId === s.id ? 'bg-brass-50 border-brass text-on-surface' : 'border-outline-variant text-on-surface-variant bg-surface-container-lowest hover:border-brass'}`}
            >
              {s.titulo}
            </button>
          ))}
        </div>

        {visiveis.length === 0 && (
          <p className="mt-8 text-sm text-on-surface-variant">Nada encontrado. Tente outra palavra.</p>
        )}

        {visiveis.map((secao) => (
          <section key={secao.id} className="mt-7" aria-labelledby={`ajuda-sec-${secao.id}`}>
            <h2 id={`ajuda-sec-${secao.id}`} className="font-serif text-lg font-semibold text-on-surface pb-2 border-b border-outline-variant">
              {secao.titulo}
            </h2>
            <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {secao.itens.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAberto({ secao, item })}
                  className="text-left bg-surface-container-lowest border border-outline-variant rounded-xl p-4 hover:border-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
                >
                  <span className="block text-sm font-semibold text-on-surface">{item.titulo}</span>
                  <span className="block mt-1 text-xs text-on-surface-variant line-clamp-2">{item.serve}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
