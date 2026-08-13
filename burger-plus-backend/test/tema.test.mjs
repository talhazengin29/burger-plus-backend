import assert from "node:assert/strict";
import test from "node:test";
import { temaCoz, temaGirdisiniTemizle } from "../konseptler.js";

test("işletmeye özel logo boyutu güvenli aralıkta saklanır ve çözülür", () => {
  const temiz = temaGirdisiniTemizle({ konsept: "burger", logoOlcegi: 145 }, { konsept: "burger", tema: {} });
  assert.equal(temiz.tema.logoOlcegi, 145);
  assert.equal(temaCoz({ konsept: "burger", tema: temiz.tema }).logoOlcegi, 145);
});

test("geçersiz logo boyutu reddedilir", () => {
  assert.throws(
    () => temaGirdisiniTemizle({ konsept: "burger", logoOlcegi: 181 }, { konsept: "burger", tema: {} }),
    /Logo boyutu/,
  );
});

test("işletmeye özel logo konumu güvenli aralıkta saklanır ve çözülür", () => {
  const temiz = temaGirdisiniTemizle(
    { konsept: "burger", logoKonumX: -42, logoKonumY: 12 },
    { konsept: "burger", tema: {} },
  );
  assert.equal(temiz.tema.logoKonumX, -42);
  assert.equal(temiz.tema.logoKonumY, 12);
  assert.equal(temaCoz({ konsept: "burger", tema: temiz.tema }).logoKonumX, -42);
  assert.equal(temaCoz({ konsept: "burger", tema: temiz.tema }).logoKonumY, 12);
});

test("geçersiz logo konumu reddedilir", () => {
  assert.throws(
    () => temaGirdisiniTemizle({ konsept: "burger", logoKonumX: 81 }, { konsept: "burger", tema: {} }),
    /yatay konumu/,
  );
  assert.throws(
    () => temaGirdisiniTemizle({ konsept: "burger", logoKonumY: -31 }, { konsept: "burger", tema: {} }),
    /dikey konumu/,
  );
});

test("işletme müşteri uygulamasını aydınlık veya koyu seçebilir", () => {
  const acik = temaGirdisiniTemizle({ konsept: "cafe", gorunum: "acik" }, { konsept: "cafe", tema: {} });
  assert.equal(acik.tema.gorunum, "acik");
  assert.equal(temaCoz({ konsept: "cafe", tema: acik.tema }).gorunum, "acik");
  assert.equal(temaCoz({ konsept: "cafe", tema: {} }).gorunum, "koyu");
});

test("geçersiz uygulama görünümü reddedilir", () => {
  assert.throws(
    () => temaGirdisiniTemizle({ konsept: "burger", gorunum: "otomatik" }, { konsept: "burger", tema: {} }),
    /görünümü/,
  );
});
