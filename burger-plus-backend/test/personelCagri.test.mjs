import test from "node:test";
import assert from "node:assert/strict";
import {
  personelCagriNedeniniTemizle,
  personelCagriDurumunuTemizle,
  CAGRI_BEKLEME_SANIYESI,
  CAGRI_PENCERE_LIMITI,
} from "../personelCagriDb.js";

test("yalnızca tanımlı personel çağrı nedenlerini kabul eder", () => {
  assert.equal(personelCagriNedeniniTemizle(" HESAP "), "hesap");
  assert.throws(() => personelCagriNedeniniTemizle("deneme"), /geçersiz/i);
});

test("müşteri tarafından durum uydurulamaz", () => {
  assert.equal(personelCagriDurumunuTemizle("goruldu"), "goruldu");
  assert.throws(() => personelCagriDurumunuTemizle("bekliyor"), /geçersiz/i);
});

test("spam koruma sınırları devre dışı bırakılamaz", () => {
  assert.equal(CAGRI_BEKLEME_SANIYESI, 60);
  assert.equal(CAGRI_PENCERE_LIMITI, 3);
});
