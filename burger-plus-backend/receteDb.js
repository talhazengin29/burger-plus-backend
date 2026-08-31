import { randomUUID } from "crypto";

const BIRIMLER = new Set(["gr", "ml", "adet"]);
const UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tenantId(isletmeId) {
  const id = Number(isletmeId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("İşletme bilgisi geçersiz.");
  return id;
}

function pozitifSayi(deger, alan, ustSinir = 1_000_000_000) {
  const sayi = Number(deger);
  if (!Number.isFinite(sayi) || sayi <= 0 || sayi > ustSinir) throw new Error(`${alan} geçersiz.`);
  return Number(sayi.toFixed(4));
}

function negatifOlmayanSayi(deger, alan, ustSinir = 1_000_000_000) {
  const sayi = Number(deger ?? 0);
  if (!Number.isFinite(sayi) || sayi < 0 || sayi > ustSinir) throw new Error(`${alan} geçersiz.`);
  return Number(sayi.toFixed(4));
}

export function hammaddeVerisiniDogrula(veri = {}) {
  const ad = String(veri.ad || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const birim = String(veri.birim || "").trim().toLowerCase();
  if (ad.length < 2) throw new Error("Hammadde adı en az 2 karakter olmalıdır.");
  if (!BIRIMLER.has(birim)) throw new Error("Hammadde birimi gr, ml veya adet olmalıdır.");
  return {
    id: veri.id == null || veri.id === "" ? null : Number(veri.id),
    ad,
    birim,
    minimumStok: negatifOlmayanSayi(veri.minimumStok, "Minimum stok"),
    aktif: veri.aktif !== false,
  };
}

export function receteSatirlariniDogrula(satirlar = []) {
  if (!Array.isArray(satirlar)) throw new Error("Reçete satırları geçersiz.");
  if (satirlar.length > 100) throw new Error("Bir ürüne en fazla 100 hammadde bağlanabilir.");
  const gorulen = new Set();
  return satirlar.map((satir) => {
    const hammaddeId = Number(satir?.hammaddeId);
    const miktar = pozitifSayi(satir?.miktar, "Reçete miktarı");
    const fireOrani = negatifOlmayanSayi(satir?.fireOrani, "Fire oranı", 100);
    if (!Number.isSafeInteger(hammaddeId) || hammaddeId < 1) throw new Error("Reçete hammaddesi geçersiz.");
    if (gorulen.has(hammaddeId)) throw new Error("Aynı hammadde reçeteye iki kez eklenemez.");
    gorulen.add(hammaddeId);
    return { hammaddeId, miktar, fireOrani };
  });
}

export function receteMaliyetiHesapla(satirlar = []) {
  return Number(satirlar.reduce((toplam, satir) => {
    const miktar = Number(satir.miktar || 0);
    const fire = Number(satir.fireOrani || 0);
    const birimMaliyet = Number(satir.birimMaliyet || 0);
    return toplam + miktar * (1 + fire / 100) * birimMaliyet;
  }, 0).toFixed(2));
}

export async function receteTablolariniHazirla(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hammaddeler (
      id BIGSERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      ad TEXT NOT NULL,
      birim TEXT NOT NULL CHECK (birim IN ('gr','ml','adet')),
      stok_miktari NUMERIC(16,4) NOT NULL DEFAULT 0,
      minimum_stok NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (minimum_stok >= 0),
      ortalama_birim_maliyet NUMERIC(16,6) NOT NULL DEFAULT 0 CHECK (ortalama_birim_maliyet >= 0),
      aktif BOOLEAN NOT NULL DEFAULT true,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS hammaddeler_isletme_ad_tek
      ON hammaddeler (isletme_id, LOWER(ad));
    CREATE INDEX IF NOT EXISTS hammaddeler_kritik_stok
      ON hammaddeler (isletme_id, aktif, stok_miktari, minimum_stok);

    CREATE TABLE IF NOT EXISTS urun_receteleri (
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      urun_id INTEGER NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
      hammadde_id BIGINT NOT NULL REFERENCES hammaddeler(id) ON DELETE RESTRICT,
      miktar NUMERIC(16,4) NOT NULL CHECK (miktar > 0),
      fire_orani NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (fire_orani >= 0 AND fire_orani <= 100),
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (isletme_id, urun_id, hammadde_id)
    );
    CREATE INDEX IF NOT EXISTS urun_receteleri_hammadde
      ON urun_receteleri (isletme_id, hammadde_id);

    CREATE TABLE IF NOT EXISTS hammadde_stok_hareketleri (
      id UUID PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      hammadde_id BIGINT NOT NULL REFERENCES hammaddeler(id) ON DELETE RESTRICT,
      tur TEXT NOT NULL CHECK (tur IN ('giris','fire','sayim','recete_tuketim')),
      miktar NUMERIC(16,4) NOT NULL,
      birim_maliyet NUMERIC(16,6) NOT NULL DEFAULT 0,
      toplam_maliyet NUMERIC(16,2) NOT NULL DEFAULT 0,
      onceki_stok NUMERIC(16,4) NOT NULL,
      sonraki_stok NUMERIC(16,4) NOT NULL,
      odeme_id UUID REFERENCES odeme_islemleri(id) ON DELETE SET NULL,
      personel_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
      aciklama TEXT NOT NULL DEFAULT '',
      istek_anahtari TEXT NOT NULL,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (isletme_id, istek_anahtari)
    );
    CREATE INDEX IF NOT EXISTS hammadde_hareketleri_tarih
      ON hammadde_stok_hareketleri (isletme_id, hammadde_id, olusturma DESC);

    CREATE TABLE IF NOT EXISTS hammadde_rezervasyonlari (
      odeme_id UUID NOT NULL REFERENCES odeme_islemleri(id) ON DELETE CASCADE,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      hammadde_id BIGINT NOT NULL REFERENCES hammaddeler(id) ON DELETE RESTRICT,
      miktar NUMERIC(16,4) NOT NULL CHECK (miktar > 0),
      birim_maliyet NUMERIC(16,6) NOT NULL DEFAULT 0,
      durum TEXT NOT NULL CHECK (durum IN ('aktif','tuketildi','birakildi')),
      son_gecerlilik TIMESTAMPTZ NOT NULL,
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (odeme_id, hammadde_id)
    );
    CREATE INDEX IF NOT EXISTS hammadde_rezervasyonlari_sure
      ON hammadde_rezervasyonlari (isletme_id, durum, son_gecerlilik);
    ALTER TABLE hammadde_rezervasyonlari
      ADD COLUMN IF NOT EXISTS birim_maliyet NUMERIC(16,6) NOT NULL DEFAULT 0;
  `);
}

const HAMMADDE_SELECT = `
  SELECT h.*,
    COALESCE((SELECT SUM(r.miktar) FROM hammadde_rezervasyonlari r
      WHERE r.isletme_id=h.isletme_id AND r.hammadde_id=h.id AND r.durum='aktif'),0) rezerve_miktar
  FROM hammaddeler h`;

function hammaddeDonustur(satir) {
  const kullanilabilir = Number(satir.stok_miktari || 0);
  const rezerve = Number(satir.rezerve_miktar || 0);
  return {
    id: Number(satir.id), ad: satir.ad, birim: satir.birim,
    stokMiktari: kullanilabilir, rezerveMiktar: rezerve, fizikselStok: kullanilabilir + rezerve,
    minimumStok: Number(satir.minimum_stok || 0), birimMaliyet: Number(satir.ortalama_birim_maliyet || 0),
    stokDegeri: Number((Math.max(0, kullanilabilir + rezerve) * Number(satir.ortalama_birim_maliyet || 0)).toFixed(2)),
    kritik: satir.aktif === true && kullanilabilir <= Number(satir.minimum_stok || 0), aktif: satir.aktif === true,
  };
}

export async function hammaddeleriGetir(isletmeId, pool, { tumu = true } = {}) {
  const id = tenantId(isletmeId);
  const sonuc = await pool.query(`${HAMMADDE_SELECT} WHERE h.isletme_id=$1 ${tumu ? "" : "AND h.aktif=true"} ORDER BY h.aktif DESC,h.ad`, [id]);
  return sonuc.rows.map(hammaddeDonustur);
}

export async function hammaddeKaydet(isletmeId, pool, veri) {
  const id = tenantId(isletmeId);
  const hammadde = hammaddeVerisiniDogrula(veri);
  let sonuc;
  try {
    if (hammadde.id) {
      const mevcut = await pool.query(`SELECT h.birim,EXISTS(
        SELECT 1 FROM urun_receteleri r WHERE r.isletme_id=h.isletme_id AND r.hammadde_id=h.id
      ) recetede_kullaniliyor FROM hammaddeler h WHERE h.isletme_id=$1 AND h.id=$2`, [id, hammadde.id]);
      if (!mevcut.rows[0]) throw new Error("Hammadde bulunamadı.");
      if (mevcut.rows[0].birim !== hammadde.birim) {
        throw new Error("Kayıtlı hammaddenin temel birimi değiştirilemez. Yeni bir hammadde oluşturun.");
      }
      if (!hammadde.aktif && mevcut.rows[0].recetede_kullaniliyor) {
        throw new Error("Bu hammadde aktif ürün reçetelerinde kullanılıyor. Önce reçetelerden kaldırın.");
      }
      sonuc = await pool.query(
        `UPDATE hammaddeler SET ad=$3,birim=$4,minimum_stok=$5,aktif=$6,guncelleme=NOW()
         WHERE isletme_id=$1 AND id=$2 RETURNING *`,
        [id, hammadde.id, hammadde.ad, hammadde.birim, hammadde.minimumStok, hammadde.aktif]
      );
    } else {
      sonuc = await pool.query(
        `INSERT INTO hammaddeler(isletme_id,ad,birim,minimum_stok,aktif) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [id, hammadde.ad, hammadde.birim, hammadde.minimumStok, hammadde.aktif]
      );
    }
  } catch (hata) {
    if (hata.code === "23505") throw new Error("Bu isimde bir hammadde zaten var.");
    throw hata;
  }
  if (!sonuc.rows[0]) throw new Error("Hammadde bulunamadı.");
  return hammaddeDonustur({ ...sonuc.rows[0], rezerve_miktar: 0 });
}

export async function hammaddeStokHareketiKaydet(isletmeId, pool, hammaddeId, veri, personelId) {
  const id = tenantId(isletmeId);
  const hamId = Number(hammaddeId);
  const tur = String(veri?.tur || "").trim();
  const istekAnahtari = String(veri?.istekAnahtari || "").trim();
  if (!Number.isSafeInteger(hamId) || hamId < 1) throw new Error("Hammadde geçersiz.");
  if (!["giris", "fire", "sayim"].includes(tur)) throw new Error("Stok hareketi türü geçersiz.");
  if (!UUID_DESENI.test(istekAnahtari)) throw new Error("İşlem anahtarı geçersiz.");
  const miktar = tur === "sayim" ? negatifOlmayanSayi(veri?.miktar, "Sayım miktarı") : pozitifSayi(veri?.miktar, "Stok miktarı");
  const toplamMaliyet = tur === "giris" ? negatifOlmayanSayi(veri?.toplamMaliyet, "Toplam alış maliyeti") : 0;
  const aciklama = String(veri?.aciklama || "").trim().slice(0, 500);
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const tekrar = await baglanti.query("SELECT id FROM hammadde_stok_hareketleri WHERE isletme_id=$1 AND istek_anahtari=$2", [id, istekAnahtari]);
    if (tekrar.rows[0]) {
      await baglanti.query("COMMIT");
      return { tekrar: true };
    }
    const sonuc = await baglanti.query("SELECT * FROM hammaddeler WHERE isletme_id=$1 AND id=$2 FOR UPDATE", [id, hamId]);
    const hammadde = sonuc.rows[0];
    if (!hammadde) throw new Error("Hammadde bulunamadı.");
    const onceki = Number(hammadde.stok_miktari || 0);
    const sonraki = tur === "giris" ? onceki + miktar : tur === "fire" ? onceki - miktar : miktar;
    if (sonraki < 0) throw new Error(`${hammadde.ad} için stok miktarı yetersiz.`);
    let birimMaliyet = Number(hammadde.ortalama_birim_maliyet || 0);
    if (tur === "giris" && toplamMaliyet > 0) {
      const alisBirimMaliyeti = toplamMaliyet / miktar;
      const maliyetliEskiStok = Math.max(0, onceki);
      birimMaliyet = (maliyetliEskiStok * birimMaliyet + toplamMaliyet) / (maliyetliEskiStok + miktar);
    }
    await baglanti.query(
      "UPDATE hammaddeler SET stok_miktari=$3,ortalama_birim_maliyet=$4,guncelleme=NOW() WHERE isletme_id=$1 AND id=$2",
      [id, hamId, sonraki, birimMaliyet]
    );
    const hareketMiktari = tur === "sayim" ? sonraki - onceki : tur === "fire" ? -miktar : miktar;
    await baglanti.query(
      `INSERT INTO hammadde_stok_hareketleri
       (id,isletme_id,hammadde_id,tur,miktar,birim_maliyet,toplam_maliyet,onceki_stok,sonraki_stok,personel_id,aciklama,istek_anahtari)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [randomUUID(), id, hamId, tur, hareketMiktari, birimMaliyet, toplamMaliyet, onceki, sonraki, personelId || null, aciklama, istekAnahtari]
    );
    await baglanti.query("COMMIT");
    return { tekrar: false };
  } catch (hata) {
    await baglanti.query("ROLLBACK").catch(() => {});
    if (hata.code === "23505") throw new Error("Bu isimde bir hammadde zaten var.");
    throw hata;
  } finally {
    baglanti.release();
  }
}

export async function urunRecetesiKaydet(isletmeId, pool, urunId, gelenSatirlar) {
  const id = tenantId(isletmeId);
  const urun = Number(urunId);
  if (!Number.isSafeInteger(urun) || urun < 1) throw new Error("Ürün geçersiz.");
  const satirlar = receteSatirlariniDogrula(gelenSatirlar);
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const urunSonucu = await baglanti.query("SELECT id FROM urunler WHERE isletme_id=$1 AND id=$2 AND arsivli=false", [id, urun]);
    if (!urunSonucu.rows[0]) throw new Error("Ürün bulunamadı.");
    if (satirlar.length) {
      const hammaddeler = await baglanti.query("SELECT id FROM hammaddeler WHERE isletme_id=$1 AND id=ANY($2::bigint[]) AND aktif=true", [id, satirlar.map((s) => s.hammaddeId)]);
      if (hammaddeler.rows.length !== satirlar.length) throw new Error("Reçetede bulunamayan veya pasif bir hammadde var.");
    }
    await baglanti.query("DELETE FROM urun_receteleri WHERE isletme_id=$1 AND urun_id=$2", [id, urun]);
    for (const satir of satirlar) {
      await baglanti.query(
        `INSERT INTO urun_receteleri(isletme_id,urun_id,hammadde_id,miktar,fire_orani) VALUES($1,$2,$3,$4,$5)`,
        [id, urun, satir.hammaddeId, satir.miktar, satir.fireOrani]
      );
    }
    await baglanti.query("COMMIT");
  } catch (hata) {
    await baglanti.query("ROLLBACK").catch(() => {});
    throw hata;
  } finally {
    baglanti.release();
  }
}

export async function receteStokMerkeziniGetir(isletmeId, pool) {
  const id = tenantId(isletmeId);
  const [hammaddeler, receteSonucu, hareketSonucu] = await Promise.all([
    hammaddeleriGetir(id, pool),
    pool.query(`
      SELECT u.id urun_id,u.ad urun_adi,u.fiyat,
        COALESCE(json_agg(json_build_object(
          'hammaddeId',h.id,'hammaddeAdi',h.ad,'birim',h.birim,'miktar',r.miktar,
          'fireOrani',r.fire_orani,'birimMaliyet',h.ortalama_birim_maliyet
        ) ORDER BY h.ad) FILTER (WHERE h.id IS NOT NULL),'[]'::json) satirlar
      FROM urunler u
      LEFT JOIN urun_receteleri r ON r.isletme_id=u.isletme_id AND r.urun_id=u.id
      LEFT JOIN hammaddeler h ON h.isletme_id=r.isletme_id AND h.id=r.hammadde_id
      WHERE u.isletme_id=$1 AND u.arsivli=false
      GROUP BY u.id,u.ad,u.fiyat ORDER BY u.ad`, [id]),
    pool.query(`SELECT s.id,s.hammadde_id,h.ad hammadde_adi,h.birim,s.tur,s.miktar,s.toplam_maliyet,s.onceki_stok,s.sonraki_stok,s.aciklama,s.olusturma
      FROM hammadde_stok_hareketleri s JOIN hammaddeler h ON h.id=s.hammadde_id AND h.isletme_id=s.isletme_id
      WHERE s.isletme_id=$1 ORDER BY s.olusturma DESC LIMIT 50`, [id]),
  ]);
  const receteler = receteSonucu.rows.map((satir) => {
    const satirlar = (satir.satirlar || []).map((r) => ({
      ...r, hammaddeId: Number(r.hammaddeId), miktar: Number(r.miktar), fireOrani: Number(r.fireOrani), birimMaliyet: Number(r.birimMaliyet),
    }));
    const maliyet = receteMaliyetiHesapla(satirlar);
    const fiyat = Number(satir.fiyat || 0);
    return { urunId: Number(satir.urun_id), urunAdi: satir.urun_adi, fiyat, satirlar, maliyet, brutKar: Number((fiyat - maliyet).toFixed(2)), maliyetOrani: fiyat > 0 ? Number((maliyet / fiyat * 100).toFixed(1)) : 0 };
  });
  return {
    hammaddeler,
    receteler,
    hareketler: hareketSonucu.rows.map((s) => ({ ...s, id: s.id, hammaddeId: Number(s.hammadde_id), hammaddeAdi: s.hammadde_adi, birim: s.birim, miktar: Number(s.miktar), toplamMaliyet: Number(s.toplam_maliyet), oncekiStok: Number(s.onceki_stok), sonrakiStok: Number(s.sonraki_stok) })),
  };
}

function urunAdetleriniTopla(urunler) {
  const adetler = new Map();
  for (const urun of urunler || []) {
    const adet = Math.max(1, Math.floor(Number(urun?.adet || 1)));
    for (const hamId of [urun?.id, urun?.secimler?.menuBurgerId, urun?.secimler?.yanLezzetId, urun?.secimler?.icecekId]) {
      const id = Number(hamId);
      if (Number.isSafeInteger(id) && id > 0) adetler.set(id, (adetler.get(id) || 0) + adet);
    }
  }
  return adetler;
}

export async function suresiDolanHammaddeRezervasyonlariniBirak(baglanti, isletmeId) {
  const id = tenantId(isletmeId);
  await baglanti.query(`
    WITH birakilan AS (
      UPDATE hammadde_rezervasyonlari SET durum='birakildi',guncelleme=NOW()
      WHERE isletme_id=$1 AND durum='aktif' AND son_gecerlilik<=NOW()
      RETURNING hammadde_id,miktar
    ), toplam AS (SELECT hammadde_id,SUM(miktar) miktar FROM birakilan GROUP BY hammadde_id)
    UPDATE hammaddeler h SET stok_miktari=h.stok_miktari+toplam.miktar,guncelleme=NOW()
    FROM toplam WHERE h.isletme_id=$1 AND h.id=toplam.hammadde_id`, [id]);
}

export async function siparisReceteStogunuIsle(baglanti, isletmeId, odemeId, urunler, { rezervasyon = false, stokAciginaIzinVer = false } = {}) {
  const id = tenantId(isletmeId);
  const adetler = urunAdetleriniTopla(urunler);
  if (!adetler.size) return;
  const receteSonucu = await baglanti.query(
    `SELECT r.urun_id,r.hammadde_id,r.miktar,r.fire_orani,h.ad,h.stok_miktari,h.ortalama_birim_maliyet
     FROM urun_receteleri r JOIN hammaddeler h ON h.isletme_id=r.isletme_id AND h.id=r.hammadde_id
     WHERE r.isletme_id=$1 AND r.urun_id=ANY($2::int[]) AND h.aktif=true ORDER BY h.id FOR UPDATE OF h`,
    [id, [...adetler.keys()]]
  );
  const gerekenler = new Map();
  for (const satir of receteSonucu.rows) {
    const urunAdedi = adetler.get(Number(satir.urun_id)) || 0;
    const miktar = Number(satir.miktar) * (1 + Number(satir.fire_orani) / 100) * urunAdedi;
    const mevcut = gerekenler.get(Number(satir.hammadde_id)) || { ...satir, miktar: 0 };
    mevcut.miktar += miktar;
    gerekenler.set(Number(satir.hammadde_id), mevcut);
  }
  if (!gerekenler.size) return;
  const mevcutSonucu = await baglanti.query(
    "SELECT hammadde_id,durum,birim_maliyet FROM hammadde_rezervasyonlari WHERE isletme_id=$1 AND odeme_id=$2 FOR UPDATE",
    [id, odemeId]
  );
  const rezervasyonlar = new Map(mevcutSonucu.rows.map((r) => [Number(r.hammadde_id), { durum: r.durum, birimMaliyet: Number(r.birim_maliyet || 0) }]));
  for (const [hammaddeId, satir] of gerekenler) {
    const miktar = Number(satir.miktar.toFixed(4));
    const mevcutRezervasyon = rezervasyonlar.get(hammaddeId);
    const mevcutDurum = mevcutRezervasyon?.durum;
    if (mevcutDurum === "tuketildi") continue;
    if (!rezervasyon && mevcutDurum === "aktif") {
      await baglanti.query("UPDATE hammadde_rezervasyonlari SET durum='tuketildi',guncelleme=NOW() WHERE odeme_id=$1 AND hammadde_id=$2", [odemeId, hammaddeId]);
    } else {
      if (rezervasyon && mevcutDurum === "aktif") continue;
      if (Number(satir.stok_miktari) < miktar && !stokAciginaIzinVer) throw new Error(`${satir.ad} stoğu reçete için yetersiz.`);
      await baglanti.query("UPDATE hammaddeler SET stok_miktari=stok_miktari-$1,guncelleme=NOW() WHERE isletme_id=$2 AND id=$3", [miktar, id, hammaddeId]);
      await baglanti.query(`INSERT INTO hammadde_rezervasyonlari(odeme_id,isletme_id,hammadde_id,miktar,birim_maliyet,durum,son_gecerlilik)
        VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '20 minutes') ON CONFLICT(odeme_id,hammadde_id) DO UPDATE SET
        miktar=EXCLUDED.miktar,birim_maliyet=EXCLUDED.birim_maliyet,durum=EXCLUDED.durum,son_gecerlilik=EXCLUDED.son_gecerlilik,guncelleme=NOW()`,
        [odemeId, id, hammaddeId, miktar, Number(satir.ortalama_birim_maliyet || 0), rezervasyon ? "aktif" : "tuketildi"]);
    }
    if (!rezervasyon) {
      const sonrakiSonucu = await baglanti.query("SELECT stok_miktari FROM hammaddeler WHERE isletme_id=$1 AND id=$2", [id, hammaddeId]);
      const sonraki = Number(sonrakiSonucu.rows[0]?.stok_miktari || 0);
      const tuketimBirimMaliyeti = mevcutDurum === "aktif" ? mevcutRezervasyon.birimMaliyet : Number(satir.ortalama_birim_maliyet || 0);
      await baglanti.query(`INSERT INTO hammadde_stok_hareketleri
        (id,isletme_id,hammadde_id,tur,miktar,birim_maliyet,toplam_maliyet,onceki_stok,sonraki_stok,odeme_id,aciklama,istek_anahtari)
        VALUES($1,$2,$3,'recete_tuketim',$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(isletme_id,istek_anahtari) DO NOTHING`,
        [randomUUID(), id, hammaddeId, -miktar, tuketimBirimMaliyeti, Number((miktar * tuketimBirimMaliyeti).toFixed(2)), sonraki + miktar, sonraki, odemeId, "Sipariş reçete tüketimi", `recete:${odemeId}:${hammaddeId}`]);
    }
  }
}
