import test from "node:test";
import assert from "node:assert/strict";
import { masaPlaniOlustur, masaZekasiTablolariniHazirla, ortakTercihleriBirlestir, tercihleriDogrula } from "../masaZekasi.js";

const urunler = [
  { id: 1, ad: "Klasik Burger", fiyat: 220, kategori: "Burgerler", urunTipi: "burger", malzemeler: ["köfte", "soğan"], alerjenler: ["gluten"], aktif: true, stokta: true, populer: true },
  { id: 2, ad: "Vegan Burger", fiyat: 190, kategori: "Burgerler", urunTipi: "burger", malzemeler: ["mercimek", "marul"], alerjenler: [], aktif: true, stokta: true },
  { id: 3, ad: "Patates", fiyat: 80, kategori: "Yan Lezzetler", urunTipi: "yan_lezzet", malzemeler: ["patates"], alerjenler: [], aktif: true, stokta: true },
  { id: 4, ad: "Kola", fiyat: 60, kategori: "İçecekler", urunTipi: "icecek", malzemeler: [], alerjenler: [], aktif: true, stokta: true },
  { id: 5, ad: "Stoksuz Ayran", fiyat: 40, kategori: "İçecekler", urunTipi: "icecek", malzemeler: ["süt"], alerjenler: ["süt"], aktif: true, stokta: false },
];

test("tercih girdilerini güvenli sınırlara çeker", () => {
  const sonuc = tercihleriDogrula({ kisiSayisi: 99, butceKisi: -4, aci: 20, alerjenler: ["Gluten", "gluten"] });
  assert.equal(sonuc.kisiSayisi, 12);
  assert.equal(sonuc.butceKisi, 50);
  assert.equal(sonuc.aci, 5);
  assert.deepEqual(sonuc.alerjenler, ["gluten"]);
});

test("stok ve alerjen filtresini uygular", () => {
  const sonuc = masaPlaniOlustur({ urunler, tercihler: { kisiSayisi: 2, alerjenler: ["gluten"] } });
  const idler = sonuc.planlar.flatMap((plan) => plan.kalemler.map((kalem) => kalem.urunId));
  assert.ok(!idler.includes(1));
  assert.ok(!idler.includes(5));
  assert.ok(idler.includes(2));
});

test("vegan filtresi 'vegan' içindeki et hecesini et olarak algılamaz", () => {
  const sonuc = masaPlaniOlustur({ urunler, tercihler: { kisiSayisi: 1, beslenme: "vegan" } });
  const idler = sonuc.planlar.flatMap((plan) => plan.kalemler.map((kalem) => kalem.urunId));
  assert.ok(idler.includes(2));
  assert.ok(!idler.includes(1));
});

test("aktif kampanyayı tahmini plan fiyatına uygular", () => {
  const kampanyalar = [{ aktif: true, kampanyaTipi: "genel", indirimYuzde: 10, gecerliKategoriler: ["Burgerler"] }];
  const sonuc = masaPlaniOlustur({ urunler: [urunler[1]], kampanyalar, tercihler: { kisiSayisi: 1 }, uye: true });
  assert.equal(sonuc.planlar[0].toplam, 171);
  assert.equal(sonuc.planlar[0].kalemler[0].indirimYuzde, 10);
});

test("mutfak yoğunluğuna göre süre aralığını artırır", () => {
  const masalar = [{ kalemler: Array.from({ length: 18 }, () => ({ durum: "hazirlaniyor" })) }];
  const sonuc = masaPlaniOlustur({ urunler: [urunler[1]], masalar, tercihler: { kisiSayisi: 1 } });
  assert.equal(sonuc.ozet.mutfak.seviye, "yoğun");
  assert.ok(sonuc.ozet.mutfak.tahminiDakika.min > 10);
});

test("ortak masada katılımcı tercihlerini güvenli biçimde birleştirir", () => {
  const sonuc = ortakTercihleriBirlestir([
    { butceKisi: 300, aclik: "hafif", aci: 1, beslenme: "farketmez", alerjenler: ["gluten"], sevilmeyenler: ["sogan"] },
    { butceKisi: 500, aclik: "cok", aci: 5, beslenme: "vegan", alerjenler: ["sut"], sevilmeyenler: [] },
  ]);
  assert.equal(sonuc.kisiSayisi, 2);
  assert.equal(sonuc.butceKisi, 400);
  assert.equal(sonuc.aclik, "normal");
  assert.equal(sonuc.aci, 3);
  assert.equal(sonuc.beslenme, "vegan");
  assert.deepEqual(sonuc.alerjenler.sort(), ["gluten", "sut"]);
});

test("ortak masa tabloları işletme ve aktif masa sınırlarıyla hazırlanır", async () => {
  let sql = "";
  await masaZekasiTablolariniHazirla({ query: async (sorgu) => { sql += sorgu; return { rows: [] }; } });
  assert.match(sql, /masa_zekasi_oturumlari/);
  assert.match(sql, /masa_zekasi_katilimcilari/);
  assert.match(sql, /ON masa_zekasi_oturumlari\(isletme_id, masa_no\) WHERE durum='aktif'/);
  assert.match(sql, /UNIQUE \(oturum_id, cihaz_anahtari\)/);
});
