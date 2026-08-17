import test from "node:test";
import assert from "node:assert/strict";
import { i18nDogrulama } from "../i18nDb.js";

test("i18n anahtarı ve dili yalnızca izin verilen biçimleri kabul eder", () => {
  assert.equal(i18nDogrulama.diliDogrula("EN"), "en");
  assert.equal(i18nDogrulama.anahtariDogrula("orders.productCount_other"), "orders.productCount_other");
  assert.throws(() => i18nDogrulama.diliDogrula("de"));
  assert.throws(() => i18nDogrulama.anahtariDogrula("<script>"));
});

test("i18n değeri çalıştırılabilir içerikten temizlenir", () => {
  assert.equal(i18nDogrulama.degeriTemizle("<b>Hello</b> javascript: alert"), "Hello alert");
  assert.equal(i18nDogrulama.degeriTemizle("  Table   {number}  "), "Table {number}");
});
