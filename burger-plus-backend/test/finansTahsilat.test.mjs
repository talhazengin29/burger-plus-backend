import test from "node:test";
import assert from "node:assert/strict";
import { finansRaporunuGetir } from "../giderDb.js";

// finansRaporunuGetir, yedi sorguyu Promise.all icinde sabit sirada acar:
// 0 gelir ozeti, 1 gider ozeti, 2 gunluk, 3 aylik, 4 kategori, 5 butce, 6 tahsilat.
const TAHSILAT_SORGUSU = 6;
const ODEME_ISLEMLERI_SORGULARI = [0, 2, 3, TAHSILAT_SORGUSU];
const GIDER_SORGULARI = [1, 4, 5];

function sahteHavuz(tahsilatSatirlari = []) {
  const yanitlar = [
    { rows: [{ ciro: "1850.00", siparis: 12, ortalama_sepet: "154.17" }] },
    { rows: [{ gider: "400.00", kdv: "80.00", kayit: 3 }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: tahsilatSatirlari },
  ];
  let sira = 0;
  const sorgular = [];
  return {
    sorgular,
    query: async (sql) => {
      sorgular.push(sql);
      return yanitlar[sira++];
    },
  };
}

test("tahsilat kanallari odeme araci (saglayici) bazinda gruplanir", async () => {
  const havuz = sahteHavuz([
    { saglayici: "nakit", adet: 7, tutar: "1100.00" },
    { saglayici: "iyzico", adet: 5, tutar: "750.00" },
  ]);

  const rapor = await finansRaporunuGetir(1, havuz, {});

  // Odemenin bolusme sekli (tam/esit/urun) tahsilat araci degildir.
  assert.match(havuz.sorgular[TAHSILAT_SORGUSU], /GROUP BY saglayici/);
  assert.doesNotMatch(havuz.sorgular[TAHSILAT_SORGUSU], /GROUP BY yontem/);
  assert.deepEqual(rapor.odemeYontemleri, [
    { saglayici: "nakit", adet: 7, tutar: 1100 },
    { saglayici: "iyzico", adet: 5, tutar: 750 },
  ]);
});

test("gercek para getirmeyen saglayicilar ciro, siparis sayisi ve tahsilat disinda kalir", async () => {
  const havuz = sahteHavuz();

  await finansRaporunuGetir(1, havuz, {});

  // 'simulasyon' gercek tahsilat degil; 'odul' puanla alinan hediyedir ve tutari
  // her zaman 0 oldugu icin ortalama sepeti seyreltir, siparis sayisini sisirir.
  for (const indeks of ODEME_ISLEMLERI_SORGULARI) {
    assert.match(
      havuz.sorgular[indeks],
      /saglayici NOT IN \('simulasyon','odul'\)/,
      `${indeks}. sorgu odeme_islemleri okuyor ama tahsilat filtresi tasimiyor`,
    );
  }
  // Gider sorgulari odeme_islemleri tablosuna hic bakmaz.
  for (const indeks of GIDER_SORGULARI) {
    assert.doesNotMatch(havuz.sorgular[indeks], /saglayici/);
  }
});

test("ozet ve gunluk gelir ayni tahsilat tanimini kullanir", async () => {
  const havuz = sahteHavuz();

  await finansRaporunuGetir(1, havuz, {});

  // Ozet ciro ile gunluk grafigin toplami ayni kumeden gelmezse panelde
  // birbirini tutmayan iki ciro sayisi olusur.
  const filtre = /durum='basarili' AND saglayici NOT IN \('simulasyon','odul'\)/;
  assert.match(havuz.sorgular[0], filtre);
  assert.match(havuz.sorgular[2], filtre);
  assert.match(havuz.sorgular[3], filtre);
});
