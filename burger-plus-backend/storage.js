import { randomUUID } from "crypto";

const PNG_IMZA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ayarlariGetir() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const servisAnahtari = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || "urun-gorselleri").trim();
  if (!supabaseUrl || !servisAnahtari) {
    throw new Error("PNG yüklemek için SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlanmalıdır.");
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
    body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ["image/png"] }),
  });
  if (!yanit.ok && yanit.status !== 409) {
    const ayrinti = await yanit.text();
    throw new Error(`Görsel alanı hazırlanamadı (${yanit.status}): ${ayrinti.slice(0, 160)}`);
  }
}

export async function pngGorselYukle(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_IMZA.length || !buffer.subarray(0, 8).equals(PNG_IMZA)) {
    throw new Error("Yalnızca geçerli PNG görseller yüklenebilir.");
  }
  if (buffer.length > 5 * 1024 * 1024) throw new Error("PNG görsel en fazla 5 MB olabilir.");

  const ayarlar = ayarlariGetir();
  const nesneYolu = `urunler/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.png`;
  const yukle = () => fetch(`${ayarlar.supabaseUrl}/storage/v1/object/${ayarlar.bucket}/${nesneYolu}`, {
    method: "POST",
    headers: {
      apikey: ayarlar.servisAnahtari,
      Authorization: `Bearer ${ayarlar.servisAnahtari}`,
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false",
    },
    body: buffer,
  });

  let yanit = await yukle();
  if (yanit.status === 404) {
    await bucketHazirla(ayarlar);
    yanit = await yukle();
  }
  if (!yanit.ok) {
    const ayrinti = await yanit.text();
    throw new Error(`PNG yüklenemedi (${yanit.status}): ${ayrinti.slice(0, 160)}`);
  }
  return `${ayarlar.supabaseUrl}/storage/v1/object/public/${ayarlar.bucket}/${nesneYolu}`;
}
