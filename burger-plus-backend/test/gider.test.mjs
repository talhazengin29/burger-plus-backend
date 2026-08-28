import test from "node:test";
import assert from "node:assert/strict";
import { butceVerisiniDogrula, giderTablolariniHazirla, giderVerisiniDogrula } from "../giderDb.js";

test("gider verisini para, KDV ve tarihle normalize eder", () => {
  assert.deepEqual(giderVerisiniDogrula({
    kategoriId: "4", baslik: "  Elektrik faturası ", tutar: "1.200,50",
    kdvOrani: 20, odemeYontemi: "banka", giderTarihi: "2026-08-28",
  }), {
    id: null, kategoriId: 4, tedarikciId: null, baslik: "Elektrik faturası", aciklama: "",
    tutar: 1200.5, kdvOrani: 20, kdvTutari: 200.08, odemeYontemi: "banka",
    giderTarihi: "2026-08-28", odemeTarihi: null, belgeUrl: "",
  });
});

test("vadeli giderde tedarikçi zorunludur", () => {
  assert.throws(() => giderVerisiniDogrula({ kategoriId: 1, baslik: "Mal alımı", tutar: 500, odemeYontemi: "vadeli", giderTarihi: "2026-08-28" }), /tedarikçi/i);
});

test("geçersiz tutar, KDV ve tarih reddedilir", () => {
  assert.throws(() => giderVerisiniDogrula({ baslik: "X", tutar: -1, giderTarihi: "2026-08-28" }), /Tutar/);
  assert.throws(() => giderVerisiniDogrula({ baslik: "X", tutar: 10, kdvOrani: 120, giderTarihi: "2026-08-28" }), /KDV/);
  assert.throws(() => giderVerisiniDogrula({ baslik: "X", tutar: 10, giderTarihi: "28.08.2026" }), /tarihi/i);
});

test("gider migrationı onay, kasa ve düzenli gider tablolarını birlikte kurar", async () => {
  let sorgu = "";
  await giderTablolariniHazirla({ query: async (sql) => { sorgu = sql; return { rows: [] }; } });
  assert.match(sorgu, /CREATE TABLE IF NOT EXISTS giderler/);
  assert.match(sorgu, /CREATE TABLE IF NOT EXISTS kasa_hareketleri/);
  assert.match(sorgu, /CREATE TABLE IF NOT EXISTS duzenli_giderler/);
  assert.match(sorgu, /giderler_duzenli_donem_unique/);
  assert.match(sorgu, /CREATE TABLE IF NOT EXISTS gider_butceleri/);
});

test("aylık kategori bütçelerini normalize eder", () => {
  assert.deepEqual(butceVerisiniDogrula({
    donem: "2026-08", butceler: [{ kategoriId: "2", tutar: "12.500,50" }, { kategoriId: 4, tutar: 0 }],
  }), {
    donem: "2026-08-01", butceler: [{ kategoriId: 2, tutar: 12500.5 }, { kategoriId: 4, tutar: 0 }],
  });
});

test("tekrarlı, negatif veya geçersiz dönemli bütçe reddedilir", () => {
  assert.throws(() => butceVerisiniDogrula({ donem: "2026-08", butceler: [{ kategoriId: 2, tutar: 10 }, { kategoriId: 2, tutar: 20 }] }), /tekrarlı/i);
  assert.throws(() => butceVerisiniDogrula({ donem: "2026-08", butceler: [{ kategoriId: 2, tutar: -1 }] }), /Bütçe tutarı/);
  assert.throws(() => butceVerisiniDogrula({ donem: "Ağustos", butceler: [] }), /Bütçe dönemi/);
});
