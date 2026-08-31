import test from "node:test";
import assert from "node:assert/strict";
import { hammaddeVerisiniDogrula, receteSatirlariniDogrula, receteMaliyetiHesapla, siparisUrunAdetleriniTopla } from "../receteDb.js";

test("hammadde adı, birimi ve kritik stok eşiği doğrulanır", () => {
  assert.deepEqual(hammaddeVerisiniDogrula({ ad: "  Kaşar Peyniri ", birim: "GR", minimumStok: "2500" }), {
    id: null, ad: "Kaşar Peyniri", birim: "gr", minimumStok: 2500, musteriyeGoster: false, musteriAdi: "", aktif: true,
  });
  assert.deepEqual(hammaddeVerisiniDogrula({ ad: "Dana eti 120 gr", birim: "gr", musteriyeGoster: true, musteriAdi: "Dana köfte" }), {
    id: null, ad: "Dana eti 120 gr", birim: "gr", minimumStok: 0, musteriyeGoster: true, musteriAdi: "Dana köfte", aktif: true,
  });
  assert.equal(hammaddeVerisiniDogrula({ ad: "Domates", birim: "adet", musteriyeGoster: true }).musteriAdi, "Domates");
  assert.throws(() => hammaddeVerisiniDogrula({ ad: "X", birim: "kg" }), /adı/);
});

test("reçetede aynı hammadde iki kez kullanılamaz", () => {
  assert.throws(() => receteSatirlariniDogrula([
    { hammaddeId: 2, miktar: 80, fireOrani: 5 },
    { hammaddeId: 2, miktar: 20, fireOrani: 0 },
  ]), /iki kez/);
});

test("reçete maliyeti miktar, fire ve ortalama birim maliyetten hesaplanır", () => {
  const maliyet = receteMaliyetiHesapla([
    { miktar: 100, fireOrani: 5, birimMaliyet: 0.3 },
    { miktar: 2, fireOrani: 0, birimMaliyet: 4.5 },
  ]);
  assert.equal(maliyet, 40.5);
});

test("tek ürün reçetesi sipariş adedi kadar tüketilir", () => {
  assert.deepEqual([...siparisUrunAdetleriniTopla([{ id: 10, adet: 1 }])], [[10, 1]]);
  assert.deepEqual([...siparisUrunAdetleriniTopla([{ id: 10, adet: 3 }])], [[10, 3]]);
});

test("menü sanal ürünü sayılmaz, yalnızca tekil bileşenleri tüketilir", () => {
  const sonuc = siparisUrunAdetleriniTopla([{ id: 99, adet: 1, secimler: {
    menuBurgerId: 10, yanLezzetId: 20, icecekId: 30,
  } }]);
  assert.deepEqual([...sonuc], [[10, 1], [20, 1], [30, 1]]);
  assert.equal(sonuc.has(99), false);
  assert.deepEqual([...siparisUrunAdetleriniTopla([{ id: 99, adet: 1, secimler: {
    menuBurgerId: 10, yanLezzetId: 10, icecekId: 30,
  } }])], [[10, 1], [30, 1]]);
});
