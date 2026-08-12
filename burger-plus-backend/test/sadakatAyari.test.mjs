import test from "node:test";
import assert from "node:assert/strict";
import { sadakatAyariniGetir } from "../sadakatDb.js";

const veritabani = (deger) => ({ query: async () => ({ rows: deger == null ? [] : [{ deger }] }) });

test("sadakat ayari bulunamazsa guvenli varsayilanlar doner", async () => {
  const ayar = await sadakatAyariniGetir(3, veritabani(null));
  assert.equal(ayar.aktif, true);
  assert.equal(ayar.hedefAdet, 5);
  assert.equal(ayar.kategori, "Burgerler");
  assert.equal(ayar.odulKodu, "ye-kazan-burger");
});

test("isletmeye ozel damga karti ayari donusturulur", async () => {
  const ayar = await sadakatAyariniGetir(9, veritabani({
    aktif: false, hedefAdet: 8, kategori: "Kahveler", odulUrunId: 42,
    odulMetni: "Filtre kahve hediye", kartEtiketi: "KAHVE KULUBU",
    baslik: "Sekiz kahvede bizden", damgaBirimi: "kahve", ikon: "☕",
  }));
  assert.equal(ayar.aktif, false);
  assert.equal(ayar.hedefAdet, 8);
  assert.equal(ayar.odulUrunId, 42);
  assert.equal(ayar.damgaBirimi, "kahve");
  assert.equal(ayar.ikon, "☕");
});
