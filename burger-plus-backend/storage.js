import { randomUUID } from "crypto";

const GORSEL_TURLERI = [
  { mime: "image/png", uzanti: "png", eslesir: (veri) => veri.length >= 8 && veri.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", uzanti: "jpg", eslesir: (veri) => veri.length >= 3 && veri[0] === 0xff && veri[1] === 0xd8 && veri[2] === 0xff },
  { mime: "image/webp", uzanti: "webp", eslesir: (veri) => veri.length >= 12 && veri.toString("ascii", 0, 4) === "RIFF" && veri.toString("ascii", 8, 12) === "WEBP" },
  { mime: "image/gif", uzanti: "gif", eslesir: (veri) => veri.length >= 6 && ["GIF87a", "GIF89a"].includes(veri.toString("ascii", 0, 6)) },
  { mime: "image/avif", uzanti: "avif", eslesir: (veri) => veri.length >= 12 && veri.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(veri.toString("ascii", 8, 12)) },
  { mime: "image/bmp", uzanti: "bmp", eslesir: (veri) => veri.length >= 2 && veri.toString("ascii", 0, 2) === "BM" },
];
const DESTEKLENEN_MIME_TURLERI = GORSEL_TURLERI.map((tur) => tur.mime);

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
  const yanit = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
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

export async function gorselYukle(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error("Geçerli bir görsel dosyası gönderilmelidir.");
  const gorselTuru = GORSEL_TURLERI.find((tur) => tur.eslesir(buffer));
  if (!gorselTuru) throw new Error("PNG, JPG/JPEG, WebP, GIF, AVIF veya BMP formatında geçerli bir görsel yükleyin.");
  if (buffer.length > 5 * 1024 * 1024) throw new Error("Görsel en fazla 5 MB olabilir.");

  const ayarlar = ayarlariGetir();
  const nesneYolu = `urunler/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${gorselTuru.uzanti}`;
  const yukle = () => fetch(`${ayarlar.supabaseUrl}/storage/v1/object/${ayarlar.bucket}/${nesneYolu}`, {
    method: "POST",
    headers: {
      apikey: ayarlar.servisAnahtari,
      Authorization: `Bearer ${ayarlar.servisAnahtari}`,
      "Content-Type": gorselTuru.mime,
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
