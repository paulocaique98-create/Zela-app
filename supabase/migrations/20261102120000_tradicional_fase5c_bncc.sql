-- Método Tradicional, Fase 5C: BNCC por disciplina (PLANO_METODO_TRADICIONAL.md).
-- Aditiva: duas tabelas novas; nada existente é alterado. Depende da Fase 5B (trad_tarefas).
-- 1) bncc_habilidades: catálogo GLOBAL (conteúdo público da BNCC, sem school_id),
--    somente leitura para o cliente: nenhuma policy de escrita e sem grant de escrita.
-- 2) trad_tarefa_habilidades: vínculo tarefa x habilidade, com school_id e chave
--    estrangeira composta. A RLS herda a visibilidade de trad_tarefas (a subconsulta
--    passa pela RLS dela): professor só nas próprias tarefas, equipe na escola,
--    família só LÊ as da turma do próprio filho.
-- A carga abaixo é um recorte inicial do Fundamental I (1º ao 5º ano). REVISAR os
-- códigos e textos contra a BNCC oficial antes de aplicar; novas habilidades entram
-- por migration futura (on conflict do nothing).

create table if not exists public.bncc_habilidades (
  codigo text primary key check (codigo ~ '^EF0[1-5][A-Z]{2}[0-9]{2}$'),
  componente text not null check (componente in ('Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia')),
  ano smallint not null check (ano between 1 and 5),
  descricao text not null check (length(descricao) between 1 and 600)
);
create index if not exists idx_bncc_habilidades_ano on public.bncc_habilidades(ano, componente);

alter table public.bncc_habilidades enable row level security;
drop policy if exists "Autenticados leem catalogo BNCC" on public.bncc_habilidades;
create policy "Autenticados leem catalogo BNCC" on public.bncc_habilidades
  for select to authenticated using (true);
revoke all on public.bncc_habilidades from anon;
revoke insert, update, delete, truncate on public.bncc_habilidades from authenticated;

create table if not exists public.trad_tarefa_habilidades (
  tarefa_id uuid not null,
  school_id uuid not null references public.schools(id) on delete cascade,
  codigo text not null references public.bncc_habilidades(codigo) on delete restrict,
  primary key (tarefa_id, codigo),
  foreign key (tarefa_id, school_id) references public.trad_tarefas(id, school_id) on delete cascade
);
create index if not exists idx_trad_tarefa_habilidades_escola on public.trad_tarefa_habilidades(school_id, tarefa_id);

alter table public.trad_tarefa_habilidades enable row level security;
revoke all on public.trad_tarefa_habilidades from anon;

drop policy if exists "Equipe e professor gerenciam habilidades das tarefas" on public.trad_tarefa_habilidades;
create policy "Equipe e professor gerenciam habilidades das tarefas" on public.trad_tarefa_habilidades
  for all
  using (
    school_id = get_my_school_id()
    and (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica')
         or (get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'))
    and tarefa_id in (select t.id from public.trad_tarefas t where t.school_id = get_my_school_id())
  )
  with check (
    school_id = get_my_school_id()
    and (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica')
         or (get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'))
    and tarefa_id in (select t.id from public.trad_tarefas t where t.school_id = get_my_school_id())
  );

drop policy if exists "Familia le habilidades das tarefas da turma do filho" on public.trad_tarefa_habilidades;
create policy "Familia le habilidades das tarefas da turma do filho" on public.trad_tarefa_habilidades
  for select
  using (
    get_my_role() = 'family'
    and school_id = get_my_school_id()
    and tarefa_id in (select t.id from public.trad_tarefas t where t.school_id = get_my_school_id())
  );

-- Carga inicial (revisar antes de aplicar).
insert into public.bncc_habilidades (codigo, componente, ano, descricao) values
  ('EF01LP01', 'Língua Portuguesa', 1, 'Reconhecer que textos são lidos e escritos da esquerda para a direita e de cima para baixo da página.'),
  ('EF01LP02', 'Língua Portuguesa', 1, 'Escrever, espontaneamente ou por ditado, palavras e frases de forma alfabética, usando letras/grafemas que representem fonemas.'),
  ('EF02LP01', 'Língua Portuguesa', 2, 'Utilizar, ao produzir o texto, grafia correta de palavras conhecidas ou com estruturas silábicas já dominadas, letras maiúsculas em início de frases e em substantivos próprios, segmentação entre as palavras, ponto final, ponto de interrogação e ponto de exclamação.'),
  ('EF02LP02', 'Língua Portuguesa', 2, 'Segmentar palavras em sílabas e remover e substituir sílabas iniciais, mediais ou finais para criar novas palavras.'),
  ('EF03LP01', 'Língua Portuguesa', 3, 'Ler e escrever palavras com correspondências regulares contextuais entre grafemas e fonemas e com marcas de nasalidade (til, m, n).'),
  ('EF03LP02', 'Língua Portuguesa', 3, 'Ler e escrever corretamente palavras com sílabas CV, V, CVC, CCV, identificando que existem vogais em todas as sílabas.'),
  ('EF04LP01', 'Língua Portuguesa', 4, 'Grafar palavras utilizando regras de correspondência fonema-grafema regulares, contextuais e morfológicas e palavras de uso frequente com correspondências irregulares.'),
  ('EF04LP03', 'Língua Portuguesa', 4, 'Localizar palavras no dicionário para esclarecer significados, reconhecendo o significado mais plausível para o contexto que deu origem à consulta.'),
  ('EF05LP01', 'Língua Portuguesa', 5, 'Grafar palavras utilizando regras de correspondência fonema-grafema regulares, contextuais e morfológicas e palavras de uso frequente com correspondências irregulares.'),
  ('EF05LP02', 'Língua Portuguesa', 5, 'Identificar o caráter polissêmico das palavras, comparando o significado de determinados termos utilizados nas áreas científicas com esses mesmos termos utilizados na linguagem usual.'),
  ('EF01MA01', 'Matemática', 1, 'Utilizar números naturais como indicador de quantidade ou de ordem em diferentes situações cotidianas e reconhecer situações em que os números não indicam contagem nem ordem, mas sim código de identificação.'),
  ('EF01MA06', 'Matemática', 1, 'Construir fatos básicos da adição e utilizá-los em procedimentos de cálculo para resolver problemas.'),
  ('EF02MA01', 'Matemática', 2, 'Comparar e ordenar números naturais (até a ordem de centenas) pela compreensão de características do sistema de numeração decimal (valor posicional e papel do zero).'),
  ('EF02MA06', 'Matemática', 2, 'Resolver e elaborar problemas de adição e de subtração, envolvendo números de até três ordens, com os significados de juntar, acrescentar, separar, retirar, usando estratégias pessoais ou convencionais.'),
  ('EF03MA03', 'Matemática', 3, 'Construir e utilizar fatos básicos da adição e da multiplicação para o cálculo mental ou escrito.'),
  ('EF03MA07', 'Matemática', 3, 'Resolver e elaborar problemas de multiplicação (por 2, 3, 4, 5 e 10) com os significados de adição de parcelas iguais e elementos apresentados em disposição retangular, utilizando diferentes estratégias de cálculo e registro.'),
  ('EF04MA06', 'Matemática', 4, 'Resolver e elaborar problemas envolvendo diferentes significados da multiplicação (adição de parcelas iguais, organização retangular e proporcionalidade), utilizando estratégias diversas, como cálculo por estimativa, cálculo mental e algoritmos.'),
  ('EF04MA09', 'Matemática', 4, 'Reconhecer as frações unitárias mais usuais (1/2, 1/3, 1/4, 1/5, 1/10 e 1/100) como unidades de medida menores do que uma unidade, utilizando a reta numérica como recurso.'),
  ('EF05MA03', 'Matemática', 5, 'Identificar e representar frações (menores e maiores que a unidade), associando-as ao resultado de uma divisão ou à ideia de parte de um todo, utilizando a reta numérica como recurso.'),
  ('EF05MA07', 'Matemática', 5, 'Resolver e elaborar problemas de adição e subtração com números naturais e com números racionais, cuja representação decimal seja finita, utilizando estratégias diversas, como cálculo por estimativa, cálculo mental e algoritmos.'),
  ('EF01CI01', 'Ciências', 1, 'Comparar características de diferentes materiais presentes em objetos de uso cotidiano, discutindo sua origem, os modos como são descartados e como podem ser usados de forma mais consciente.'),
  ('EF02CI01', 'Ciências', 2, 'Identificar de que materiais (metais, madeira, vidro etc.) são feitos os objetos que fazem parte da vida cotidiana, como esses objetos são utilizados e com quais materiais eram produzidos no passado.'),
  ('EF03CI04', 'Ciências', 3, 'Identificar características sobre o modo de vida (o que comem, como se reproduzem, o ambiente em que vivem etc.) dos animais mais comuns no ambiente próximo.'),
  ('EF04CI02', 'Ciências', 4, 'Testar e relatar transformações nos materiais do cotidiano quando expostos a diferentes condições (aquecimento, resfriamento, luz e umidade).'),
  ('EF05CI01', 'Ciências', 5, 'Explorar fenômenos da vida cotidiana que evidenciem propriedades físicas dos materiais, como densidade, condutibilidade térmica e elétrica, respostas a forças magnéticas, solubilidade e respostas a forças mecânicas.'),
  ('EF01HI01', 'História', 1, 'Identificar aspectos do seu crescimento por meio do registro das lembranças particulares ou de lembranças dos membros de sua família e/ou de sua comunidade.'),
  ('EF02HI01', 'História', 2, 'Reconhecer espaços de sociabilidade e identificar os motivos que aproximam e separam as pessoas em diferentes grupos sociais ou de parentesco.'),
  ('EF03HI01', 'História', 3, 'Identificar os grupos populacionais que formam a cidade, o município e a região, as relações estabelecidas entre eles e os eventos que marcam a formação da cidade.'),
  ('EF04HI01', 'História', 4, 'Reconhecer a história como resultado da ação do ser humano no tempo e no espaço, com base na identificação de mudanças e permanências ao longo do tempo.'),
  ('EF05HI01', 'História', 5, 'Identificar os processos de formação das culturas e dos povos, relacionando-os com o espaço geográfico ocupado.'),
  ('EF01GE01', 'Geografia', 1, 'Descrever características de seus lugares de vivência (moradia, escola etc.) e identificar semelhanças e diferenças entre esses lugares.'),
  ('EF02GE01', 'Geografia', 2, 'Descrever a história das migrações no bairro ou comunidade em que vive.'),
  ('EF03GE01', 'Geografia', 3, 'Identificar e comparar aspectos culturais dos grupos sociais de seus lugares de vivência, seja na cidade, seja no campo.'),
  ('EF04GE01', 'Geografia', 4, 'Selecionar, em seus lugares de vivência e em suas histórias familiares e/ou da comunidade, elementos de distintas culturas, valorizando o que é próprio em cada uma delas e sua contribuição para a formação da cultura local, regional e brasileira.'),
  ('EF05GE01', 'Geografia', 5, 'Descrever e analisar dinâmicas populacionais na Unidade da Federação em que vive, estabelecendo relações entre migrações e condições de infraestrutura.')
on conflict (codigo) do nothing;
