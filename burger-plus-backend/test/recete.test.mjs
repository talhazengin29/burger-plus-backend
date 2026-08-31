import test from "node:test";
import assert from "node:assert/strict";
import { hammaddeVerisiniDogrula, receteSatirlariniDogrula, receteMaliyetiHesapla } from "../receteDb.js";

test("hammadde adı, birimi ve kritik stok eşiği doğrulanır", () => {
  assert.deepEqual(hammaddeVerisiniDogrula({ ad: "  Kaşar Peyniri ", birim: "GR", minimumStok: "2500" }), {
    id: null, ad: "Kaşar Peyniri", birim: "gr", minimumStok: 2500, aktif: true,
  });
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
