// P2.3 (Prompt Mestre de Evolução) — compressão de imagem no cliente antes
// do upload, pra não deixar o storage crescer sem controle com fotos no
// tamanho original de captura (câmera/celular fácil passa de 3-5MB por
// foto).
//
// Escopo desta função: uploads gerais (mural, anexos de comunicado,
// documentos de matrícula) — NUNCA a foto biométrica de reconhecimento
// facial (authorized_persons.photo_storage_path, usada pelo face-api.js).
// Comprimir a foto que alimenta o reconhecimento exigiria validar que a
// qualidade reduzida não degrada a taxa de acerto do motor (o próprio
// escopo do P2.3 pede isso) — decisão consciente de NÃO aplicar ali nesta
// passada, pra não arriscar falso-negativo/confusão entre pessoas
// parecidas sem esse teste feito. Ver LGPD_RETENCAO.md/relatório mestre.

const DEFAULT_MAX_DIMENSION = 1600; // px, no maior lado
const DEFAULT_QUALITY = 0.82; // JPEG/WebP quality (0-1)

// Redimensiona (mantendo proporção) e recodifica uma imagem via canvas.
// Retorna o próprio `file` original se: não for imagem, o navegador não
// suportar canvas/toBlob, ou o resultado comprimido acabar MAIOR que o
// original (arquivo já pequeno/já comprimido) — nunca piora o que já
// estava bom.
export async function compressImage(file, { maxDimension = DEFAULT_MAX_DIMENSION, quality = DEFAULT_QUALITY } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  // GIF pode ser animado — canvas achataria num frame só, nunca comprime.
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDimension / Math.max(width, height));

    if (scale >= 1 && file.size < 500 * 1024) {
      // Já é pequena e não precisa reduzir dimensão -- não vale o custo.
      bitmap.close?.();
      return file;
    }

    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();

    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise(resolve => canvas.toBlob(resolve, outputType, quality));
    if (!blob) return file;

    // Só usa o resultado comprimido se realmente ficou menor.
    if (blob.size >= file.size) return file;

    const compressedFile = new File([blob], file.name, { type: outputType, lastModified: Date.now() });
    return compressedFile;
  } catch (err) {
    // Qualquer falha (navegador sem suporte, imagem corrompida, etc.) —
    // segue com o arquivo original, nunca bloqueia o upload por causa da
    // compressão ser best-effort.
    console.warn('[compressImage] Não foi possível comprimir, enviando original:', err.message);
    return file;
  }
}
