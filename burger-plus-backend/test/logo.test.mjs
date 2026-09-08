import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { logoGorseliniStandartlastir, rasterGorseliGuvenliWebpYap } from "../storage.js";

test("logo standart 2.7:1 şeffaf WebP tuvaline yerleştirilir", async () => {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="500">
      <rect x="250" y="180" width="400" height="140" rx="30" fill="#ff6b00" />
    </svg>
  `);
  const sonuc = await logoGorseliniStandartlastir(svg);
  const bilgi = await sharp(sonuc).metadata();

  assert.equal(bilgi.format, "webp");
  assert.equal(bilgi.width, 1080);
  assert.equal(bilgi.height, 400);
  assert.equal(bilgi.hasAlpha, true);
});

test("bozuk logo verisi reddedilir", async () => {
  await assert.rejects(
    () => logoGorseliniStandartlastir(Buffer.from("logo-degil")),
    /Logo işlenemedi/,
  );
});

test("yüklenen raster görsel güvenli ve sınırlı WebP olarak yeniden kodlanır", async () => {
  const kaynak = await sharp({
    create: { width: 3200, height: 1800, channels: 3, background: "#ff6b00" },
  }).jpeg({ quality: 90 }).toBuffer();

  const sonuc = await rasterGorseliGuvenliWebpYap(kaynak);
  const bilgi = await sharp(sonuc).metadata();

  assert.equal(bilgi.format, "webp");
  assert.equal(bilgi.width, 2400);
  assert.equal(bilgi.height, 1350);
  assert.equal(bilgi.exif, undefined);
});

test("bozuk raster görsel yeniden kodlama aşamasında reddedilir", async () => {
  await assert.rejects(
    () => rasterGorseliGuvenliWebpYap(Buffer.from("gorsel-degil")),
    /işlenemedi/,
  );
});
