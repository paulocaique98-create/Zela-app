import { describe, it, expect } from 'vitest';
import { registroDeErrosAtivo, classificarErroSolto } from './errorLogger.js';

describe('registro de erros (01/10/2026)', () => {
  it('não grava erros do computador do desenvolvedor', () => {
    expect(registroDeErrosAtivo({ hostname: 'localhost' })).toBe(false);
    expect(registroDeErrosAtivo({ hostname: '127.0.0.1' })).toBe(false);
    expect(registroDeErrosAtivo({ hostname: 'maquina.local' })).toBe(false);
    expect(registroDeErrosAtivo({ hostname: 'sensekids.vercel.app' })).toBe(true);
    expect(registroDeErrosAtivo(null)).toBe(true);
  });

  it('"Box.constructor" da biblioteca de rosto vira aviso do reconhecimento facial', () => {
    const erro = new Error('Box.constructor - expected box to be IBoundingBox | IRect, instead have {"x":null,"y":null,"width":null,"height":null}');
    expect(classificarErroSolto(erro)).toEqual({ source: 'face_recognition', category: 'frame_vazio_biblioteca', severity: 'warn' });
  });

  it('outros erros soltos continuam como erro de cliente', () => {
    expect(classificarErroSolto(new Error('Cannot read properties of undefined'))).toEqual({ source: 'client', category: 'unhandled_error', severity: 'error' });
  });
});
