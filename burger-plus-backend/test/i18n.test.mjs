import test from "node:test";
import assert from "node:assert/strict";
import { i18nDogrulama, i18nHazirlikRaporuGetir } from "../i18nDb.js";

test("i18n anahtari ve dili yalnizca izin verilen bicimleri kabul eder", () => {
  assert.equal(i18nDogrulama.diliDogrula("EN"), "en");
  assert.equal(i18nDogrulama.anahtariDogrula("orders.productCount_other"), "orders.productCount_other");
  assert.throws(() => i18nDogrulama.diliDogrula("de"));
  assert.throws(() => i18nDogrulama.anahtariDogrula("<script>"));
});

test("i18n degeri calistirilabilir icerikten temizlenir", () => {
  assert.equal(i18nDogrulama.degeriTemizle("<b>Hello</b> javascript: alert"), "Hello alert");
  assert.equal(i18nDogrulama.degeriTemizle("  Table   {number}  "), "Table {number}");
});

test("English, dinamik isletme metinleri DB'de yayinlanmadan hazir sayilmaz", async () => {
  const cevaplar = {
    "FROM isletmeler": [{ konsept: "burger", tema: {} }],
    "FROM kategoriler": [{ id: 7, ad: "Tostlar", ceviriler: {} }],
    "FROM urunler": [{ id: 9, ad: "Atom Tost", aciklama: "Ozel atom ekmegi", ceviriler: {}, malzemeler: [], alerjenler: [], gramaj_opsiyonu: null, boyut_secenekleri: [], ekstra_malzeme_ayari: {} }],
    "FROM kampanyalar": [],
    "FROM duyurular": [],
    "FROM sistem_ayarlari": [],
    "FROM i18n_sozluk": [],
  };
  const pool = { query: async (sql) => ({ rows: Object.entries(cevaplar).find(([parca]) => sql.includes(parca))?.[1] || [] }) };
  const rapor = await i18nHazirlikRaporuGetir(pool, 1, "en");
  assert.equal(rapor.hazir, false);
  assert.ok(rapor.eksikler.some((kayit) => kayit.anahtar === "category.7.name"));
  assert.ok(rapor.eksikler.some((kayit) => kayit.anahtar === "product.9.name"));
});
