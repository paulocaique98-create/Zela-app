# Protótipos de logotipo e ícone do Zela Edu (13/10/2026)

Três propostas, só na paleta do projeto (petróleo #1e5563 e #174450, tinta #13222e, latão #a9843b, branco). Veja `comparativo.png`.

| Proposta | Ideia |
|---|---|
| A, escudo com Z | Continuidade do escudo atual, com o Z da marca e a diagonal em latão (o "verificado") |
| B, criança protegida | Escudo vazado com figura humana: proteção de quem importa |
| C, Z com moldura de leitura | Cantos de leitura facial em volta do Z: segurança e biometria |

## Arquivos por proposta (prefixo A-, B- ou C-)
- `-icone-1024.png`: App Store e base de todos os ícones. 1024x1024, opaco, SEM canal alfa, sem cantos arredondados.
- `-icone-512.png`: Google Play (512x512, opaco).
- `-frente-1024.png` e `-fundo-1024.png`: ícone adaptativo do Android. A frente é transparente e o símbolo ocupa menos de 66% da área (zona segura), então não é cortado pela máscara. O fundo é cor sólida.
- `-simbolo.svg` e `-icone.svg`: vetoriais editáveis (símbolo sozinho, e ícone com fundo).

## Requisitos conferidos
1024x1024 e 512x512 sem alfa: sim. Símbolo na zona segura do Android: sim (A 60% de altura, B 64%, C 52%). Legível em 29 px: A e C sim, B perde a figura. Cores só da paleta: sim.

## Como aplicar a escolhida (NÃO aplicado)
Copiar para `assets/` como `icon-only.png` (icone-1024), `icon-foreground.png` (frente), `icon-background.png` (fundo) e rodar `npx capacitor-assets generate --android --ios`. A splash e a cor da barra de status (`#1e5563`) acompanham a cor de fundo escolhida.

## Observações
- O nome "Zela Edu" na folha usa Georgia só como substituta. No uso real vale a fonte da marca (Source Serif 4, a do login).
- Antes de adotar, vale uma busca de marca no INPI: escudo com Z é um motivo comum.
