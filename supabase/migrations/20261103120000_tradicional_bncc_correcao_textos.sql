-- Método Tradicional, Fase 5C: correção de 3 textos da carga BNCC (20261102120000),
-- conferidos contra o texto oficial em 28/10/2026. Só atualiza descricao; códigos,
-- vínculos e policies não mudam. Idempotente.
update public.bncc_habilidades set descricao = 'Identificar características sobre o modo de vida (o que comem, como se reproduzem, como se deslocam etc.) dos animais mais comuns no ambiente próximo.' where codigo = 'EF03CI04';
update public.bncc_habilidades set descricao = 'Testar e relatar transformações nos materiais do dia a dia quando expostos a diferentes condições (aquecimento, resfriamento, luz e umidade).' where codigo = 'EF04CI02';
update public.bncc_habilidades set descricao = 'Explorar fenômenos da vida cotidiana que evidenciem propriedades físicas dos materiais, como densidade, condutibilidade térmica e elétrica, respostas a forças magnéticas, solubilidade, respostas a forças mecânicas (dureza, elasticidade etc.), entre outras.' where codigo = 'EF05CI01';

-- Textos que estavam sem o trecho final ou sem o esclarecimento entre parênteses (conferidos
-- em sites que reproduzem a BNCC, 28/10/2026; a conferência contra o PDF do MEC continua a cargo
-- de uma pessoa da escola).
update public.bncc_habilidades set descricao = 'Ler e escrever palavras com correspondências regulares contextuais entre grafemas e fonemas (c/qu; g/gu; r/rr; s/ss; o, e não u, e e, e não i, em sílaba átona em final de palavra) e com marcas de nasalidade (til, m, n).' where codigo = 'EF03LP01';
update public.bncc_habilidades set descricao = 'Identificar o caráter polissêmico das palavras (uma mesma palavra com diferentes significados, de acordo com o contexto de uso), comparando o significado de determinados termos utilizados nas áreas científicas com esses mesmos termos utilizados na linguagem usual.' where codigo = 'EF05LP02';
update public.bncc_habilidades set descricao = 'Identificar os grupos populacionais que formam a cidade, o município e a região, as relações estabelecidas entre eles e os eventos que marcam a formação da cidade, como fenômenos migratórios (vida rural/vida urbana), desmatamentos, estabelecimento de grandes empresas etc.' where codigo = 'EF03HI01';
update public.bncc_habilidades set descricao = 'Selecionar, em seus lugares de vivência e em suas histórias familiares e/ou da comunidade, elementos de distintas culturas (indígenas, afro-brasileiras, de outros países da América Latina, europeias, asiáticas etc.), valorizando o que é próprio em cada uma delas e sua contribuição para a formação da cultura local, regional e brasileira.' where codigo = 'EF04GE01';
