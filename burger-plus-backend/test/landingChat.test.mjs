import test from "node:test";
import assert from "node:assert/strict";
import { hazirLandingCevabi, landingChatYaniti } from "../landingChat.js";

test("fiyat sorusu AI çağrısı yapmadan hazır cevap döndürür", async () => {
  let cagrildi = false;
  const sonuc = await landingChatYaniti({ mesaj: "Paket fiyatları ne kadar?" }, async () => {
    cagrildi = true;
    throw new Error("çağrılmamalı");
  });
  assert.equal(sonuc.kaynak, "hazir");
  assert.match(sonuc.cevap, /499 TL/);
  assert.equal(cagrildi, false);
});

test("boş ve aşırı uzun mesajlar reddedilir", async () => {
  assert.equal((await landingChatYaniti({ mesaj: "  " })).durum, 400);
  assert.equal((await landingChatYaniti({ mesaj: "a".repeat(601) })).durum, 400);
});

test("hazır bilgi tabanı temel başlıkları kapsar", () => {
  assert.match(hazirLandingCevabi("Uygulama indirmek gerekiyor mu?"), /gerekmez/);
  assert.match(hazirLandingCevabi("14 gün ücretsiz deneme var mı?"), /14 gün/);
  assert.match(hazirLandingCevabi("Ödeme güvenli mi?"), /iyzico/);
});

test("hazır cevap bulunamazsa Gemini structured output kullanılır", async () => {
  const oncekiAnahtar = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    const sonuc = await landingChatYaniti({ mesaj: "Sistem bana uygun olur mu?", gecmis: [] }, async (_url, secenekler) => {
      assert.equal(secenekler.headers["x-goog-api-key"], "test-key");
      const govde = JSON.parse(secenekler.body);
      assert.equal(govde.contents.at(-1).parts[0].text, "Sistem bana uygun olur mu?");
      return {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: "İşletmenizin yapısına göre birlikte değerlendirebiliriz." }) }] } }] }),
      };
    });
    assert.equal(sonuc.kaynak, "ai");
    assert.match(sonuc.cevap, /değerlendirebiliriz/);
  } finally {
    if (oncekiAnahtar === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oncekiAnahtar;
  }
});
