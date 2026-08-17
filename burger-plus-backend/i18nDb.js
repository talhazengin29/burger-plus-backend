const DESTEKLENEN_DILLER = new Set(["tr", "en"]);
const ANAHTAR_DESENI = /^[a-z][a-z0-9]*(?:\.[a-zA-Z0-9]+)*(?:_(?:one|other))?$/;

function tenantId(isletmeId) {
  const id = Number(isletmeId);
  if (!Number.isInteger(id) || id < 1) throw new Error("İşletme bilgisi geçersiz.");
  return id;
}

function diliDogrula(dil) {
  const temiz = String(dil || "").trim().toLowerCase();
  if (!DESTEKLENEN_DILLER.has(temiz)) throw new Error("Desteklenmeyen dil.");
  return temiz;
}

function anahtariDogrula(anahtar) {
  const temiz = String(anahtar || "").trim().slice(0, 160);
  if (!ANAHTAR_DESENI.test(temiz)) throw new Error(`Geçersiz sözlük anahtarı: ${temiz || "(boş)"}`);
  return temiz;
}

function degeriTemizle(deger) {
  return [...String(deger || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()].slice(0, 1000).join("");
}

export async function i18nTablosunuHazirla(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS i18n_sozluk (
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      dil VARCHAR(5) NOT NULL,
      anahtar VARCHAR(160) NOT NULL,
      deger TEXT NOT NULL,
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (isletme_id, dil, anahtar),
      CHECK (dil IN ('tr','en')),
      CHECK (char_length(deger) BETWEEN 1 AND 1000)
    );
    CREATE INDEX IF NOT EXISTS i18n_sozluk_isletme_dil_idx ON i18n_sozluk(isletme_id,dil);
  `);
}

export async function i18nSozlugunuGetir(pool, isletmeId, dil) {
  const sonuc = await pool.query(
    "SELECT anahtar,deger,guncelleme FROM i18n_sozluk WHERE isletme_id=$1 AND dil=$2 ORDER BY anahtar",
    [tenantId(isletmeId), diliDogrula(dil)]
  );
  return {
    sozluk: Object.fromEntries(sonuc.rows.map((satir) => [satir.anahtar, satir.deger])),
    guncelleme: sonuc.rows.reduce((son, satir) => !son || satir.guncelleme > son ? satir.guncelleme : son, null),
  };
}

export async function i18nTumSozlukleriGetir(pool, isletmeId) {
  const sonuc = await pool.query(
    "SELECT dil,anahtar,deger,guncelleme FROM i18n_sozluk WHERE isletme_id=$1 ORDER BY anahtar,dil",
    [tenantId(isletmeId)]
  );
  const sozlukler = { tr: {}, en: {} };
  for (const satir of sonuc.rows) sozlukler[satir.dil][satir.anahtar] = satir.deger;
  return { sozlukler, kayitSayisi: sonuc.rows.length };
}

export async function i18nSozlugunuKaydet(pool, isletmeId, girdi) {
  const id = tenantId(isletmeId);
  const sozlukler = girdi?.sozlukler;
  if (!sozlukler || typeof sozlukler !== "object" || Array.isArray(sozlukler)) throw new Error("Sözlük verisi geçersiz.");
  const islemler = [];
  for (const [hamDil, hamSozluk] of Object.entries(sozlukler)) {
    const dil = diliDogrula(hamDil);
    if (!hamSozluk || typeof hamSozluk !== "object" || Array.isArray(hamSozluk)) throw new Error(`${dil} sözlüğü geçersiz.`);
    for (const [hamAnahtar, hamDeger] of Object.entries(hamSozluk)) {
      islemler.push({ dil, anahtar: anahtariDogrula(hamAnahtar), deger: degeriTemizle(hamDeger) });
    }
  }
  if (islemler.length > 1000) throw new Error("Tek istekte en fazla 1000 sözlük kaydı güncellenebilir.");
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    for (const kayit of islemler) {
      if (!kayit.deger) {
        await baglanti.query("DELETE FROM i18n_sozluk WHERE isletme_id=$1 AND dil=$2 AND anahtar=$3", [id, kayit.dil, kayit.anahtar]);
      } else {
        await baglanti.query(
          `INSERT INTO i18n_sozluk (isletme_id,dil,anahtar,deger) VALUES ($1,$2,$3,$4)
           ON CONFLICT (isletme_id,dil,anahtar) DO UPDATE SET deger=EXCLUDED.deger,guncelleme=NOW()`,
          [id, kayit.dil, kayit.anahtar, kayit.deger]
        );
      }
    }
    await baglanti.query("COMMIT");
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
  return i18nTumSozlukleriGetir(pool, id);
}

export const i18nDogrulama = { diliDogrula, anahtariDogrula, degeriTemizle };
