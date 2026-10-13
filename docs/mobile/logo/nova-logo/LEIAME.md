# Nova logo: coloque os arquivos aqui

Solte nesta pasta a logo nova. Não precisa renomear; me diga que está aqui e eu aplico.

## Arquivos que ajudam (do melhor para o aceitável)
1. **Símbolo em SVG** (vetor, fundo transparente). É o ideal para ícones e login.
2. **Logo completa em SVG** (símbolo, "Zela Edu" e slogan).
3. Se não houver SVG: PNG com fundo transparente, no mínimo 2000 px no lado maior.
4. Opcional: versão só do símbolo e versão para fundo escuro.

## Onde a logo atual é usada (o que eu troco)
| Local | Arquivo |
|---|---|
| Ícone e splash do app (Android e iOS) | `assets/icon-only.png`, `icon-foreground.png`, `icon-background.png`, depois `npx capacitor-assets generate --android --ios` |
| Tela de login | `src/components/ZelaMark.jsx` e `Login.jsx` |
| Favicon e PWA | `public/favicon.svg`, `public/icon-72/192/512.png`, `index.html` |
| Loja Google Play | `docs/mobile/loja/icone-512.png` e `destaque-1024x500.png` |
| Loja Apple | ícone 1024 sem transparência (gerado do `icon-only.png`) |

Logo atual do app: modelo I, em `../marca-vetorizada/`.

## Cuidados
- Ícone da Apple não pode ter transparência.
- Confirmar a cor de fundo do ícone e da splash (hoje `#13222e`).
- Fazer busca no INPI antes de adotar.
