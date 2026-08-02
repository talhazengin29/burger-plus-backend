import { randomUUID } from "crypto";

const BURGER_DAMGA_HEDEFI = 5;
const UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BASLANGIC_ODULLERI = [];

function isletmeIdZorunlu(isletmeId) {
  const id = Number(isletmeId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("isletmeId zorunlu");
  return id;
}

async function sadakatAyariniGetir(isletmeId, veritabani) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const sonuc = await veritabani.query(
    "SELECT deger FROM sistem_ayarlari WHERE isletme_id=$1 AND anahtar='sadakat_kurulum_v1'",
    [tenantId]
  );
  const ayar = sonuc.rows[0]?.deger || {};
  const hedef = Number(ayar.hedefAdet);
  return {
    hedefAdet: Number.isInteger(hedef) && hedef >= 2 && hedef <= 100 ? hedef : BURGER_DAMGA_HEDEFI,
    kategori: String(ayar.kategori || "Burgerler").trim().slice(0, 100) || "Burgerler",
    odulMetni: String(ayar.odulMetni || "1 Burger Hediye").trim().slice(0, 120) || "1 Burger Hediye",
  };
}

async function yeKazanOdulunuBulVeyaOlustur(isletmeId, baglanti, tercihEdilenUrunId = null) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const sadakat = await sadakatAyariniGetir(tenantId, baglanti);
  const mevcut = await baglanti.query(
    `SELECT o.id FROM oduller o
     JOIN urunler u ON u.isletme_id=$1 AND u.id=o.urun_id
     WHERE o.isletme_id=$1 AND o.kod='ye-kazan-burger'
       AND u.aktif=true AND u.arsivli=false
     LIMIT 1`,
    [tenantId]
  );
  if (mevcut.rows.length) {
    await baglanti.query(
      "UPDATE oduller SET ad=$3,aktif=true,arsivli=false,market_aktif=false,guncelleme=NOW() WHERE isletme_id=$1 AND id=$2",
      [tenantId, mevcut.rows[0].id, sadakat.odulMetni]
    );
    return Number(mevcut.rows[0].id);
  }

  const tercihId = Number(tercihEdilenUrunId);
  const urun = await baglanti.query(
    `SELECT id,gorsel FROM urunler
     WHERE isletme_id=$1 AND kategori=$2 AND aktif=true AND arsivli=false
       AND ($3::int IS NULL OR id=$3)
     ORDER BY id LIMIT 1`,
    [tenantId, sadakat.kategori, Number.isSafeInteger(tercihId) && tercihId > 0 ? tercihId : null]
  );
  const secilenUrun = urun.rows[0] || (await baglanti.query(
    `SELECT id,gorsel FROM urunler
     WHERE isletme_id=$1 AND kategori=$2 AND aktif=true AND arsivli=false
     ORDER BY id LIMIT 1`,
    [tenantId, sadakat.kategori]
  )).rows[0];
  if (!secilenUrun) return null;

  const sonuc = await baglanti.query(
    `INSERT INTO oduller
      (isletme_id,kod,ad,puan,urun_id,gorsel,market_aktif,aktif,arsivli)
     VALUES ($1,'ye-kazan-burger',$4,0,$2,$3,false,true,false)
     ON CONFLICT (isletme_id,kod) DO UPDATE SET
       urun_id=EXCLUDED.urun_id,gorsel=EXCLUDED.gorsel,
       market_aktif=false,aktif=true,arsivli=false,guncelleme=NOW()
     RETURNING id`,
    [tenantId, secilenUrun.id, secilenUrun.gorsel || null, sadakat.odulMetni]
  );
  return Number(sonuc.rows[0].id);
}

export async function sadakatTablolariHazirla(isletmeId, pool) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  await pool.query("ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS burger_damga INTEGER NOT NULL DEFAULT 0");
  await pool.query("UPDATE kullanicilar SET puan=0 WHERE isletme_id=$1 AND puan < 0", [tenantId]);
  await pool.query("UPDATE kullanicilar SET burger_damga=0 WHERE isletme_id=$1 AND burger_damga < 0", [tenantId]);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kullanicilar_puan_negatif_olamaz') THEN
        ALTER TABLE kullanicilar ADD CONSTRAINT kullanicilar_puan_negatif_olamaz CHECK (puan >= 0);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kullanicilar_burger_damga_araligi') THEN
        ALTER TABLE kullanicilar DROP CONSTRAINT kullanicilar_burger_damga_araligi;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kullanicilar_burger_damga_negatif_olamaz') THEN
        ALTER TABLE kullanicilar ADD CONSTRAINT kullanicilar_burger_damga_negatif_olamaz CHECK (burger_damga >= 0);
      END IF;
    END $$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oduller (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      kod TEXT NOT NULL,
      ad TEXT NOT NULL,
      puan INTEGER NOT NULL CHECK (puan >= 0),
      urun_id INTEGER NOT NULL,
      gorsel TEXT,
      market_aktif BOOLEAN NOT NULL DEFAULT true,
      aktif BOOLEAN NOT NULL DEFAULT true,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS kullanici_odulleri (
      id BIGSERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
      odul_id INTEGER NOT NULL REFERENCES oduller(id) ON DELETE RESTRICT,
      kaynak_tur TEXT NOT NULL CHECK (kaynak_tur IN ('puan','ye_kazan','gecmis')),
      harcanan_puan INTEGER NOT NULL DEFAULT 0 CHECK (harcanan_puan >= 0),
      durum TEXT NOT NULL DEFAULT 'kullanilabilir' CHECK (durum IN ('kullanilabilir','kullanildi')),
      istek_anahtari UUID UNIQUE,
      kaynak_odeme_id UUID REFERENCES odeme_islemleri(id) ON DELETE RESTRICT,
      kaynak_sira INTEGER,
      kullanilan_odeme_id UUID REFERENCES odeme_islemleri(id) ON DELETE RESTRICT,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      kullanilma TIMESTAMPTZ,
      UNIQUE (kaynak_odeme_id, kaynak_sira)
    );
    CREATE INDEX IF NOT EXISTS kullanici_odulleri_isletme_kullanici_idx
      ON kullanici_odulleri (isletme_id, kullanici_id, olusturma DESC);
  `);
  await pool.query("ALTER TABLE oduller ADD COLUMN IF NOT EXISTS arsivli BOOLEAN NOT NULL DEFAULT false");
  await pool.query(`
    ALTER TABLE oduller DROP CONSTRAINT IF EXISTS oduller_kod_key;
    CREATE UNIQUE INDEX IF NOT EXISTS oduller_isletme_kod ON oduller(isletme_id,kod);
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='oduller_urun_id_fkey') THEN
        ALTER TABLE oduller ADD CONSTRAINT oduller_urun_id_fkey
          FOREIGN KEY (urun_id) REFERENCES urunler(id) ON DELETE RESTRICT;
      END IF;
    END $$
  `);

  for (const [kod, ad, puan, urunId, gorsel, marketAktif] of BASLANGIC_ODULLERI) {
    await pool.query(
      `INSERT INTO oduller (isletme_id,kod,ad,puan,urun_id,gorsel,market_aktif,aktif)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       ON CONFLICT (isletme_id,kod) DO NOTHING`,
      [tenantId, kod, ad, puan, urunId, gorsel, marketAktif]
    );
  }
  await pool.query(`
    UPDATE oduller o SET market_aktif=false,aktif=false,guncelleme=NOW()
    WHERE o.isletme_id=$1 AND EXISTS (
      SELECT 1 FROM urunler u WHERE u.isletme_id=$1 AND u.id=o.urun_id AND u.arsivli=true
    )
  `, [tenantId]);

  await yeKazanOdulunuBulVeyaOlustur(tenantId, pool);

  await eskiSadakatiAktar(tenantId, pool);
}

async function eskiSadakatiAktar(isletmeId, pool) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const sadakat = await sadakatAyariniGetir(tenantId, pool);
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    await baglanti.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`burger_plus_sadakat_v1:${tenantId}`]);
    const tamamlandi = await baglanti.query("SELECT 1 FROM sistem_ayarlari WHERE isletme_id=$1 AND anahtar='sadakat_backend_v1'", [tenantId]);
    if (tamamlandi.rows.length) {
      await baglanti.query("COMMIT");
      return;
    }

    const hediyeOdul = await baglanti.query("SELECT id FROM oduller WHERE isletme_id=$1 AND kod='ye-kazan-burger' AND aktif=true", [tenantId]);
    const odulId = hediyeOdul.rows[0]?.id;
    const burgerler = await baglanti.query(`
      SELECT s.kullanici_id,
        COALESCE(SUM(CASE WHEN kalem->>'kategori'=$2 THEN
          GREATEST(1,CASE WHEN COALESCE(kalem->>'adet','') ~ '^[0-9]+$'
            THEN (kalem->>'adet')::int ELSE 1 END) ELSE 0 END),0)::int AS adet
      FROM kullanici_siparisleri s
      CROSS JOIN LATERAL jsonb_array_elements(s.urunler) kalem
      WHERE s.isletme_id=$1 AND s.tutar > 0
      GROUP BY s.kullanici_id
    `, [tenantId, sadakat.kategori]);
    for (const kayit of burgerler.rows) {
      const adet = Number(kayit.adet || 0);
      await baglanti.query("UPDATE kullanicilar SET burger_damga=$1 WHERE isletme_id=$2 AND id=$3", [adet % sadakat.hedefAdet, tenantId, kayit.kullanici_id]);
      if (odulId) {
        for (let sira = 0; sira < Math.floor(adet / sadakat.hedefAdet); sira += 1) {
          await baglanti.query(
            `INSERT INTO kullanici_odulleri (isletme_id,kullanici_id,odul_id,kaynak_tur,harcanan_puan)
             VALUES ($1,$2,$3,'gecmis',0)`,
            [tenantId, kayit.kullanici_id, odulId]
          );
        }
      }
    }
    await baglanti.query(
      "INSERT INTO sistem_ayarlari (isletme_id,anahtar,deger) VALUES ($1,'sadakat_backend_v1',$2::jsonb) ON CONFLICT (isletme_id,anahtar) DO NOTHING",
      [tenantId, JSON.stringify({ tarih: new Date().toISOString() })]
    );
    await baglanti.query("COMMIT");
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
}

function oduluDonustur(odul) {
  return {
    id: Number(odul.id),
    ad: odul.ad,
    puan: Number(odul.puan || 0),
    urunId: Number(odul.urun_id),
    gorsel: odul.gorsel || null,
  };
}

function hediyeyiDonustur(hediye) {
  return {
    id: Number(hediye.id),
    odulId: Number(hediye.odul_id),
    ad: hediye.ad,
    tip: hediye.kaynak_tur === "puan" ? "puan" : "ye-kazan",
    puan: Number(hediye.harcanan_puan || 0),
    gorsel: hediye.gorsel || null,
    kullanildi: hediye.durum === "kullanildi",
    tarih: hediye.olusturma,
    kullanilmaTarihi: hediye.kullanilma || null,
    siparisNo: hediye.siparis_no || null,
  };
}

export async function sadakatOzetiniGetir(isletmeId, pool, kullaniciId) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const [sadakat, kullanici, oduller, hareketler, hediyeler] = await Promise.all([
    sadakatAyariniGetir(tenantId, pool),
    pool.query("SELECT puan,burger_damga FROM kullanicilar WHERE isletme_id=$1 AND id=$2", [tenantId, kullaniciId]),
    pool.query(`SELECT o.id,o.ad,o.puan,o.urun_id,o.gorsel FROM oduller o
      JOIN urunler u ON u.isletme_id=$1 AND u.id=o.urun_id
      WHERE o.isletme_id=$1 AND o.aktif=true AND o.market_aktif=true AND u.arsivli=false AND u.aktif=true ORDER BY o.puan,o.id`, [tenantId]),
    pool.query(
      `SELECT id,puan,aciklama,olusturma FROM puan_hareketleri
       WHERE isletme_id=$1 AND kullanici_id=$2 ORDER BY olusturma DESC LIMIT 100`,
      [tenantId, kullaniciId]
    ),
    pool.query(
      `SELECT ko.*,o.ad,o.gorsel,oi.siparis_no
       FROM kullanici_odulleri ko
       JOIN oduller o ON o.isletme_id=$1 AND o.id=ko.odul_id
       LEFT JOIN odeme_islemleri oi ON oi.isletme_id=$1 AND oi.id=ko.kullanilan_odeme_id
       WHERE ko.isletme_id=$1 AND ko.kullanici_id=$2 ORDER BY ko.olusturma DESC LIMIT 200`,
      [tenantId, kullaniciId]
    ),
  ]);
  if (!kullanici.rows.length) throw new Error("Kullanıcı bulunamadı.");
  return {
    puan: Number(kullanici.rows[0].puan || 0),
    burgerDamga: Number(kullanici.rows[0].burger_damga || 0),
    burgerDamgaHedef: sadakat.hedefAdet,
    oduller: oduller.rows.map(oduluDonustur),
    puanGecmisi: hareketler.rows.map((hareket) => ({
      id: Number(hareket.id),
      baslik: hareket.aciklama,
      tarih: hareket.olusturma,
      puan: Number(hareket.puan),
      tip: Number(hareket.puan) >= 0 ? "kazanc" : "harcama",
    })),
    hediyeler: hediyeler.rows.map(hediyeyiDonustur),
  };
}

export async function puanlaOdulSatinAl(isletmeId, pool, kullaniciId, odulId, istekAnahtari) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  if (!UUID_DESENI.test(String(istekAnahtari || ""))) throw new Error("Ödül işlem anahtarı geçersiz.");
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const kullanici = await baglanti.query("SELECT id FROM kullanicilar WHERE isletme_id=$1 AND id=$2 FOR UPDATE", [tenantId, kullaniciId]);
    if (!kullanici.rows.length) throw new Error("Kullanıcı bulunamadı.");
    const mevcut = await baglanti.query(
      "SELECT id FROM kullanici_odulleri WHERE isletme_id=$1 AND kullanici_id=$2 AND istek_anahtari=$3",
      [tenantId, kullaniciId, istekAnahtari]
    );
    if (mevcut.rows.length) {
      await baglanti.query("COMMIT");
      return { tekrar: true };
    }
    const odul = await baglanti.query(
      `SELECT id,ad,puan FROM oduller
       WHERE isletme_id=$1 AND id=$2 AND aktif=true AND market_aktif=true FOR SHARE`,
      [tenantId, odulId]
    );
    if (!odul.rows.length) throw new Error("Ödül bulunamadı veya kullanıma kapalı.");
    const puan = Number(odul.rows[0].puan);
    const puanSonucu = await baglanti.query(
      "UPDATE kullanicilar SET puan=puan-$1 WHERE isletme_id=$2 AND id=$3 AND puan >= $1 RETURNING puan",
      [puan, tenantId, kullaniciId]
    );
    if (!puanSonucu.rows.length) throw new Error("Bu ödül için yeterli puanın yok.");
    await baglanti.query(
      `INSERT INTO kullanici_odulleri
        (isletme_id,kullanici_id,odul_id,kaynak_tur,harcanan_puan,istek_anahtari)
       VALUES ($1,$2,$3,'puan',$4,$5)`,
      [tenantId, kullaniciId, odul.rows[0].id, puan, istekAnahtari]
    );
    await baglanti.query(
      `INSERT INTO puan_hareketleri (isletme_id,kullanici_id,tur,puan,aciklama)
       VALUES ($1,$2,'odul_harcamasi',$3,$4)`,
      [tenantId, kullaniciId, -puan, `Ödül alındı: ${odul.rows[0].ad}`]
    );
    await baglanti.query("COMMIT");
    return { tekrar: false };
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
}

export async function adminOdulleriGetir(isletmeId, pool) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const sonuc = await pool.query(`SELECT o.id,o.ad,o.puan,o.urun_id,o.gorsel,o.market_aktif,u.ad AS urun_ad,(SELECT COUNT(*)::int FROM kullanici_odulleri ko WHERE ko.isletme_id=$1 AND ko.odul_id=o.id) AS kazanilma_sayisi FROM oduller o JOIN urunler u ON u.isletme_id=$1 AND u.id=o.urun_id WHERE o.isletme_id=$1 AND o.arsivli=false AND u.arsivli=false AND (o.market_aktif=true OR o.kod LIKE 'puan-%' OR o.kod LIKE 'admin-%') ORDER BY o.puan,o.id`, [tenantId]);
  return sonuc.rows.map((odul) => ({ id: Number(odul.id), ad: odul.ad, puan: Number(odul.puan), urunId: Number(odul.urun_id), urunAd: odul.urun_ad, gorsel: odul.gorsel || null, aktif: odul.market_aktif, kazanilmaSayisi: Number(odul.kazanilma_sayisi || 0) }));
}

export async function adminOdulKaydet(isletmeId, pool, veri) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const id = veri.id == null || veri.id === "" ? null : Number(veri.id), ad = String(veri.ad || "").trim().slice(0, 120), puan = Math.floor(Number(veri.puan)), urunId = Number(veri.urunId), gorsel = String(veri.gorsel || "").trim().slice(0, 1000) || null;
  if (!ad || !Number.isInteger(puan) || puan < 1 || puan > 1_000_000) throw new Error("Ödül adı ve geçerli puan tutarı zorunludur.");
  if (!Number.isSafeInteger(urunId) || urunId < 1) throw new Error("Ödül için geçerli bir ürün seçin.");
  const urun = await pool.query("SELECT id,ad,gorsel FROM urunler WHERE isletme_id=$1 AND id=$2 AND arsivli=false AND aktif=true", [tenantId, urunId]);
  if (!urun.rows.length) throw new Error("Ödüle bağlanacak ürün bulunamadı.");
  if (id) {
    const mevcut = await pool.query(`SELECT o.urun_id,(SELECT COUNT(*)::int FROM kullanici_odulleri ko WHERE ko.isletme_id=$1 AND ko.odul_id=o.id) kazanilma_sayisi FROM oduller o WHERE o.isletme_id=$1 AND o.id=$2 AND (o.market_aktif=true OR o.kod LIKE 'puan-%' OR o.kod LIKE 'admin-%')`, [tenantId, id]);
    if (!mevcut.rows.length) throw new Error("Puan marketi ödülü bulunamadı.");
    if (Number(mevcut.rows[0].urun_id) !== urunId && Number(mevcut.rows[0].kazanilma_sayisi) > 0) throw new Error("Daha önce kazanılmış bu ödülün ürünü değiştirilemez; yeni bir ödül oluşturun.");
    const sonuc = await pool.query(`UPDATE oduller SET ad=$1,puan=$2,urun_id=$3,gorsel=$4,market_aktif=$5,guncelleme=NOW() WHERE isletme_id=$6 AND id=$7 RETURNING id`, [ad, puan, urunId, gorsel || urun.rows[0].gorsel, veri.aktif !== false, tenantId, id]);
    if (!sonuc.rows.length) throw new Error("Puan marketi ödülü bulunamadı.");
  } else {
    await pool.query(`INSERT INTO oduller (isletme_id,kod,ad,puan,urun_id,gorsel,market_aktif,aktif) VALUES ($1,$2,$3,$4,$5,$6,$7,true)`, [tenantId, `admin-${randomUUID()}`, ad, puan, urunId, gorsel || urun.rows[0].gorsel, veri.aktif !== false]);
  }
  return adminOdulleriGetir(tenantId, pool);
}

export async function adminOdulArsivle(isletmeId, pool, id) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const sonuc = await pool.query(
    "UPDATE oduller SET market_aktif=false,aktif=false,arsivli=true,guncelleme=NOW() WHERE isletme_id=$1 AND id=$2 AND arsivli=false RETURNING id",
    [tenantId, id]
  );
  if (!sonuc.rows.length) throw new Error("Puan marketi ödülü bulunamadı.");
}

export async function odemeSadakatiniUygula(isletmeId, baglanti, odeme) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const sadakat = await sadakatAyariniGetir(tenantId, baglanti);
  if (!odeme.kullanici_id) return { burgerDamga: null, kazanilanHediye: 0 };
  const burgerAdet = (Array.isArray(odeme.urunler) ? odeme.urunler : [])
    .filter((urun) => urun.kategori === sadakat.kategori)
    .reduce((toplam, urun) => toplam + Math.max(1, Number(urun.adet || 1)), 0);
  if (!burgerAdet) {
    const mevcut = await baglanti.query("SELECT burger_damga FROM kullanicilar WHERE isletme_id=$1 AND id=$2", [tenantId, odeme.kullanici_id]);
    return { burgerDamga: Number(mevcut.rows[0]?.burger_damga || 0), kazanilanHediye: 0 };
  }

  const kullanici = await baglanti.query("SELECT burger_damga FROM kullanicilar WHERE isletme_id=$1 AND id=$2 FOR UPDATE", [tenantId, odeme.kullanici_id]);
  if (!kullanici.rows.length) throw new Error("Kullanıcı bulunamadı.");
  const toplam = Number(kullanici.rows[0]?.burger_damga || 0) + burgerAdet;
  let kazanilanHediye = Math.floor(toplam / sadakat.hedefAdet);
  let burgerDamga = toplam % sadakat.hedefAdet;
  let odulId = null;

  if (kazanilanHediye > 0) {
    const burgerUrunu = odeme.urunler.find((urun) => urun.kategori === sadakat.kategori);
    odulId = await yeKazanOdulunuBulVeyaOlustur(tenantId, baglanti, burgerUrunu?.id);
    // Ürün kataloğu olağan dışı biçimde boşsa ödeme yine tamamlanır. Kullanıcının
    // ilerlemesi dört damgada korunur ve ürün düzeltildiğinde sonraki siparişte ödül kazanır.
    if (!odulId) {
      kazanilanHediye = 0;
      burgerDamga = Math.min(sadakat.hedefAdet - 1, toplam);
    }
  }

  await baglanti.query("UPDATE kullanicilar SET burger_damga=$1 WHERE isletme_id=$2 AND id=$3", [burgerDamga, tenantId, odeme.kullanici_id]);

  if (kazanilanHediye > 0 && odulId) {
    for (let sira = 1; sira <= kazanilanHediye; sira += 1) {
      await baglanti.query(
        `INSERT INTO kullanici_odulleri
          (isletme_id,kullanici_id,odul_id,kaynak_tur,harcanan_puan,kaynak_odeme_id,kaynak_sira)
         VALUES ($1,$2,$3,'ye_kazan',0,$4,$5)
         ON CONFLICT (kaynak_odeme_id,kaynak_sira) DO NOTHING`,
        [tenantId, odeme.kullanici_id, odulId, odeme.id, sira]
      );
    }
  }
  return { burgerDamga, kazanilanHediye };
}

function odemeDonustur(odeme) {
  return {
    id: odeme.id,
    isletmeId: Number(odeme.isletme_id),
    siparisNo: odeme.siparis_no,
    kullaniciId: odeme.kullanici_id,
    masaNo: odeme.masa_no,
    tip: odeme.siparis_tipi,
    yontem: odeme.yontem,
    kisiAdi: odeme.kisi_adi,
    urunler: Array.isArray(odeme.urunler) ? odeme.urunler : [],
    tutar: Number(odeme.tutar),
    kazanilanPuan: Number(odeme.kazanilan_puan),
    durum: odeme.durum,
    mutfagaAktarildi: odeme.mutfaga_aktarildi,
    tarih: odeme.olusturma,
  };
}

export async function kullaniciOdulunuSipariseDonustur(isletmeId, pool, kullaniciId, kullaniciOduluId, masaNo, kisiAdi) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const odulId = Number(kullaniciOduluId);
  if (!Number.isSafeInteger(odulId) || odulId < 1) throw new Error("Hediye bilgisi geçersiz.");
  const guvenliMasa = masaNo == null || masaNo === "" ? null : String(masaNo).trim();
  if (guvenliMasa && !/^[A-Za-z0-9_-]{1,30}$/.test(guvenliMasa)) throw new Error("Masa numarası geçersiz.");

  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const hediye = await baglanti.query(
      `SELECT ko.*,o.ad AS odul_ad,o.urun_id,o.aktif AS odul_aktif,
        u.ad AS urun_ad,u.kategori,u.malzemeler,u.temel_miktar,u.aktif AS urun_aktif
       FROM kullanici_odulleri ko
       JOIN oduller o ON o.isletme_id=$1 AND o.id=ko.odul_id
       JOIN urunler u ON u.isletme_id=$1 AND u.id=o.urun_id
       WHERE ko.isletme_id=$1 AND ko.id=$2 AND ko.kullanici_id=$3 FOR UPDATE OF ko`,
      [tenantId, odulId, kullaniciId]
    );
    if (!hediye.rows.length) throw new Error("Hediye bulunamadı.");
    const kayit = hediye.rows[0];
    if (kayit.durum === "kullanildi" && kayit.kullanilan_odeme_id) {
      const mevcutOdeme = await baglanti.query(
        "SELECT * FROM odeme_islemleri WHERE isletme_id=$1 AND id=$2",
        [tenantId, kayit.kullanilan_odeme_id]
      );
      if (!mevcutOdeme.rows.length) throw new Error("Hediyeye ait siparis bulunamadi.");
      await baglanti.query("COMMIT");
      return odemeDonustur(mevcutOdeme.rows[0]);
    }
    if (!kayit.odul_aktif || !kayit.urun_aktif) throw new Error("Bu hediye şu anda kullanılamıyor.");

    const odemeId = randomUUID();
    const siparisNo = `HEDIYE-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const standartGramaj = Number(kayit.temel_miktar || 0);
    const urun = {
      id: Number(kayit.urun_id),
      ad: kayit.urun_ad,
      kategori: kayit.kategori,
      adet: 1,
      fiyat: 0,
      temelMiktar: standartGramaj || null,
      malzemeler: Array.isArray(kayit.malzemeler) ? kayit.malzemeler : [],
      haricMalzemeler: [],
      secimler: {
        odul: true,
        odulEtiketi: kayit.odul_ad,
        dahilMalzemeler: Array.isArray(kayit.malzemeler) ? kayit.malzemeler : [],
        haricMalzemeler: [],
        ...(standartGramaj > 0 ? {
          standartGramaj,
          ekstraGramaj: 0,
          toplamGramaj: standartGramaj,
          gramajEtiketi: "Standart ürün miktarı",
          gramajBirim: kayit.kategori === "İçecekler" ? "ml" : "gr",
        } : {}),
      },
    };
    const odeme = await baglanti.query(
      `INSERT INTO odeme_islemleri
        (isletme_id,id,kullanici_id,siparis_no,masa_no,siparis_tipi,yontem,kisi_adi,urunler,tutar,kazanilan_puan,saglayici,durum,basarili_at)
       VALUES ($1,$2,$3,$4,$5,$6,'odul',$7,$8::jsonb,0,0,'odul','basarili',NOW()) RETURNING *`,
      [tenantId, odemeId, kullaniciId, siparisNo, guvenliMasa, guvenliMasa ? "masa" : "algotur", kisiAdi, JSON.stringify([urun])]
    );
    await baglanti.query(
      `UPDATE kullanici_odulleri SET durum='kullanildi',kullanilan_odeme_id=$1,kullanilma=NOW()
       WHERE isletme_id=$2 AND id=$3`,
      [odemeId, tenantId, odulId]
    );
    await baglanti.query(
      `INSERT INTO kullanici_siparisleri
        (isletme_id,kullanici_id,siparis_no,masa_no,tip,urunler,tutar,kazanilan_puan,durum)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,0,0,'hazirlaniyor')
       ON CONFLICT (kullanici_id,siparis_no) DO NOTHING`,
      [tenantId, kullaniciId, siparisNo, guvenliMasa, guvenliMasa ? "masa" : "algotur", JSON.stringify([urun])]
    );
    await baglanti.query("COMMIT");
    return odemeDonustur(odeme.rows[0]);
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
}
