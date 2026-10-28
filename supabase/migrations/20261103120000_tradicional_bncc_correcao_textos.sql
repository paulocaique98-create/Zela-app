-- Método Tradicional, Fase 5C: correção de 3 textos da carga BNCC (20261102120000),
-- conferidos contra o texto oficial em 28/10/2026. Só atualiza descricao; códigos,
-- vínculos e policies não mudam. Idempotente.
update public.bncc_habilidades set descricao = 'Identificar características sobre o modo de vida (o que comem, como se reproduzem, como se deslocam etc.) dos animais mais comuns no ambiente próximo.' where codigo = 'EF03CI04';
update public.bncc_habilidades set descricao = 'Testar e relatar transformações nos materiais do dia a dia quando expostos a diferentes condições (aquecimento, resfriamento, luz e umidade).' where codigo = 'EF04CI02';
update public.bncc_habilidades set descricao = 'Explorar fenômenos da vida cotidiana que evidenciem propriedades físicas dos materiais, como densidade, condutibilidade térmica e elétrica, respostas a forças magnéticas, solubilidade, respostas a forças mecânicas (dureza, elasticidade etc.), entre outras.' where codigo = 'EF05CI01';
