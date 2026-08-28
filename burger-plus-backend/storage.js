import { randomUUID } from "crypto";
import sharp from "sharp";

const GORSEL_TURLERI = [
  { mime: "image/png", uzanti: "png", eslesir: (veri) => veri.length >= 8 && veri.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", uzanti: "jpg", eslesir: (veri) => veri.length >= 3 && veri[0] === 0xff && veri[1] === 0xd8 && veri[2] === 0xff },
  { mime: "image/webp", uzanti: "webp", eslesir: (veri) => veri.length >= 12 && veri.toString("ascii", 0, 4) === "RIFF" && veri.toString("ascii", 8, 12) === "WEBP" },
  { mime: "image/gif", uzanti: "gif", eslesir: (veri) => veri.length >= 6 && ["GIF87a", "GIF89a"].includes(veri.toString("ascii", 0, 6)) },
  { mime: "image/avif", uzanti: "avif", eslesir: (veri) => veri.length >= 12 && veri.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(veri.toString("ascii", 8, 12)) },
  { mime: "image/bmp", uzanti: "bmp", eslesir: (veri) => veri.length >= 2 && veri.toString("ascii", 0, 2) === "BM" },
];
const SVG_TURU = {
  mime: "image/svg+xml",
  uzanti: "svg",
  eslesir(veri) {
    if (!veri.length || veri.length > 2 * 1024 * 1024 || veri.includes(0)) return false;
    const metin = veri.toString("utf8").replace(/^\uFEFF/, "").trim();
    if (!/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(metin)) return false;
    return !/(?:<script|<foreignObject|<iframe|<object|<embed|<!DOCTYPE|javascript\s*:|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|file:))/i.test(metin);
  },
};
const LOGO_TURLERI = [...GORSEL_TURLERI.filter((tur) => ["image/png", "image/jpeg", "image/webp"].includes(tur.mime)), SVG_TURU];
const DESTEKLENEN_MIME_TURLERI = [...new Set([...GORSEL_TURLERI, SVG_TURU].map((tur) => tur.mime))];

function ayarlariGetir() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const servisAnahtari = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || "urun-gorselleri").trim();
  if (!supabaseUrl || !servisAnahtari) {
    throw new Error("Görsel yüklemek için SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlanmalıdır.");
  }
  if (!/^[a-z0-9_-]{3,63}$/i.test(bucket)) throw new Error("Supabase Storage bucket adı geçersiz.");
  return { supabaseUrl, servisAnahtari, bucket };
}

async function bucketHazirla({ supabaseUrl, servisAnahtari, bucket }) {
  let yanit = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: servisAnahtari,
      Authorization: `Bearer ${servisAnahtari}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: DESTEKLENEN_MIME_TURLERI }),
  });
  if (yanit.status === 409) {
    yanit = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
      method: "PUT",
      headers: {
        apikey: servisAnahtari,
        Authorization: `Bearer ${servisAnahtari}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: DESTEKLENEN_MIME_TURLERI }),
    });
  }
  if (!yanit.ok) {
    const ayrinti = await yanit.text();
    throw new Error(`Görsel alanı hazırlanamadı (${yanit.status}): ${ayrinti.slice(0, 160)}`);
  }
}

function dosyaTurunuBul(buffer, turler, bildirilenMime = "") {
  const tur = turler.find((aday) => aday.eslesir(buffer));
  const mime = String(bildirilenMime || "").split(";")[0].trim().toLowerCase();
  if (!tur || (mime && mime !== tur.mime)) return null;
  return tur;
}

async function nesneYukle(buffer, nesneYolu, dosyaTuru, enFazlaBayt, boyutMesaji) {
  if (!Buffer.isBuffer(buffer)) throw new Error("Geçerli bir görsel dosyası gönderilmelidir.");
  if (buffer.length > enFazlaBayt) throw new Error(boyutMesaji);
  const ayarlar = ayarlariGetir();
  const yukle = () => fetch(`${ayarlar.supabaseUrl}/storage/v1/object/${ayarlar.bucket}/${nesneYolu}`, {
    method: "POST",
    headers: {
      apikey: ayarlar.servisAnahtari,
      Authorization: `Bearer ${ayarlar.servisAnahtari}`,
      "Content-Type": dosyaTuru.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false",
    },
    body: buffer,
  });

  let yanit = await yukle();
  if ([400, 404].includes(yanit.status)) {
    await bucketHazirla(ayarlar);
    yanit = await yukle();
  }
  if (!yanit.ok) {
    const ayrinti = await yanit.text();
    throw new Error(`Görsel yüklenemedi (${yanit.status}): ${ayrinti.slice(0, 160)}`);
  }
  return `${ayarlar.supabaseUrl}/storage/v1/object/public/${ayarlar.bucket}/${nesneYolu}`;
}

export async function gorselYukle(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error("Geçerli bir görsel dosyası gönderilmelidir.");
  const gorselTuru = dosyaTurunuBul(buffer, GORSEL_TURLERI);
  if (!gorselTuru) throw new Error("PNG, JPG/JPEG, WebP, GIF, AVIF veya BMP formatında geçerli bir görsel yükleyin.");
  const nesneYolu = `urunler/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${gorselTuru.uzanti}`;
  return nesneYukle(buffer, nesneYolu, gorselTuru, 5 * 1024 * 1024, "Görsel en fazla 5 MB olabilir.");
}

export async function sikayetGorseliYukle(buffer, isletmeId, kullaniciId, bildirilenMime) {
  if (!Buffer.isBuffer(buffer)) throw new Error("Geçerli bir görsel dosyası gönderilmelidir.");
  const izinliTurler = GORSEL_TURLERI.filter((tur) => ["image/png", "image/jpeg", "image/webp"].includes(tur.mime));
  const gorselTuru = dosyaTurunuBul(buffer, izinliTurler, bildirilenMime);
  if (!gorselTuru) throw new Error("Şikayet görseli PNG, JPG/JPEG veya WebP formatında olmalıdır.");
  const tenant = Number(isletmeId);
  const kullanici = Number(kullaniciId);
  if (!Number.isSafeInteger(tenant) || tenant < 1 || !Number.isSafeInteger(kullanici) || kullanici < 1) {
    throw new Error("Görsel sahibi doğrulanamadı.");
  }
  const nesneYolu = `sikayetler/${tenant}/${kullanici}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${gorselTuru.uzanti}`;
  return nesneYukle(buffer, nesneYolu, gorselTuru, 5 * 1024 * 1024, "Şikayet görseli en fazla 5 MB olabilir.");
}

export function sikayetGorseliKullaniciyaAitMi(publicUrl, isletmeId, kullaniciId) {
  const url = String(publicUrl || "").trim();
  if (!url) return true;
  const ayarlar = ayarlariGetir();
  const onEk = `${ayarlar.supabaseUrl}/storage/v1/object/public/${ayarlar.bucket}/sikayetler/${Number(isletmeId)}/${Number(kullaniciId)}/`;
  return url.startsWith(onEk) && !url.includes("..") && url.length <= 1000;
}

export async function giderBelgesiYukle(buffer, isletmeId, bildirilenMime) {
  if (!Buffer.isBuffer(buffer)) throw new Error("Geçerli bir gider belgesi gönderilmelidir.");
  const izinliTurler = GORSEL_TURLERI.filter((tur) => ["image/png", "image/jpeg", "image/webp"].includes(tur.mime));
  const gorselTuru = dosyaTurunuBul(buffer, izinliTurler, bildirilenMime);
  if (!gorselTuru) throw new Error("Gider belgesi PNG, JPG/JPEG veya WebP formatında olmalıdır.");
  const tenant = Number(isletmeId);
  if (!Number.isSafeInteger(tenant) || tenant < 1) throw new Error("Belge işletmesi doğrulanamadı.");
  const nesneYolu = `giderler/${tenant}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${gorselTuru.uzanti}`;
  return nesneYukle(buffer, nesneYolu, gorselTuru, 5 * 1024 * 1024, "Gider belgesi en fazla 5 MB olabilir.");
}

export function giderBelgesiIsletmeyeAitMi(publicUrl, isletmeId) {
  const url = String(publicUrl || "").trim();
  if (!url) return true;
  const ayarlar = ayarlariGetir();
  const onEk = `${ayarlar.supabaseUrl}/storage/v1/object/public/${ayarlar.bucket}/giderler/${Number(isletmeId)}/`;
  return url.startsWith(onEk) && !url.includes("..") && url.length <= 1000;
}

// Farklı oranlarda ve çevresinde görünmez/beyaz boşluk bulunan logoların
// uygulamanın her yerinde aynı dolulukta görünmesi için ortak bir tuval üretir.
// Çıktı 2.7:1 oranındadır; üst bar (112x45), giriş ve açılış ekranları bu
// orana göre tasarlanmıştır. WebP şeffaflığı korur ve SVG'yi pasif görsele
// dönüştürerek tarayıcıda aktif içerik çalıştırılması riskini de kaldırır.
export async function logoGorseliniStandartlastir(buffer) {
  try {
    return await sharp(buffer, { limitInputPixels: 25_000_000, failOn: "error" })
      .rotate()
      .trim({ threshold: 10 })
      .resize({
        width: 1000,
        height: 320,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: 40,
        bottom: 40,
        left: 40,
        right: 40,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ lossless: true, effort: 4 })
      .toBuffer();
  } catch {
    throw new Error("Logo işlenemedi. Lütfen geçerli ve bozuk olmayan bir görsel yükleyin.");
  }
}

export async function logoYukle(buffer, isletmeId, bildirilenMime) {
  if (!Buffer.isBuffer(buffer)) throw new Error("Geçerli bir logo dosyası gönderilmelidir.");
  const logoTuru = dosyaTurunuBul(buffer, LOGO_TURLERI, bildirilenMime);
  if (!logoTuru) throw new Error("Logo PNG, JPG/JPEG, WebP veya güvenli SVG formatında olmalıdır.");
  const id = Number(isletmeId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("isletmeId zorunlu");
  const standartLogo = await logoGorseliniStandartlastir(buffer);
  const nesneYolu = `logolar/logo_${id}_${Date.now()}.webp`;
  return nesneYukle(standartLogo, nesneYolu, { mime: "image/webp" }, 2 * 1024 * 1024, "İşlenen logo en fazla 2 MB olabilir.");
}

export async function storageDosyasiniSil(publicUrl) {
  const url = String(publicUrl || "").trim();
  if (!url) return false;
  const ayarlar = ayarlariGetir();
  const onEk = `${ayarlar.supabaseUrl}/storage/v1/object/public/${ayarlar.bucket}/`;
  if (!url.startsWith(onEk)) return false;
  const nesneYolu = url.slice(onEk.length).split("/").map(encodeURIComponent).join("/");
  if (!nesneYolu) return false;
  const yanit = await fetch(`${ayarlar.supabaseUrl}/storage/v1/object/${ayarlar.bucket}/${nesneYolu}`, {
    method: "DELETE",
    headers: {
      apikey: ayarlar.servisAnahtari,
      Authorization: `Bearer ${ayarlar.servisAnahtari}`,
    },
  });
  if (yanit.status === 404) return true;
  if (!yanit.ok) {
    const ayrinti = await yanit.text();
    throw new Error(`Eski logo silinemedi (${yanit.status}): ${ayrinti.slice(0, 160)}`);
  }
  return true;
}
