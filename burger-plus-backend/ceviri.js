import { createHash } from "node:crypto";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_TRANSLATION_MODEL || "gpt-5-mini";
const ZAMAN_ASIMI_MS = 20_000;

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
  if (typeof yanit.output_text === "string" && yanit.output_text) return yanit.output_text;
  for (const oge of yanit.output || []) {
    for (const icerik of oge.content || []) {
      if (icerik.type === "output_text" && icerik.text) return icerik.text;
    }
  }
  throw new Error("OpenAI boş çeviri yanıtı döndürdü.");
}

async function openAiIleCevir(varlikTuru, metinler, fetchImpl) {
  const denetleyici = new AbortController();
  const zamanlayici = setTimeout(() => denetleyici.abort(), ZAMAN_ASIMI_MS);
  try {
    const yanit = await fetchImpl(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: denetleyici.signal,
      body: JSON.stringify({
        model: MODEL,
        store: false,
        instructions: [
          "You translate Turkish restaurant and QR-menu content into natural, concise English.",
          "Preserve brand names, product names that are trademarks, quantities, prices, emojis, placeholders and HTML-free formatting.",
          "Use standard food-service terminology. Never add claims, ingredients or allergen information.",
          "Return exactly one translation for every key and keep every key unchanged.",
        ].join(" "),
        input: JSON.stringify({ entity: varlikTuru, sourceLanguage: "tr", targetLanguage: "en", items: metinler }),
        text: {
          format: {
            type: "json_schema",
            name: "restaurant_translation",
            strict: true,
            schema: {
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
            },
          },
        },
      }),
    });
    if (!yanit.ok) {
      const hataMetni = await yanit.text();
      throw new Error(`OpenAI çeviri isteği başarısız (${yanit.status}): ${hataMetni.slice(0, 300)}`);
    }
    const veri = await yanit.json();
    return JSON.parse(yanitMetniniGetir(veri)).translations;
  } finally {
    clearTimeout(zamanlayici);
  }
}

export function ceviriYapilandirmasi() {
  return {
    aktif: Boolean(process.env.OPENAI_API_KEY),
    model: MODEL,
    baslangictaTamamla: process.env.OPENAI_TRANSLATION_BACKFILL_ON_START === "true",
  };
}

async function openAiIleTekrarDeneyerekCevir(varlikTuru, metinler, fetchImpl, retryDelayMs) {
  let sonHata;
  for (let deneme = 0; deneme < 3; deneme += 1) {
    try {
      return await openAiIleCevir(varlikTuru, metinler, fetchImpl);
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
  if (!process.env.OPENAI_API_KEY) {
    return { en: ayniKaynaginOncekiCevirisi, durum: "bekliyor", kaynakHash: hash, hata: "OPENAI_API_KEY tanımlı değil.", guncelleme: new Date().toISOString() };
  }

  try {
    const ceviriler = await openAiIleTekrarDeneyerekCevir(varlikTuru, metinler, fetchImpl, retryDelayMs);
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
    return { en, durum: "hazir", kaynakHash: hash, model: MODEL, guncelleme: new Date().toISOString() };
  } catch (hata) {
    return { en: ayniKaynaginOncekiCevirisi, durum: "hata", kaynakHash: hash, hata: String(hata.message || hata).slice(0, 500), guncelleme: new Date().toISOString() };
  }
}

export const _test = { kaynakHash, metinleriDuzlestir, yolaYaz, yanitMetniniGetir };
