import test from "node:test";
import assert from "node:assert/strict";
import { basvuruDurumunuTemizle, basvuruIpOzeti, basvuruVerisiniTemizle } from "../basvuruDb.js";

const gecerli = {
  adSoyad: "  Talha   Zengin ",
  isletmeAdi: " Menüle Cafe ",
  telefon: "+90 552 285 55 61",
  email: "TEST@EXAMPLE.COM",
  masaSayisi: "12",
  paket: "Profesyonel",
  mesaj: "Kurulum hakkında bilgi istiyorum.",
  kvkkOnay: true,
  website: "",
  istekAnahtari: "123e4567-e89b-42d3-a456-426614174000",
  formSuresiMs: 2500,
};

test("landing başvurusu normalize edilir", () => {
  const sonuc = basvuruVerisiniTemizle(gecerli);
  assert.equal(sonuc.adSoyad, "Talha Zengin");
  assert.equal(sonuc.telefon, "905522855561");
  assert.equal(sonuc.email, "test@example.com");
  assert.equal(sonuc.masaSayisi, 12);
});

test("honeypot dolduran bot ayrıntı vermeden kabul edilmiş görünür", () => {
  assert.deepEqual(basvuruVerisiniTemizle({ ...gecerli, website: "https://spam.example" }), { bot: true });
});

test("çok hızlı ve onaysız başvuru reddedilir", () => {
  assert.throws(() => basvuruVerisiniTemizle({ ...gecerli, formSuresiMs: 100 }), /çok hızlı/);
  assert.throws(() => basvuruVerisiniTemizle({ ...gecerli, kvkkOnay: false }), /KVKK/);
});

test("yalnızca izin verilen satış durumları kabul edilir", () => {
  assert.equal(basvuruDurumunuTemizle("TEKLIF_VERILDI"), "teklif_verildi");
  assert.throws(() => basvuruDurumunuTemizle("silindi"), /geçersiz/);
});

test("IP özeti kararlı ve tuza bağlıdır", () => {
  const ilk = basvuruIpOzeti("127.0.0.1", "a");
  assert.equal(ilk.length, 64);
  assert.equal(ilk, basvuruIpOzeti("127.0.0.1", "a"));
  assert.notEqual(ilk, basvuruIpOzeti("127.0.0.1", "b"));
});
