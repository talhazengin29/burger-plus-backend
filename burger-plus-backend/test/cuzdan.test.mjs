import test from "node:test";
import assert from "node:assert/strict";
import { bonusKurusunuHesapla, paraKurusunaCevir } from "../cuzdanDb.js";

test("para tutarı kuruşa kayan nokta hatası olmadan çevrilir", () => {
  assert.equal(paraKurusunaCevir("100"), 10_000);
  assert.equal(paraKurusunaCevir("125,50"), 12_550);
  assert.equal(paraKurusunaCevir("0.99"), 99);
});

test("nakit yükleme bonusu kuruş üzerinden hesaplanır", () => {
  assert.equal(bonusKurusunuHesapla(10_000, 5), 500);
  assert.equal(bonusKurusunuHesapla(12_550, 7.5), 941);
  assert.equal(bonusKurusunuHesapla(10_000, 0), 0);
});

test("hatalı para formatları reddedilir", () => {
  assert.throws(() => paraKurusunaCevir("-10"));
  assert.throws(() => paraKurusunaCevir("10.999"));
  assert.throws(() => paraKurusunaCevir("abc"));
});
