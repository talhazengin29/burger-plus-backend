import { randomUUID } from "crypto";

const BURGER_DAMGA_HEDEFI = 5;
const UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BASLANGIC_ODULLERI = [
  ["puan-patates", "Küçük Boy Patates", 300, 5, "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=400&fit=crop", true],
  ["puan-icecek", "Seçili İçecek", 400, 7, "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&h=400&fit=crop", true],
  ["puan-burger", "Classic Burger", 1200, 1, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop", true],
  ["ye-kazan-burger", "Bedava Burger (Ye Kazan)", 0, 1, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop", false],
];

export async function sadakatTablolariHazirla(pool) {
  await pool.query("ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS burger_damga INTEGER NOT NULL DEFAULT 0");
  await pool.query("UPDATE kullanicilar SET puan=0 WHERE puan < 0");
  await pool.query("UPDATE kullanicilar SET burger_damga=0 WHERE burger_damga < 0 OR burger_damga >= $1", [BURGER_DAMGA_HEDEFI]);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kullanicilar_puan_negatif_olamaz') THEN
        ALTER TABLE kullanicilar ADD CONSTRAINT kullanicilar_puan_negatif_olamaz CHECK (puan >= 0);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kullanicilar_burger_damga_araligi') THEN
        ALTER TABLE kullanicilar ADD CONSTRAINT kullanicilar_burger_damga_araligi
          CHECK (burger_damga >= 0 AND burger_damga < 5);
      END IF;
    END $$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oduller (
      id SERIAL PRIMARY KEY,
      kod TEXT NOT NULL UNIQUE,
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
    CREATE INDEX IF NOT EXISTS kullanici_odulleri_kullanici_idx
      ON kullanici_odulleri (kullanici_id, olusturma DESC);
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='oduller_urun_id_fkey') THEN
        ALTER TABLE oduller ADD CONSTRAINT oduller_urun_id_fkey
          FOREIGN KEY (urun_id) REFERENCES urunler(id) ON DELETE RESTRICT;
      END IF;
    END $$
  `);

  for (const [kod, ad, puan, urunId, gorsel, marketAktif] of BASLANGIC_ODULLERI) {
    await pool.query(
      `INSERT INTO oduller (kod,ad,puan,urun_id,gorsel,market_aktif,aktif)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       ON CONFLICT (kod) DO NOTHING`,
      [kod, ad, puan, urunId, gorsel, marketAktif]
    );
  }

  await eskiSadakatiAktar(pool);
}

async function eskiSadakatiAktar(pool) {
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    await baglanti.query("SELECT pg_advisory_xact_lock(hashtext('burger_plus_sadakat_v1'))");
    const tamamlandi = await baglanti.query("SELECT 1 FROM sistem_ayarlari WHERE anahtar='sadakat_backend_v1'");
    if (tamamlandi.rows.length) {
      await baglanti.query("COMMIT");
      return;
    }

    const hediyeOdul = await baglanti.query("SELECT id FROM oduller WHERE kod='ye-kazan-burger' AND aktif=true");
    const odulId = hediyeOdul.rows[0]?.id;
    const burgerler = await baglanti.query(`
      SELECT s.kullanici_id,
        COALESCE(SUM(CASE WHEN kalem->>'kategori'='Burgerler' THEN
          GREATEST(1,CASE WHEN COALESCE(kalem->>'adet','') ~ '^[0-9]+$'
            THEN (kalem->>'adet')::int ELSE 1 END) ELSE 0 END),0)::int AS adet
      FROM kullanici_siparisleri s
      CROSS JOIN LATERAL jsonb_array_elements(s.urunler) kalem
      WHERE s.tutar > 0
      GROUP BY s.kullanici_id
    `);
    for (const kayit of burgerler.rows) {
      const adet = Number(kayit.adet || 0);
      await baglanti.query("UPDATE kullanicilar SET burger_damga=$1 WHERE id=$2", [adet % BURGER_DAMGA_HEDEFI, kayit.kullanici_id]);
      if (odulId) {
        for (let sira = 0; sira < Math.floor(adet / BURGER_DAMGA_HEDEFI); sira += 1) {
          await baglanti.query(
            `INSERT INTO kullanici_odulleri (kullanici_id,odul_id,kaynak_tur,harcanan_puan)
             VALUES ($1,$2,'gecmis',0)`,
            [kayit.kullanici_id, odulId]
          );
        }
      }
    }
    await baglanti.query(
      "INSERT INTO sistem_ayarlari (anahtar,deger) VALUES ('sadakat_backend_v1',$1::jsonb)",
      [JSON.stringify({ tarih: new Date().toISOString() })]
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

export async function sadakatOzetiniGetir(pool, kullaniciId) {
  const [kullanici, oduller, hareketler, hediyeler] = await Promise.all([
    pool.query("SELECT puan,burger_damga FROM kullanicilar WHERE id=$1", [kullaniciId]),
    pool.query("SELECT id,ad,puan,urun_id,gorsel FROM oduller WHERE aktif=true AND market_aktif=true ORDER BY puan,id"),
    pool.query(
      `SELECT id,puan,aciklama,olusturma FROM puan_hareketleri
       WHERE kullanici_id=$1 ORDER BY olusturma DESC LIMIT 100`,
      [kullaniciId]
    ),
    pool.query(
      `SELECT ko.*,o.ad,o.gorsel,oi.siparis_no
       FROM kullanici_odulleri ko
       JOIN oduller o ON o.id=ko.odul_id
       LEFT JOIN odeme_islemleri oi ON oi.id=ko.kullanilan_odeme_id
       WHERE ko.kullanici_id=$1 ORDER BY ko.olusturma DESC LIMIT 200`,
      [kullaniciId]
    ),
  ]);
  if (!kullanici.rows.length) throw new Error("Kullanıcı bulunamadı.");
  return {
    puan: Number(kullanici.rows[0].puan || 0),
    burgerDamga: Number(kullanici.rows[0].burger_damga || 0),
    burgerDamgaHedef: BURGER_DAMGA_HEDEFI,
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

export async function puanlaOdulSatinAl(pool, kullaniciId, odulId, istekAnahtari) {
  if (!UUID_DESENI.test(String(istekAnahtari || ""))) throw new Error("Ödül işlem anahtarı geçersiz.");
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    await baglanti.query("SELECT id FROM kullanicilar WHERE id=$1 FOR UPDATE", [kullaniciId]);
    const mevcut = await baglanti.query(
      "SELECT id FROM kullanici_odulleri WHERE kullanici_id=$1 AND istek_anahtari=$2",
      [kullaniciId, istekAnahtari]
    );
    if (mevcut.rows.length) {
      await baglanti.query("COMMIT");
      return { tekrar: true };
    }
    const odul = await baglanti.query(
      `SELECT id,ad,puan FROM oduller
       WHERE id=$1 AND aktif=true AND market_aktif=true FOR SHARE`,
      [odulId]
    );
    if (!odul.rows.length) throw new Error("Ödül bulunamadı veya kullanıma kapalı.");
    const puan = Number(odul.rows[0].puan);
    const puanSonucu = await baglanti.query(
      "UPDATE kullanicilar SET puan=puan-$1 WHERE id=$2 AND puan >= $1 RETURNING puan",
      [puan, kullaniciId]
    );
    if (!puanSonucu.rows.length) throw new Error("Bu ödül için yeterli puanın yok.");
    await baglanti.query(
      `INSERT INTO kullanici_odulleri
        (kullanici_id,odul_id,kaynak_tur,harcanan_puan,istek_anahtari)
       VALUES ($1,$2,'puan',$3,$4)`,
      [kullaniciId, odul.rows[0].id, puan, istekAnahtari]
    );
    await baglanti.query(
      `INSERT INTO puan_hareketleri (kullanici_id,tur,puan,aciklama)
       VALUES ($1,'odul_harcamasi',$2,$3)`,
      [kullaniciId, -puan, `Ödül alındı: ${odul.rows[0].ad}`]
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

export async function adminOdulleriGetir(pool) {
  const sonuc = await pool.query(`SELECT o.id,o.ad,o.puan,o.urun_id,o.gorsel,o.market_aktif,u.ad AS urun_ad,(SELECT COUNT(*)::int FROM kullanici_odulleri ko WHERE ko.odul_id=o.id) AS kazanilma_sayisi FROM oduller o JOIN urunler u ON u.id=o.urun_id WHERE o.market_aktif=true OR o.kod LIKE 'puan-%' OR o.kod LIKE 'admin-%' ORDER BY o.puan,o.id`);
  return sonuc.rows.map((odul) => ({ id: Number(odul.id), ad: odul.ad, puan: Number(odul.puan), urunId: Number(odul.urun_id), urunAd: odul.urun_ad, gorsel: odul.gorsel || null, aktif: odul.market_aktif, kazanilmaSayisi: Number(odul.kazanilma_sayisi || 0) }));
}

export async function adminOdulKaydet(pool, veri) {
  const id = veri.id == null || veri.id === "" ? null : Number(veri.id), ad = String(veri.ad || "").trim().slice(0, 120), puan = Math.floor(Number(veri.puan)), urunId = Number(veri.urunId), gorsel = String(veri.gorsel || "").trim().slice(0, 1000) || null;
  if (!ad || !Number.isInteger(puan) || puan < 1 || puan > 1_000_000) throw new Error("Ödül adı ve geçerli puan tutarı zorunludur.");
  if (!Number.isSafeInteger(urunId) || urunId < 1) throw new Error("Ödül için geçerli bir ürün seçin.");
  const urun = await pool.query("SELECT id,ad,gorsel FROM urunler WHERE id=$1", [urunId]);
  if (!urun.rows.length) throw new Error("Ödüle bağlanacak ürün bulunamadı.");
  if (id) {
    const mevcut = await pool.query(`SELECT o.urun_id,(SELECT COUNT(*)::int FROM kullanici_odulleri ko WHERE ko.odul_id=o.id) kazanilma_sayisi FROM oduller o WHERE o.id=$1 AND (o.market_aktif=true OR o.kod LIKE 'puan-%' OR o.kod LIKE 'admin-%')`, [id]);
    if (!mevcut.rows.length) throw new Error("Puan marketi ödülü bulunamadı.");
    if (Number(mevcut.rows[0].urun_id) !== urunId && Number(mevcut.rows[0].kazanilma_sayisi) > 0) throw new Error("Daha önce kazanılmış bu ödülün ürünü değiştirilemez; yeni bir ödül oluşturun.");
    const sonuc = await pool.query(`UPDATE oduller SET ad=$1,puan=$2,urun_id=$3,gorsel=$4,market_aktif=$5,guncelleme=NOW() WHERE id=$6 RETURNING id`, [ad, puan, urunId, gorsel || urun.rows[0].gorsel, veri.aktif !== false, id]);
    if (!sonuc.rows.length) throw new Error("Puan marketi ödülü bulunamadı.");
  } else {
    await pool.query(`INSERT INTO oduller (kod,ad,puan,urun_id,gorsel,market_aktif,aktif) VALUES ($1,$2,$3,$4,$5,$6,true)`, [`admin-${randomUUID()}`, ad, puan, urunId, gorsel || urun.rows[0].gorsel, veri.aktif !== false]);
  }
  return adminOdulleriGetir(pool);
}

export async function odemeSadakatiniUygula(baglanti, odeme) {
  if (!odeme.kullanici_id) return { burgerDamga: null, kazanilanHediye: 0 };
  const burgerAdet = (Array.isArray(odeme.urunler) ? odeme.urunler : [])
    .filter((urun) => urun.kategori === "Burgerler")
    .reduce((toplam, urun) => toplam + Math.max(1, Number(urun.adet || 1)), 0);
  if (!burgerAdet) {
    const mevcut = await baglanti.query("SELECT burger_damga FROM kullanicilar WHERE id=$1", [odeme.kullanici_id]);
    return { burgerDamga: Number(mevcut.rows[0]?.burger_damga || 0), kazanilanHediye: 0 };
  }

  const kullanici = await baglanti.query("SELECT burger_damga FROM kullanicilar WHERE id=$1 FOR UPDATE", [odeme.kullanici_id]);
  const toplam = Number(kullanici.rows[0]?.burger_damga || 0) + burgerAdet;
  const kazanilanHediye = Math.floor(toplam / BURGER_DAMGA_HEDEFI);
  const burgerDamga = toplam % BURGER_DAMGA_HEDEFI;
  await baglanti.query("UPDATE kullanicilar SET burger_damga=$1 WHERE id=$2", [burgerDamga, odeme.kullanici_id]);

  if (kazanilanHediye > 0) {
    const odul = await baglanti.query("SELECT id FROM oduller WHERE kod='ye-kazan-burger' AND aktif=true");
    if (!odul.rows.length) throw new Error("Ye Kazan ödülü yapılandırılmamış.");
    for (let sira = 1; sira <= kazanilanHediye; sira += 1) {
      await baglanti.query(
        `INSERT INTO kullanici_odulleri
          (kullanici_id,odul_id,kaynak_tur,harcanan_puan,kaynak_odeme_id,kaynak_sira)
         VALUES ($1,$2,'ye_kazan',0,$3,$4)
         ON CONFLICT (kaynak_odeme_id,kaynak_sira) DO NOTHING`,
        [odeme.kullanici_id, odul.rows[0].id, odeme.id, sira]
      );
    }
  }
  return { burgerDamga, kazanilanHediye };
}

function odemeDonustur(odeme) {
  return {
    id: odeme.id,
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

export async function kullaniciOdulunuSipariseDonustur(pool, kullaniciId, kullaniciOduluId, masaNo, kisiAdi) {
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
       JOIN oduller o ON o.id=ko.odul_id
       JOIN urunler u ON u.id=o.urun_id
       WHERE ko.id=$1 AND ko.kullanici_id=$2 FOR UPDATE OF ko`,
      [odulId, kullaniciId]
    );
    if (!hediye.rows.length) throw new Error("Hediye bulunamadı.");
    const kayit = hediye.rows[0];
    if (kayit.durum === "kullanildi" && kayit.kullanilan_odeme_id) {
      const mevcutOdeme = await baglanti.query(
        "SELECT * FROM odeme_islemleri WHERE id=$1",
        [kayit.kullanilan_odeme_id]
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
        (id,kullanici_id,siparis_no,masa_no,siparis_tipi,yontem,kisi_adi,urunler,tutar,kazanilan_puan,saglayici,durum,basarili_at)
       VALUES ($1,$2,$3,$4,$5,'odul',$6,$7::jsonb,0,0,'odul','basarili',NOW()) RETURNING *`,
      [odemeId, kullaniciId, siparisNo, guvenliMasa, guvenliMasa ? "masa" : "algotur", kisiAdi, JSON.stringify([urun])]
    );
    await baglanti.query(
      `UPDATE kullanici_odulleri SET durum='kullanildi',kullanilan_odeme_id=$1,kullanilma=NOW()
       WHERE id=$2`,
      [odemeId, odulId]
    );
    await baglanti.query(
      `INSERT INTO kullanici_siparisleri
        (kullanici_id,siparis_no,masa_no,tip,urunler,tutar,kazanilan_puan,durum)
       VALUES ($1,$2,$3,$4,$5::jsonb,0,0,'hazirlaniyor')
       ON CONFLICT (kullanici_id,siparis_no) DO NOTHING`,
      [kullaniciId, siparisNo, guvenliMasa, guvenliMasa ? "masa" : "algotur", JSON.stringify([urun])]
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
