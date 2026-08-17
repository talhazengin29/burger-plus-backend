import test from "node:test";
import assert from "node:assert/strict";
import { sikayetVerisiniTemizle, sikayetDurumunuTemizle } from "../sikayetDb.js";

const gecerli = {
  kategori: "siparis",
  baslik: "Siparişim eksik geldi",
  aciklama: "Siparişimde belirttiğim ürünlerden biri pakette bulunmuyordu.",
  istekAnahtari: "5f50e9d0-96bc-4b29-bf30-ad949863e4f1",
};

test("şikayet alanlarını sınırlar ve temizler", () => {
  const sonuc = sikayetVerisiniTemizle({ ...gecerli, baslik: "  Siparişim   eksik geldi  " });
  assert.equal(sonuc.baslik, "Siparişim eksik geldi");
  assert.equal(sonuc.kategori, "siparis");
});

test("kısa açıklama ve geçersiz kategori reddedilir", () => {
  assert.throws(() => sikayetVerisiniTemizle({ ...gecerli, aciklama: "çok kısa" }), /20 karakter/i);
  assert.throws(() => sikayetVerisiniTemizle({ ...gecerli, kategori: "bilinmeyen" }), /kategori/i);
});

test("yönetici yalnızca tanımlı durumları kullanabilir", () => {
  assert.equal(sikayetDurumunuTemizle("inceleniyor"), "inceleniyor");
  assert.throws(() => sikayetDurumunuTemizle("silindi"), /durumu geçersiz/i);
});
