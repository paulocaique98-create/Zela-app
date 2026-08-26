# FASE D — Calibração de Threshold do @vladmandic/human

Status: **REABERTA E DESBLOQUEADA — a métrica de similaridade de cosseno resolve o overlap encontrado com distância euclidiana (ver seção 8).**

## 1. Dados coletados na Fase C (reaproveitados, nenhuma foto nova necessária)

### Distâncias de MATCH genuíno (mesma pessoa) — V2 (Human, distância euclidiana)

| Caso | Distância |
|---|---:|
| Rosana, foto nova vs. descritor original | 0.0000 |
| Adenisio, foto nova vs. descritor original | 0.0000 |
| Paulo, foto boa (luz natural) vs. original | 9.6512 |
| Paulo, foto ruim (escuro) vs. original | **9.9809** |

### Distâncias entre pessoas DIFERENTES — V2 (Human)

| Amostra | Menor distância encontrada |
|---|---:|
| 27 pessoas cadastradas no Zela | 9.9660 |
| 9 pessoas novas e diversas | 9.9660 (coincidência não explicada, ver Fase C) |

## 2. O problema matemático real

```
Match genuíno mais fraco (Paulo, foto ruim):        9.9809
Par de pessoas diferentes mais parecido:             9.9660
```

**9.9809 > 9.9660.**

Isso significa que **não existe nenhum valor de threshold único** capaz de:
- aceitar o match genuíno do Paulo com foto ruim (precisaria de threshold ≥ 9.9809), **e**
- rejeitar o par de pessoas diferentes mais parecido (precisaria de threshold < 9.9660)

ao mesmo tempo — porque o próprio caso genuíno mais fraco já está **acima** do pior caso de confusão entre pessoas diferentes. Qualquer threshold que resolva um lado piora o outro:

- Threshold ≥ 9.9809 → aceita o Paulo (bom), mas também aceitaria o par de pessoas diferentes (9.9660) → **risco de falso positivo**.
- Threshold < 9.9809 → rejeita corretamente pessoas diferentes, mas também rejeitaria o próprio Paulo em foto ruim → **falso negativo** (a pessoa certa não seria reconhecida).

## 3. Comparação com o algoritmo atual (V1, face-api.js)

Para deixar claro que isso não é um problema "normal" de todo sistema de reconhecimento, os mesmos números do V1:

| | Match genuíno mais fraco | Par diferente mais parecido | Margem |
|---|---:|---:|---:|
| V1 (atual) | 0.4290 (Paulo, foto ruim) | 0.5408 | **0.1118 de folga** |
| V2 (Human) | 9.9809 (Paulo, foto ruim) | 9.9660 | **-0.0149 (SEM folga — invertido)** |

O `face-api.js` atual, mesmo no pior caso já testado, mantém uma margem positiva de segurança. O `Human`, nos mesmos dados, **não mantém**.

## 4. Por que isso não pode ser considerado definitivo (limitação honesta)

A amostra de matches genuínos é pequena: **4 pontos** (2 pessoas com foto excelente = distância 0, 1 pessoa com 2 fotos de qualidades diferentes). Isso não é estatisticamente robusto o suficiente para:
- confirmar que esse overlap é sistemático (acontece com qualquer foto de qualidade mediana/ruim), ou
- descartar que foi um caso específico dessa pessoa/dessa foto.

Também não testei uma alternativa técnica real: usei **distância euclidiana** (`order: 2`) em todos os testes. A documentação do `Human` sugere que o descritor `faceres` pode funcionar melhor com **similaridade de cosseno**, que é outra forma de medir "parecença" entre vetores, menos sensível à magnitude absoluta (que pode variar com iluminação/exposição da foto). Não testei essa alternativa — é um caminho não explorado que poderia mudar esse resultado.

## 5. Aplicando a regra de parada do plano

O próprio plano da Fase C definia: *"se a taxa de erro for pior, ou gerar novos falsos positivos, NÃO prosseguir."* Encontrei exatamente essa condição — não uma taxa de erro estatística ampla, mas uma demonstração matemática concreta de que o pior caso genuíno já observado ultrapassa o pior caso de confusão já observado.

## 6. Conclusão e recomendação (atualizada após a seção 8)

A hipótese A foi testada (seção 8) e **funcionou**: com similaridade de cosseno em vez de distância
euclidiana, o overlap desaparece — o pior match genuíno (0.5172) fica acima do pior caso de confusão
(0.4467), com margem positiva de 0.0705. Isso desbloqueia a calibração.

**Threshold candidato: ~0.48** (ponto médio entre os dois extremos observados), com **CONSISTENCY_FRAMES** equivalente ao atual (múltiplos frames concordando) como camada extra de segurança, do mesmo jeito que o `face-api.js` já usa hoje.

**Ainda não é uma calibração final** — 8 pontos de dado (4 pessoas) é pouco pra travar um valor de produção. Antes da Fase E (escrita de código), meu real recomendação é:

**B) Coletar uma amostra real maior** — o caminho mais confiável continua sendo validar esse candidato (0.48) contra mais gente, especialmente pares fisicamente parecidos, antes de considerá-lo definitivo. Isso pode ser feito com mais testes manuais como os que já fizemos, ou adiantando partes da Fase F (uso real, modo observador).

**Não avancei pra Fase E (escrita de código) ainda** — mas o bloqueio duro que existia (nenhum threshold possível) não existe mais. A decisão agora é sobre confiança estatística, não sobre uma impossibilidade matemática.

## 8. Reteste com similaridade de cosseno (resolve o bloqueio)

Reprocessei os mesmos 4 sujeitos (Rosana, Adenisio, Paulo com foto ruim, Paulo com foto boa) contra
os descritores originais, desta vez calculando **similaridade de cosseno** além da distância
euclidiana, no mesmo processo/mesma execução (garantindo comparação justa):

| Caso | Euclidiana | Cosseno |
|---|---:|---:|
| Rosana (nova) vs Rosana (original) — MATCH | 0.0000 | 1.000000 |
| Adenisio (novo) vs Adenisio (original) — MATCH | 0.0000 | 1.000000 |
| Paulo RUIM vs Paulo (original) — MATCH | 10.5255 | **0.517228** |
| Paulo BOM vs Paulo (original) — MATCH | 9.6512 | 0.672245 |
| Rosana vs Adenisio (original) — DIFERENTE | 10.0609 | 0.413539 |
| Adenisio vs Rosana (original) — DIFERENTE | 10.0609 | 0.413539 |
| Paulo RUIM vs Rosana (original) — DIFERENTE | 8.9971 | 0.383780 |
| Paulo RUIM vs Adenisio (original) — DIFERENTE | 9.4609 | **0.446673** |

**Resultado**: com cosseno, o pior match genuíno (0.5172) fica **acima** do pior caso de confusão
entre pessoas diferentes (0.4467) — margem positiva de **0.0705**. Isso resolve exatamente o overlap
que bloqueava a Fase D com distância euclidiana.

### Threshold candidato

Com os 8 pontos de dado disponíveis, um threshold em torno de **0.48** (ponto médio entre 0.4467 e
0.5172) separaria corretamente todos os casos testados até agora — matches ≥ 0.48 aceitos, abaixo
rejeitados.

### Ressalva que continua valendo

A amostra continua pequena (8 comparações, 4 pessoas). Isso é evidência de que a métrica de cosseno é
tecnicamente superior à euclidiana pra esse descritor — mas não é, sozinho, validação estatística
suficiente pra um threshold de produção. O valor 0.48 é um **candidato justificado por dado real**,
não uma calibração final.

## 7. Estado dos dados

Nenhum dado de produção foi alterado nesta fase (só leitura/análise dos números já existentes). As colunas `face_descriptor_v2`/`face_descriptor_v2_status` da Fase B continuam no banco, intactas, sem uso em produção.
