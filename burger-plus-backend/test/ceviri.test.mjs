import test from "node:test";
import assert from "node:assert/strict";
import { ingilizceCeviriUret, _test } from "../ceviri.js";

test("çeviri kaynağını kararlı anahtarlarla düzleştirip geri kurar", () => {
  const kaynak = { ad: "Acılı Burger", malzemeler: ["Dana köfte", "Acı sos"] };
  assert.deepEqual(_test.metinleriDuzlestir(kaynak), [
    { key: "ad", text: "Acılı Burger" },
    { key: "malzemeler[0]", text: "Dana köfte" },
    { key: "malzemeler[1]", text: "Acı sos" },
  ]);
  const hedef = {};
  _test.yolaYaz(hedef, "malzemeler[1]", "Hot sauce");
  assert.equal(hedef.malzemeler[1], "Hot sauce");
});

test("API anahtarı yoksa Türkçe kaydı engellemeden bekliyor durumuna geçer", async () => {
  const oncekiAnahtar = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const sonuc = await ingilizceCeviriUret("kategori", { ad: "Burgerler" });
    assert.equal(sonuc.durum, "bekliyor");
    assert.deepEqual(sonuc.en, {});
  } finally {
    if (oncekiAnahtar) process.env.OPENAI_API_KEY = oncekiAnahtar;
  }
});

test("Türkçe kaynak değiştiyse eski İngilizceyi göstermeyip güvenli fallback kullanır", async () => {
  const oncekiAnahtar = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const sonuc = await ingilizceCeviriUret("urun", { ad: "Yeni ürün" }, {
      en: { ad: "Old product" }, durum: "hazir", kaynakHash: "eski-hash",
    });
    assert.equal(sonuc.durum, "bekliyor");
    assert.deepEqual(sonuc.en, {});
  } finally {
    if (oncekiAnahtar) process.env.OPENAI_API_KEY = oncekiAnahtar;
  }
});

test("OpenAI Structured Output yanıtını saklanabilir İngilizce nesnesine dönüştürür", async () => {
  const oncekiAnahtar = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  let istekGovdesi;
  const fetchImpl = async (_url, ayarlar) => {
    istekGovdesi = JSON.parse(ayarlar.body);
    return {
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({ translations: [
          { key: "ad", text: "Spicy Burger" },
          { key: "malzemeler[0]", text: "Beef patty" },
        ] }) }] }],
      }),
    };
  };
  try {
    const sonuc = await ingilizceCeviriUret("urun", { ad: "Acılı Burger", malzemeler: ["Dana köfte"] }, null, { fetchImpl });
    assert.equal(sonuc.durum, "hazir");
    assert.deepEqual(sonuc.en, { ad: "Spicy Burger", malzemeler: ["Beef patty"] });
    assert.equal(istekGovdesi.store, false);
    assert.equal(istekGovdesi.text.format.type, "json_schema");
  } finally {
    if (oncekiAnahtar) process.env.OPENAI_API_KEY = oncekiAnahtar;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("aynı kaynak için hazır çeviriyi tekrar API'ye göndermez", async () => {
  const kaynak = { ad: "Patates" };
  const oncekiAnahtar = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const ilk = await ingilizceCeviriUret("urun", kaynak, null, { fetchImpl: async () => ({
      ok: true,
      json: async () => ({ output_text: JSON.stringify({ translations: [{ key: "ad", text: "Fries" }] }) }),
    }) });
    let cagrildi = false;
    const ikinci = await ingilizceCeviriUret("urun", kaynak, ilk, { fetchImpl: async () => { cagrildi = true; } });
    assert.equal(cagrildi, false);
    assert.deepEqual(ikinci, ilk);
  } finally {
    if (oncekiAnahtar) process.env.OPENAI_API_KEY = oncekiAnahtar;
    else delete process.env.OPENAI_API_KEY;
  }
});
