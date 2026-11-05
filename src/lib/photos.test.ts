import { describe, expect, it } from 'vitest';
import { checkPhotoFile, photoInitials, photoPathFromUrl } from './photos';

describe('checkPhotoFile', () => {
  const file = (type: string, size = 1000) => new File([new Uint8Array(size)], 'foto', { type });

  it('aceita qualquer imagem (ela sai em WEBP/JPEG) e tipo vazio (ex.: HEIC em alguns aparelhos)', () => {
    expect(checkPhotoFile(file('image/jpeg'))).toBeNull();
    expect(checkPhotoFile(file('image/heic'))).toBeNull();
    expect(checkPhotoFile(file(''))).toBeNull();
  });

  it('recusa o que não é imagem e arquivo maior que 12 MB', () => {
    expect(checkPhotoFile(file('application/pdf'))).not.toBeNull();
    expect(checkPhotoFile(file('image/png', 12 * 1024 * 1024 + 1))).not.toBeNull();
  });
});

describe('photoInitials', () => {
  it('usa a primeira e a última palavra do nome', () => {
    expect(photoInitials('Arthur Silva')).toBe('AS');
    expect(photoInitials('  Maria  Clara  Souza ')).toBe('MS');
  });

  it('funciona com um nome só ou nome vazio', () => {
    expect(photoInitials('Arthur')).toBe('AR');
    expect(photoInitials('')).toBe('?');
  });
});

describe('photoPathFromUrl', () => {
  const club = '00000000-0000-4000-8000-000000000001';
  const base = 'https://abc.supabase.co/storage/v1/object/public/fotos';

  it('devolve o caminho dentro do bucket do próprio clube', () => {
    expect(photoPathFromUrl(`${base}/${club}/atletas/123/foto.webp`, club)).toBe(`${club}/atletas/123/foto.webp`);
  });

  it('ignora endereço de outro clube ou de outro bucket', () => {
    expect(photoPathFromUrl(`${base}/outro-clube/atletas/123/foto.webp`, club)).toBeNull();
    expect(photoPathFromUrl('https://abc.supabase.co/storage/v1/object/public/escudos/arquivo.png', club)).toBeNull();
  });

  it('aceita vazio', () => {
    expect(photoPathFromUrl(null, club)).toBeNull();
    expect(photoPathFromUrl(undefined, club)).toBeNull();
  });
});
