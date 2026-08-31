import { describe, it, expect } from 'vitest';
import { compressImage } from './imageCompression';

// O ambiente de teste (Vitest, environment: 'node') não tem
// createImageBitmap/canvas — não dá pra testar a compressão de verdade
// aqui (isso exigiria um browser real ou jsdom com canvas, fora do
// escopo). O que este teste garante é a promessa mais importante da
// função: nunca quebrar o upload, mesmo quando a compressão em si não
// funciona (arquivo não-imagem, GIF, ou qualquer falha do Canvas/
// createImageBitmap) -- sempre cai de volta pro arquivo original.
describe('compressImage — garantias de segurança (best-effort, nunca bloqueia o upload)', () => {
  it('arquivo não-imagem (PDF) é retornado sem modificação', async () => {
    const pdfFile = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' });
    const result = await compressImage(pdfFile);
    expect(result).toBe(pdfFile);
  });

  it('GIF é retornado sem modificação (poderia ser animado)', async () => {
    const gifFile = new File([new Uint8Array([1, 2, 3])], 'anim.gif', { type: 'image/gif' });
    const result = await compressImage(gifFile);
    expect(result).toBe(gifFile);
  });

  it('null/undefined não lança exceção', async () => {
    expect(await compressImage(null)).toBeNull();
    expect(await compressImage(undefined)).toBeUndefined();
  });

  it('quando o Canvas/createImageBitmap não está disponível (ambiente sem suporte), cai de volta pro arquivo original sem lançar exceção', async () => {
    const imageFile = new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' });
    // Neste ambiente de teste (node) createImageBitmap não existe -- é
    // exatamente o cenário de "navegador sem suporte" que a função
    // precisa tolerar graciosamente.
    const result = await compressImage(imageFile);
    expect(result).toBe(imageFile);
  });
});
