# Ícones com o símbolo real da marca (13/10/2026)

O símbolo (capelo, figura, escudo e check em latão) foi VETORIZADO da imagem enviada pelo responsável, sem redesenho. Por isso fica fiel ao original, e como é vetor pode ser ampliado sem perder qualidade. Veja `comparativo.png`.

| Modelo | Fundo | Símbolo |
|---|---|---|
| G | branco | cores originais (petróleo e latão) |
| H | petróleo `#1e5563` | branco e latão |
| I | escuro `#13222e` | branco e latão |

Arquivos por modelo: `-icone-1024.png` (App Store, opaco, sem alfa), `-icone-512.png` (Play), `-frente-1024.png` e `-fundo-1024.png` (Android adaptativo; na frente o símbolo ocupa 76% da altura da imagem, porque o `capacitor-assets` já aplica a margem de 16,7%, o que deixa o símbolo a cerca de 51% do ícone final, dentro da zona segura), `-icone.svg`, `-simbolo.svg`. Também `simbolo-original.svg`, o símbolo sozinho em cores originais com fundo transparente.

## Observações
- Cores do traçado: petróleo `#174e60` e latão `#b08640`, medidas na imagem. O petróleo da marca é ligeiramente diferente do `#1e5563` do app; vale decidir qual vira o oficial.
- A vetorização parte de uma imagem de 1254 px, então pode haver pequenas irregularidades nas bordas. Um designer pode limpar o SVG, ou o ideal é o arquivo original em alta resolução.
- O nome "Zela Edu" e o slogan NÃO foram vetorizados (dependem da fonte da marca).
- Nada foi aplicado em `assets/`, `android/` ou `ios/`.
- Antes de adotar, fazer busca no INPI.

## Como aplicar o escolhido (não aplicado)
Copiar `-icone-1024.png` para `assets/icon-only.png`, `-frente-1024.png` para `assets/icon-foreground.png`, `-fundo-1024.png` para `assets/icon-background.png` e rodar `npx capacitor-assets generate --android --ios`. Depois ajustar a cor da splash e da barra de status (hoje `#1e5563`) se o fundo escolhido for outro.

## ADOTADO em 13/10/2026
O responsável escolheu o modelo I (fundo escuro, símbolo branco e latão). Aplicado em `assets/` e regerado com `capacitor-assets` (Android e iOS), fundo `#13222e`, splash escura com o símbolo. A splash em `capacitor.config.json` passou para `#13222e`. A barra de status e o fundo do iOS seguem `#1e5563` (não alterados). O ícone da Web/PWA (`public/`) NÃO foi trocado.
