import { randomUUID } from "node:crypto";

const AYAR_ANAHTARI = "salon_krokisi_v1";
const SEKILLER = new Set(["kare", "yuvarlak", "dikdortgen"]);
const metin = (deger, sinir = 80) => String(deger ?? "").trim().slice(0, sinir);
const sayi = (deger, varsayilan, alt, ust) => { const sonuc = Number(deger); return Number.isFinite(sonuc) ? Math.min(ust, Math.max(alt, sonuc)) : varsayilan; };

function varsayilanMasalar() {
  return Array.from({ length: 12 }, (_, indeks) => ({ id: `masa-${indeks + 1}`, masaNo: String(indeks + 1), ad: `Masa ${indeks + 1}`, x: 8 + (indeks % 4) * 24, y: 10 + Math.floor(indeks / 4) * 29, genislik: 16, yukseklik: 17, sekil: "kare", kapasite: 4, bolum: "", aktif: true }));
}
export function varsayilanSalonKrokisi() { return { surum: 1, katlar: [{ id: "kat-1", ad: "1. Kat", sira: 1, masalar: varsayilanMasalar() }] }; }

export function salonKrokisiniDogrula(girdi) {
  const hamKatlar = Array.isArray(girdi?.katlar) ? girdi.katlar : [];
  if (!hamKatlar.length) throw Object.assign(new Error("En az bir kat bulunmalıdır."), { status: 400 });
  if (hamKatlar.length > 10) throw Object.assign(new Error("En fazla 10 kat eklenebilir."), { status: 400 });
  const kullanilanKatIdleri = new Set(); const kullanilanMasaNolari = new Set();
  const katlar = hamKatlar.map((kat, katIndeksi) => {
    const katId = metin(kat?.id, 80) || randomUUID();
    if (kullanilanKatIdleri.has(katId)) throw Object.assign(new Error("Kat kimlikleri benzersiz olmalıdır."), { status: 400 });
    kullanilanKatIdleri.add(katId);
    const hamMasalar = Array.isArray(kat?.masalar) ? kat.masalar : [];
    if (hamMasalar.length > 100) throw Object.assign(new Error("Bir katta en fazla 100 masa bulunabilir."), { status: 400 });
    const kullanilanMasaIdleri = new Set();
    const masalar = hamMasalar.map((masa, masaIndeksi) => {
      const masaNo = metin(masa?.masaNo, 24);
      if (!masaNo) throw Object.assign(new Error(`${katIndeksi + 1}. kattaki ${masaIndeksi + 1}. masanın numarası boş olamaz.`), { status: 400 });
      const noAnahtari = masaNo.toLocaleLowerCase("tr-TR");
      if (kullanilanMasaNolari.has(noAnahtari)) throw Object.assign(new Error(`Masa ${masaNo} birden fazla katta kullanılıyor.`), { status: 400 });
      kullanilanMasaNolari.add(noAnahtari);
      const masaId = metin(masa?.id, 80) || randomUUID();
      if (kullanilanMasaIdleri.has(masaId)) throw Object.assign(new Error("Bir kattaki masa kimlikleri benzersiz olmalıdır."), { status: 400 });
      kullanilanMasaIdleri.add(masaId);
      const genislik = sayi(masa?.genislik, 16, 6, 36); const yukseklik = sayi(masa?.yukseklik, 17, 7, 36);
      return { id: masaId, masaNo, ad: metin(masa?.ad, 80) || `Masa ${masaNo}`, x: sayi(masa?.x, 10, 0, 100 - genislik), y: sayi(masa?.y, 10, 0, 100 - yukseklik), genislik, yukseklik, sekil: SEKILLER.has(masa?.sekil) ? masa.sekil : "kare", kapasite: Math.round(sayi(masa?.kapasite, 4, 1, 30)), bolum: metin(masa?.bolum, 80), aktif: masa?.aktif !== false };
    });
    return { id: katId, ad: metin(kat?.ad, 60) || `${katIndeksi + 1}. Kat`, sira: katIndeksi + 1, masalar };
  });
  return { surum: 1, katlar };
}
export async function salonKrokisiniGetir(isletmeId, pool) {
  const sonuc = await pool.query("SELECT deger FROM sistem_ayarlari WHERE isletme_id=$1 AND anahtar=$2", [isletmeId, AYAR_ANAHTARI]);
  if (!sonuc.rows[0]?.deger) return varsayilanSalonKrokisi();
  try { return salonKrokisiniDogrula(sonuc.rows[0].deger); } catch { return varsayilanSalonKrokisi(); }
}
export async function salonKrokisiniKaydet(isletmeId, pool, girdi) {
  const kroki = salonKrokisiniDogrula(girdi);
  await pool.query(`INSERT INTO sistem_ayarlari (isletme_id, anahtar, deger) VALUES ($1,$2,$3::jsonb) ON CONFLICT (isletme_id,anahtar) DO UPDATE SET deger=EXCLUDED.deger`, [isletmeId, AYAR_ANAHTARI, JSON.stringify(kroki)]);
  return kroki;
}
