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
