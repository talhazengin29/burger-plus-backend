// ============================================================================
// Veritabanı katmanı — PostgreSQL (pg kütüphanesi)
//
// SQLite'tan farkı: PostgreSQL ayrı bir sunucu ve ASENKRON çalışır.
// Yani her sorgu bir "söz" (Promise) döndürür, önüne await koyarız.
// Bağlantı bilgileri .env dosyasından gelir.
// ============================================================================

import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

// Bağlantı havuzu: birden çok istek aynı anda gelince verimli yönetir.
//
// İKİ KULLANIM ŞEKLİ:
// 1) Yerel geliştirme: .env'de PGHOST/PGUSER/PGPASSWORD/PGDATABASE ayrı ayrı
// 2) Yayın (Supabase/Render): tek satır DATABASE_URL
//
// SSL: Bulut veritabanları (Supabase vb.) SSL ister. Yerel PostgreSQL genelde
// desteklemez. PGSSL=kapali yazarsan SSL'siz bağlanır.
const baglantiUrl = process.env.DATABASE_URL;
const sslKapali = process.env.PGSSL === "kapali";

const pool = baglantiUrl
  ? new Pool({
      connectionString: baglantiUrl,
      ssl: sslKapali ? false : { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

// --- Tabloları oluştur (yoksa) ---
export async function tablolariHazirla() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oturumlar (
      id SERIAL PRIMARY KEY,
      masa_no TEXT NOT NULL,
      durum TEXT NOT NULL DEFAULT 'acik',
      olusturma TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS siparis_kalemleri (
      id SERIAL PRIMARY KEY,
      oturum_id INTEGER NOT NULL REFERENCES oturumlar(id),
      urun_id INTEGER NOT NULL,
      urun_ad TEXT NOT NULL,
      fiyat NUMERIC NOT NULL,
      adet INTEGER NOT NULL DEFAULT 1,
      kisi_adi TEXT,
      durum TEXT NOT NULL DEFAULT 'yeni',
      odendi BOOLEAN NOT NULL DEFAULT false,
      secimler JSONB NOT NULL DEFAULT '{}'::jsonb,
      olusturma TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: eski kurulumlarda ürün özelleştirmelerini güvenli JSON olarak sakla.
  await pool.query(`
    ALTER TABLE siparis_kalemleri
    ADD COLUMN IF NOT EXISTS secimler JSONB NOT NULL DEFAULT '{}'::jsonb
  `);

  // Kullanıcılar tablosu. rol='kullanici' varsayılan; admin elle işaretlenir:
  //   UPDATE kullanicilar SET rol='admin' WHERE email='...';
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kullanicilar (
      id SERIAL PRIMARY KEY,
      ad TEXT NOT NULL,
      soyad TEXT NOT NULL,
      cinsiyet TEXT,
      email TEXT NOT NULL UNIQUE,
      telefon TEXT,
      sifre_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'kullanici',
      puan INTEGER NOT NULL DEFAULT 0,
      olusturma TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // --- Migration: mevcut tablolarda olusturma sütununu TIMESTAMPTZ'ye çevir ---
  // Eski kurulumda TIMESTAMP (timezone'suz) kaydedilmişse saat 3 saat kayıyordu.
  // TIMESTAMPTZ'ye çevirirken mevcut değerleri UTC kabul edip düzeltiyoruz.
  const zamanSutunlari = [
    ["siparis_kalemleri", "olusturma"],
    ["oturumlar", "olusturma"],
    ["kullanicilar", "olusturma"],
  ];
  for (const [tablo, sutun] of zamanSutunlari) {
    try {
      const tip = await pool.query(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = $1 AND column_name = $2`,
        [tablo, sutun]
      );
      // Sadece hâlâ timezone'suz ise çevir ("timestamp without time zone")
      if (tip.rows[0]?.data_type === "timestamp without time zone") {
        await pool.query(
          `ALTER TABLE ${tablo}
           ALTER COLUMN ${sutun} TYPE TIMESTAMPTZ
           USING ${sutun} AT TIME ZONE 'UTC'`
        );
        console.log(`Migration: ${tablo}.${sutun} → TIMESTAMPTZ`);
      }
    } catch (e) {
      console.log(`Migration atlandı (${tablo}.${sutun}):`, e.message);
    }
  }

  // Eski sürüm aynı masaya ürünleri eşzamanlı eklerken birden fazla açık
  // oturum oluşturabiliyordu. Kalemleri en yeni oturumda birleştir, eski
  // oturumları kapat ve bunun tekrarını veritabanı seviyesinde engelle.
  const migration = await pool.connect();
  try {
    await migration.query("BEGIN");
    await migration.query(`
      WITH acik_oturumlar AS (
        SELECT id, masa_no, MAX(id) OVER (PARTITION BY masa_no) AS hedef_id
        FROM oturumlar WHERE durum='acik'
      )
      UPDATE siparis_kalemleri k
      SET oturum_id = a.hedef_id
      FROM acik_oturumlar a
      WHERE k.oturum_id = a.id AND a.id <> a.hedef_id
    `);
    await migration.query(`
      WITH acik_oturumlar AS (
        SELECT id, MAX(id) OVER (PARTITION BY masa_no) AS hedef_id
        FROM oturumlar WHERE durum='acik'
      )
      UPDATE oturumlar o SET durum='kapali'
      FROM acik_oturumlar a
      WHERE o.id=a.id AND a.id <> a.hedef_id
    `);
    await migration.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tek_acik_oturum_masa
      ON oturumlar (masa_no) WHERE durum='acik'
    `);
    await migration.query("COMMIT");
  } catch (e) {
    await migration.query("ROLLBACK");
    throw e;
  } finally {
    migration.release();
  }

  console.log("Veritabanı tabloları hazır.");
}

// Açık bir masa oturumu bul; yoksa oluştur.
export async function masaOturumuBulVeyaOlustur(masaNo) {
  const yeni = await pool.query(
    `INSERT INTO oturumlar (masa_no) VALUES ($1)
     ON CONFLICT (masa_no) WHERE durum='acik' DO NOTHING
     RETURNING *`,
    [masaNo]
  );
  if (yeni.rows.length) return yeni.rows[0];
  const mevcut = await pool.query(
    "SELECT * FROM oturumlar WHERE masa_no=$1 AND durum='acik' LIMIT 1",
    [masaNo]
  );
  return mevcut.rows[0];
}

// Bir masanin tum siparis kalemlerini getir (birlesik hesap).
export async function masaSiparisleriniGetir(masaNo) {
  const oturum = await pool.query(
    "SELECT * FROM oturumlar WHERE masa_no = $1 AND durum = 'acik' ORDER BY id DESC LIMIT 1",
    [masaNo]
  );
  if (oturum.rows.length === 0) {
    return { masaNo, oturumId: null, kalemler: [], toplam: 0 };
  }
  const oturumId = oturum.rows[0].id;

  const kalemler = await pool.query(
    "SELECT * FROM siparis_kalemleri WHERE oturum_id = $1 ORDER BY id",
    [oturumId]
  );
  // PostgreSQL NUMERIC alanları string olarak döner; frontend sayı bekliyor.
  const kalemlerNumerik = kalemler.rows.map((k) => ({
    ...k,
    fiyat: Number(k.fiyat),
    secimler: k.secimler || {},
    haricMalzemeler: k.secimler?.haricMalzemeler || [],
  }));
  const toplam = kalemlerNumerik.reduce(
    (t, k) => t + k.fiyat * k.adet,
    0
  );
  return { masaNo, oturumId, kalemler: kalemlerNumerik, toplam };
}

// Masaya yeni kalem ekle.
export async function kalemEkle(masaNo, urun, kisiAdi, gelenSecimler = {}, gelenHaricMalzemeler = [], siparisNo = null) {
  const oturum = await masaOturumuBulVeyaOlustur(masaNo);
  const haricAdaylari = Array.isArray(gelenHaricMalzemeler)
    ? gelenHaricMalzemeler
    : Array.isArray(urun.haricMalzemeler) ? urun.haricMalzemeler : [];
  const haricMalzemeler = haricAdaylari
    .filter((malzeme) => typeof malzeme === "string")
    .slice(0, 50)
    .map((malzeme) => malzeme.slice(0, 100));
  let guvenliSecimler = {};
  if (gelenSecimler && typeof gelenSecimler === "object" && !Array.isArray(gelenSecimler)) {
    try {
      const json = JSON.stringify(gelenSecimler);
      if (Buffer.byteLength(json, "utf8") <= 10_000) guvenliSecimler = JSON.parse(json);
    } catch {
      guvenliSecimler = {};
    }
  }
  // Eski istemciler eksik seçim gönderirse ürün kataloğundan tamamla.
  const urunMetaSonuc = await pool.query(
    "SELECT kategori, malzemeler, temel_miktar FROM urunler WHERE id=$1 LIMIT 1",
    [urun.id]
  );
  const urunMeta = urunMetaSonuc.rows[0] || {};
  const tumMalzemeler = Array.isArray(urun.malzemeler)
    ? urun.malzemeler
    : Array.isArray(urunMeta.malzemeler) ? urunMeta.malzemeler : [];
  const standartGramaj = Number(guvenliSecimler.standartGramaj || urun.temelMiktar || urunMeta.temel_miktar || 0);
  const ekstraGramaj = Number(guvenliSecimler.ekstraGramaj || 0);
  const secimler = {
    ...guvenliSecimler,
    haricMalzemeler,
    dahilMalzemeler: Array.isArray(guvenliSecimler.dahilMalzemeler)
      ? guvenliSecimler.dahilMalzemeler
      : tumMalzemeler.filter((m) => !haricMalzemeler.includes(m)),
    ...(standartGramaj > 0 ? {
      standartGramaj,
      ekstraGramaj,
      toplamGramaj: Number(guvenliSecimler.toplamGramaj || standartGramaj + ekstraGramaj),
      gramajBirim: guvenliSecimler.gramajBirim || (urunMeta.kategori === "İçecekler" ? "ml" : "gr"),
      gramajEtiketi: guvenliSecimler.gramajEtiketi || "Ürün miktarı",
    } : {}),
  };
  const adet = urun.adet || 1;
  await pool.query(
    `INSERT INTO siparis_kalemleri (oturum_id, urun_id, urun_ad, fiyat, adet, kisi_adi, secimler, siparis_no)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [oturum.id, urun.id, urun.ad, urun.fiyat, adet, kisiAdi || "Misafir", JSON.stringify(secimler), siparisNo]
  );
  return masaSiparisleriniGetir(masaNo);
}

// Mutfak: bir masanin tum kalemlerini belirli duruma gecir.
export async function masaDurumGuncelle(masaNo, durum) {
  const oturum = await pool.query(
    "SELECT * FROM oturumlar WHERE masa_no = $1 AND durum = 'acik' ORDER BY id DESC LIMIT 1",
    [masaNo]
  );
  if (oturum.rows.length === 0) return null;

  await pool.query(
    "UPDATE siparis_kalemleri SET durum = $1 WHERE oturum_id = $2",
    [durum, oturum.rows[0].id]
  );
  return masaSiparisleriniGetir(masaNo);
}

// Mutfak ekrani icin: tum acik masalarin (kalemi olan) siparisleri.
export async function tumAcikMasalar() {
  const oturumlar = await pool.query(
    "SELECT DISTINCT masa_no FROM oturumlar WHERE durum='acik' ORDER BY masa_no"
  );
  const sonuc = await Promise.all(oturumlar.rows.map((o) => masaSiparisleriniGetir(o.masa_no)));
  return sonuc.filter((masa) => masa.kalemler.length > 0);
}

// Salon personeli: masayi kapatir (musteriler kalkinca).
// Oturum 'kapali' olur; siparisler SILINMEZ (rapor icin arsivde kalir),
// ama yeni gelen musteri temiz masayla baslar (yeni oturum acilir).
export async function masaKapat(masaNo) {
  await pool.query(
    "UPDATE oturumlar SET durum = 'kapali' WHERE masa_no = $1 AND durum = 'acik'",
    [masaNo]
  );
  return masaSiparisleriniGetir(masaNo);
}

// ============================================================================
// Kullanici islemleri (auth)
// ============================================================================

// Yeni kullanici olustur (sifre zaten hash'lenmis gelir).
export async function kullaniciOlustur({ ad, soyad, cinsiyet, email, telefon, sifreHash }) {
  const sonuc = await pool.query(
    `INSERT INTO kullanicilar (ad, soyad, cinsiyet, email, telefon, sifre_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, ad, soyad, cinsiyet, email, telefon, rol, puan`,
    [ad, soyad, cinsiyet, email.toLowerCase(), telefon, sifreHash]
  );
  return sonuc.rows[0];
}

// E-posta ile kullanici bul (giris icin; sifre_hash dahil).
export async function kullaniciBulEmail(email) {
  const sonuc = await pool.query(
    "SELECT * FROM kullanicilar WHERE email = $1",
    [email.toLowerCase()]
  );
  return sonuc.rows[0] || null;
}

// ID ile kullanici bul (token dogrulamasi sonrasi; sifre_hash HARIC).
export async function kullaniciBulId(id) {
  const sonuc = await pool.query(
    "SELECT id, ad, soyad, cinsiyet, email, telefon, rol, puan FROM kullanicilar WHERE id = $1",
    [id]
  );
  return sonuc.rows[0] || null;
}

// Kullanicinin puanini guncelle.
export async function kullaniciPuanGuncelle(id, yeniPuan) {
  await pool.query("UPDATE kullanicilar SET puan = $1 WHERE id = $2", [yeniPuan, id]);
}

// Profil guncelle: SADECE email ve telefon degistirilebilir.
// ad, soyad, cinsiyet kalicidir (degistirilemez).
// email benzersiz olmali — baskasi kullaniyorsa hata doner.
export async function kullaniciProfilGuncelle(id, { email, telefon }) {
  // Yeni email baskasinda var mi?
  if (email) {
    const mevcut = await pool.query(
      "SELECT id FROM kullanicilar WHERE email = $1 AND id <> $2",
      [email.toLowerCase(), id]
    );
    if (mevcut.rows.length > 0) {
      return { hata: "Bu e-posta başka bir hesapta kullanılıyor." };
    }
  }
  const sonuc = await pool.query(
    `UPDATE kullanicilar SET email = $1, telefon = $2 WHERE id = $3
     RETURNING id, ad, soyad, cinsiyet, email, telefon, rol, puan`,
    [email.toLowerCase(), telefon, id]
  );
  return { kullanici: sonuc.rows[0] };
}

export default pool;
