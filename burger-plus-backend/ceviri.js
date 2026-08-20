import { createHash } from "node:crypto";

const GEMINI_API_KOKU = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = process.env.GEMINI_TRANSLATION_MODEL || "gemini-3.1-flash-lite";
const ZAMAN_ASIMI_MS = 20_000;

const CEVIRI_YANIT_SEMASI = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, text: { type: "string" } },
        required: ["key", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

function metinSiniri(varlikTuru, alan) {
  if (alan.includes("aciklama")) return varlikTuru === "urun" ? 2000 : 600;
  if (alan.includes("mesaj")) return 600;
  if (varlikTuru === "kategori") return 60;
  return 120;
}

function kaynakHash(kaynak) {
  return createHash("sha256").update(JSON.stringify(kaynak)).digest("hex");
}

function metinleriDuzlestir(deger, yol = "", sonuc = []) {
  if (typeof deger === "string" && deger.trim()) {
    sonuc.push({ key: yol, text: deger.trim() });
    return sonuc;
  }
  if (Array.isArray(deger)) {
    deger.forEach((oge, indeks) => metinleriDuzlestir(oge, `${yol}[${indeks}]`, sonuc));
    return sonuc;
  }
  if (deger && typeof deger === "object") {
    Object.entries(deger).forEach(([anahtar, oge]) => metinleriDuzlestir(oge, yol ? `${yol}.${anahtar}` : anahtar, sonuc));
  }
  return sonuc;
}

function yolaYaz(hedef, yol, deger) {
  const parcalar = yol.replace(/\[(\d+)\]/g, ".$1").split(".");
  let mevcut = hedef;
  for (let indeks = 0; indeks < parcalar.length; indeks += 1) {
    const parca = parcalar[indeks];
    const son = indeks === parcalar.length - 1;
    if (son) {
      mevcut[parca] = deger;
      break;
    }
    const siradakiDizi = /^\d+$/.test(parcalar[indeks + 1]);
    if (mevcut[parca] == null) mevcut[parca] = siradakiDizi ? [] : {};
    mevcut = mevcut[parca];
  }
}

function yanitMetniniGetir(yanit) {
  const metin = yanit?.candidates?.[0]?.content?.parts
    ?.map((parca) => parca?.text || "")
    .join("")
    .trim();
  if (metin) return metin;
  throw new Error("Gemini boş çeviri yanıtı döndürdü.");
}

async function geminiIleCevir(varlikTuru, metinler, fetchImpl) {
  const denetleyici = new AbortController();
  const zamanlayici = setTimeout(() => denetleyici.abort(), ZAMAN_ASIMI_MS);
  try {
    const talimat = [
      "You translate Turkish restaurant and QR-menu content into natural, concise English.",
      "Preserve brand names, trademarked product names, quantities, prices, emojis, placeholders and HTML-free formatting.",
      "Use standard food-service terminology. Never add claims, ingredients or allergen information.",
      "Return exactly one translation for every key and keep every key unchanged.",
      JSON.stringify({ entity: varlikTuru, sourceLanguage: "tr", targetLanguage: "en", items: metinler }),
    ].join("\n");
    const yanit = await fetchImpl(`${GEMINI_API_KOKU}/${encodeURIComponent(MODEL)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      signal: denetleyici.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: talimat }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseJsonSchema: CEVIRI_YANIT_SEMASI,
        },
      }),
    });
    if (!yanit.ok) {
      const hataMetni = await yanit.text();
      const istekId = yanit.headers?.get?.("x-request-id") || yanit.headers?.get?.("x-guploader-uploadid");
      throw new Error(`Gemini çeviri isteği başarısız (${yanit.status})${istekId ? ` [${istekId}]` : ""}: ${hataMetni.slice(0, 500)}`);
    }
    const veri = await yanit.json();
    return JSON.parse(yanitMetniniGetir(veri)).translations;
  } finally {
    clearTimeout(zamanlayici);
  }
}

export function ceviriYapilandirmasi() {
  return {
    aktif: Boolean(process.env.GEMINI_API_KEY),
    saglayici: "gemini",
    model: MODEL,
    baslangictaTamamla: process.env.GEMINI_TRANSLATION_BACKFILL_ON_START === "true",
  };
}

async function geminiIleTekrarDeneyerekCevir(varlikTuru, metinler, fetchImpl, retryDelayMs) {
  let sonHata;
  for (let deneme = 0; deneme < 3; deneme += 1) {
    try {
      return await geminiIleCevir(varlikTuru, metinler, fetchImpl);
    } catch (hata) {
      sonHata = hata;
      if (deneme < 2 && retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (2 ** deneme)));
      }
    }
  }
  throw sonHata;
}

export async function ingilizceCeviriUret(varlikTuru, kaynak, onceki = null, { fetchImpl = fetch, retryDelayMs = 750 } = {}) {
  const hash = kaynakHash(kaynak);
  if (onceki?.kaynakHash === hash && onceki?.durum === "hazir" && onceki?.en) return onceki;
  const ayniKaynaginOncekiCevirisi = onceki?.kaynakHash === hash ? onceki?.en || {} : {};

  const metinler = metinleriDuzlestir(kaynak).slice(0, 300);
  if (!metinler.length) return { en: {}, durum: "hazir", kaynakHash: hash, guncelleme: new Date().toISOString() };
  if (!process.env.GEMINI_API_KEY) {
    return { en: ayniKaynaginOncekiCevirisi, durum: "bekliyor", kaynakHash: hash, hata: "GEMINI_API_KEY tanımlı değil.", guncelleme: new Date().toISOString() };
  }

  try {
    const ceviriler = await geminiIleTekrarDeneyerekCevir(varlikTuru, metinler, fetchImpl, retryDelayMs);
    const beklenen = new Set(metinler.map(({ key }) => key));
    const gelen = new Map(ceviriler.map(({ key, text }) => [key, String(text || "").trim()]));
    if (gelen.size !== beklenen.size || [...beklenen].some((key) => !gelen.get(key))) {
      throw new Error("AI yanıtındaki çeviri alanları eksik.");
    }
    const en = {};
    for (const { key } of metinler) {
      const sinir = metinSiniri(varlikTuru, key);
      yolaYaz(en, key, gelen.get(key).slice(0, sinir));
    }
    return { en, durum: "hazir", kaynakHash: hash, saglayici: "gemini", model: MODEL, guncelleme: new Date().toISOString() };
  } catch (hata) {
    const hataMesaji = String(hata.message || hata).slice(0, 700);
    console.error(`AI ceviri hatasi (${varlikTuru}):`, hataMesaji);
    return { en: ayniKaynaginOncekiCevirisi, durum: "hata", kaynakHash: hash, hata: hataMesaji, guncelleme: new Date().toISOString() };
  }
}

export const _test = { kaynakHash, metinleriDuzlestir, yolaYaz, yanitMetniniGetir };
