import test from "node:test";
import assert from "node:assert/strict";
import { masaTokeniUret, masaTokeniniDogrula } from "../masaErisim.js";

const SECRET = "test-icin-en-az-32-karakterli-masa-anahtari";

test("masa erisim tokeni dogru isletme ve masa icin gecerlidir", () => {
  const token = masaTokeniUret(SECRET, 7, "12");

  assert.equal(masaTokeniniDogrula(SECRET, token, 7, "12"), true);
});

test("masa erisim tokeni baska masa veya isletmede kullanilamaz", () => {
  const token = masaTokeniUret(SECRET, 7, "12");

  assert.equal(masaTokeniniDogrula(SECRET, token, 7, "13"), false);
  assert.equal(masaTokeniniDogrula(SECRET, token, 8, "12"), false);
  assert.equal(masaTokeniniDogrula(`${SECRET}-baska`, token, 7, "12"), false);
  assert.equal(masaTokeniniDogrula(SECRET, "gecersiz", 7, "12"), false);
});
