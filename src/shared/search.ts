/** Bersihkan input pencarian: buang karakter berarti-khusus di filter PostgREST. */
export const cleanSearch = (q: string) =>
  q.trim().replace(/[^\p{L}\p{N} .\-_/]/gu, '').slice(0, 60)
