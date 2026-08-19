import test from "node:test";
import assert from "node:assert/strict";
import { degerlendirmePuaniniDogrula, siparisDegerlendirmesiOlustur } from "../degerlendirmeDb.js";

test("değerlendirme puanı yalnızca 1-5 tam sayı kabul eder", () => {
  assert.equal(degerlendirmePuaniniDogrula(5, "Ürün"), 5);
  assert.throws(() => degerlendirmePuaniniDogrula(0, "Ürün"), /1 ile 5/);
  assert.throws(() => degerlendirmePuaniniDogrula(3.5, "Ürün"), /1 ile 5/);
});

test("tamamlanmamış sipariş değerlendirilemez", async () => {
  const sorgular = [];
  const baglanti = {
    query: async (sql) => {
      sorgular.push(sql);
      if (String(sql).includes("SELECT id,siparis_no")) return { rows: [{ id: 8, siparis_no: "BP-8", urunler: [{ id: 1, ad: "Tost" }], tamamlandi: false }] };
      return { rows: [] };
    },
    release: () => {},
  };
  const pool = { connect: async () => baglanti };
  await assert.rejects(() => siparisDegerlendirmesiOlustur(1, 2, 8, {}, pool), /tamamlandıktan sonra/);
  assert.ok(sorgular.includes("ROLLBACK"));
});

