import pool from "./db.js";
import { KONSEPTLER, temaGirdisiniTemizle } from "./konseptler.js";

const TENANT_TABLOLARI = [
  "kullanicilar",
  "urunler",
  "kategoriler",
  "kampanyalar",
  "duyurular",
  "oduller",
  "kullanici_odulleri",
  "puan_hareketleri",
  "davet_odulleri",
  "personeller",
  "vardiyalar",
  "oturumlar",
  "siparis_kalemleri",
  "kullanici_siparisleri",
  "odeme_islemleri",
  "sistem_ayarlari",
  "revizyon_kayitlari",
];

const SLUG_DESENI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isletmeIdDogrula(isletmeId) {
  const id = Number(isletmeId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("isletmeId zorunlu");
  return id;
}

function isletmeDonustur(kayit) {
  if (!kayit) return null;
  return {
    id: Number(kayit.id),
    slug: kayit.slug,
    ad: kayit.ad,
    konsept: kayit.konsept,
    logoUrl: kayit.logo_url || null,
    tema: kayit.tema || {},
    aktif: kayit.aktif === true,
    olusturma: kayit.olusturma,
  };
}

export async function isletmeTablosunuHazirla() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS isletmeler (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      ad TEXT NOT NULL,
      konsept TEXT NOT NULL DEFAULT 'burger',
      logo_url TEXT,
      tema JSONB DEFAULT '{}'::jsonb,
      aktif BOOLEAN NOT NULL DEFAULT true,
      olusturma TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const sonuc = await pool.query(
    `INSERT INTO isletmeler (slug,ad,konsept)
     VALUES ('burger-plus','Burger Plus','burger')
     ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug
     RETURNING *`
  );
  const varsayilanId = Number(sonuc.rows[0].id);
  // Eski kurulumda tablolar zaten varsa, tenant kullanan başlangıç migration'ları
  // çalışmadan önce sütunu güvenli biçimde hazırla. Tam FK/NOT NULL/index adımı
  // bütün tablolar oluşturulduktan sonra isletmeMigrationunuCalistir içindedir.
  for (const tablo of TENANT_TABLOLARI) {
    const varMi = await pool.query("SELECT to_regclass($1) AS tablo", [`public.${tablo}`]);
    if (!varMi.rows[0]?.tablo) continue;
    await pool.query(`ALTER TABLE ${tablo} ADD COLUMN IF NOT EXISTS isletme_id INTEGER`);
    await pool.query(`UPDATE ${tablo} SET isletme_id=$1 WHERE isletme_id IS NULL`, [varsayilanId]);
  }
  return isletmeDonustur(sonuc.rows[0]);
}

export async function isletmeMigrationunuCalistir() {
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    await baglanti.query("SELECT pg_advisory_xact_lock(hashtext('burger_plus_tenant_v1'))");
    await baglanti.query(`
      CREATE TABLE IF NOT EXISTS isletmeler (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        ad TEXT NOT NULL,
        konsept TEXT NOT NULL DEFAULT 'burger',
        logo_url TEXT,
        tema JSONB DEFAULT '{}'::jsonb,
        aktif BOOLEAN NOT NULL DEFAULT true,
        olusturma TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const varsayilan = await baglanti.query(
      `INSERT INTO isletmeler (slug,ad,konsept)
       VALUES ('burger-plus','Burger Plus','burger')
       ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug
       RETURNING id`
    );
    const varsayilanId = Number(varsayilan.rows[0].id);

    for (const tablo of TENANT_TABLOLARI) {
      const varMi = await baglanti.query("SELECT to_regclass($1) AS tablo", [`public.${tablo}`]);
      if (!varMi.rows[0]?.tablo) throw new Error(`Tenant migration tablosu bulunamadı: ${tablo}`);
      await baglanti.query(`ALTER TABLE ${tablo} ADD COLUMN IF NOT EXISTS isletme_id INTEGER`);
      await baglanti.query(`UPDATE ${tablo} SET isletme_id=$1 WHERE isletme_id IS NULL`, [varsayilanId]);
      await baglanti.query(`ALTER TABLE ${tablo} ALTER COLUMN isletme_id SET NOT NULL`);
      await baglanti.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname='${tablo}_isletme_id_fkey'
          ) THEN
            ALTER TABLE ${tablo} ADD CONSTRAINT ${tablo}_isletme_id_fkey
              FOREIGN KEY (isletme_id) REFERENCES isletmeler(id) ON DELETE CASCADE;
          END IF;
        END $$
      `);
      await baglanti.query(`CREATE INDEX IF NOT EXISTS ${tablo}_isletme ON ${tablo}(isletme_id)`);
    }

    // Aynı e-posta farklı işletmelerde ayrı hesap olabilir.
    await baglanti.query("ALTER TABLE kullanicilar DROP CONSTRAINT IF EXISTS kullanicilar_email_key");
    await baglanti.query("DROP INDEX IF EXISTS kullanicilar_email_key");
    await baglanti.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS kullanicilar_isletme_email ON kullanicilar(isletme_id,lower(email))"
    );

    // Personel e-postası ve işletme ayar anahtarı da tenant kapsamında benzersizdir.
    await baglanti.query("ALTER TABLE personeller DROP CONSTRAINT IF EXISTS personeller_email_key");
    await baglanti.query("DROP INDEX IF EXISTS personeller_email_key");
    await baglanti.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS personeller_isletme_email ON personeller(isletme_id,lower(email))"
    );
    await baglanti.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname='sistem_ayarlari_pkey'
            AND conrelid='sistem_ayarlari'::regclass
            AND pg_get_constraintdef(oid) NOT ILIKE '%isletme_id%'
        ) THEN
          ALTER TABLE sistem_ayarlari DROP CONSTRAINT sistem_ayarlari_pkey;
        END IF;
      END $$
    `);
    await baglanti.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS sistem_ayarlari_isletme_anahtar ON sistem_ayarlari(isletme_id,anahtar)"
    );

    // Daha önce global benzersiz olan yönetim kod/ad alanları işletme içinde
    // benzersiz kalır; farklı işletmeler aynı adı veya kodu kullanabilir.
    await baglanti.query("ALTER TABLE kategoriler DROP CONSTRAINT IF EXISTS kategoriler_ad_key");
    await baglanti.query("ALTER TABLE kampanyalar DROP CONSTRAINT IF EXISTS kampanyalar_kod_key");
    await baglanti.query("ALTER TABLE oduller DROP CONSTRAINT IF EXISTS oduller_kod_key");
    await baglanti.query("CREATE UNIQUE INDEX IF NOT EXISTS kategoriler_isletme_ad ON kategoriler(isletme_id,ad)");
    await baglanti.query("CREATE UNIQUE INDEX IF NOT EXISTS kampanyalar_isletme_kod ON kampanyalar(isletme_id,kod)");
    await baglanti.query("CREATE UNIQUE INDEX IF NOT EXISTS oduller_isletme_kod ON oduller(isletme_id,kod)");

    // Açık masa ve tenant içi kod benzersizliklerini tenant bileşik indekslerine taşı.
    await baglanti.query("DROP INDEX IF EXISTS tek_acik_oturum_masa");
    await baglanti.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS tek_acik_oturum_masa_isletme ON oturumlar(isletme_id,masa_no) WHERE durum='acik'"
    );
    await baglanti.query("DROP INDEX IF EXISTS kullanicilar_davet_kodu_unique");
    await baglanti.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS kullanicilar_isletme_davet_kodu ON kullanicilar(isletme_id,davet_kodu) WHERE davet_kodu IS NOT NULL"
    );

    await baglanti.query("COMMIT");
    return varsayilanId;
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
}

// Kayıpsız geri dönüş yalnızca sistem hâlâ tek varsayılan işletmedeyken
// mümkündür. İkinci bir tenant oluştuysa kolonları kaldırmak veri sınırlarını
// yok edeceği için işlem bilinçli olarak durdurulur.
export async function isletmeMigrationunuGeriAl() {
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    await baglanti.query("SELECT pg_advisory_xact_lock(hashtext('burger_plus_tenant_v1_rollback'))");
    const digerIsletmeler = await baglanti.query("SELECT COUNT(*)::int AS adet FROM isletmeler WHERE slug<>'burger-plus'");
    if (Number(digerIsletmeler.rows[0].adet) > 0) {
      throw new Error("Birden fazla işletme varken tenant migration'ı kayıpsız geri alınamaz.");
    }

    await baglanti.query(`
      DROP INDEX IF EXISTS kullanicilar_isletme_email;
      DROP INDEX IF EXISTS personeller_isletme_email;
      DROP INDEX IF EXISTS sistem_ayarlari_isletme_anahtar;
      DROP INDEX IF EXISTS kategoriler_isletme_ad;
      DROP INDEX IF EXISTS kampanyalar_isletme_kod;
      DROP INDEX IF EXISTS oduller_isletme_kod;
      DROP INDEX IF EXISTS tek_acik_oturum_masa_isletme;
      DROP INDEX IF EXISTS kullanicilar_isletme_davet_kodu;

      ALTER TABLE sistem_ayarlari DROP CONSTRAINT IF EXISTS sistem_ayarlari_pkey;
      ALTER TABLE kullanicilar ADD CONSTRAINT kullanicilar_email_key UNIQUE (email);
      ALTER TABLE personeller ADD CONSTRAINT personeller_email_key UNIQUE (email);
      ALTER TABLE kategoriler ADD CONSTRAINT kategoriler_ad_key UNIQUE (ad);
      ALTER TABLE kampanyalar ADD CONSTRAINT kampanyalar_kod_key UNIQUE (kod);
      ALTER TABLE oduller ADD CONSTRAINT oduller_kod_key UNIQUE (kod);
      ALTER TABLE sistem_ayarlari ADD CONSTRAINT sistem_ayarlari_pkey PRIMARY KEY (anahtar);
      CREATE UNIQUE INDEX tek_acik_oturum_masa ON oturumlar(masa_no) WHERE durum='acik';
      CREATE UNIQUE INDEX kullanicilar_davet_kodu_unique ON kullanicilar(davet_kodu) WHERE davet_kodu IS NOT NULL;
    `);

    for (const tablo of [...TENANT_TABLOLARI].reverse()) {
      await baglanti.query(`ALTER TABLE ${tablo} DROP CONSTRAINT IF EXISTS ${tablo}_isletme_id_fkey`);
      await baglanti.query(`DROP INDEX IF EXISTS ${tablo}_isletme`);
      await baglanti.query(`ALTER TABLE ${tablo} DROP COLUMN IF EXISTS isletme_id`);
    }
    await baglanti.query("DROP TABLE isletmeler");
    await baglanti.query("COMMIT");
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
}

export async function isletmeSlugIleGetir(slug) {
  const temizSlug = String(slug || "").trim().toLowerCase();
  if (!SLUG_DESENI.test(temizSlug) || temizSlug.length > 80) return null;
  const sonuc = await pool.query("SELECT * FROM isletmeler WHERE slug=$1", [temizSlug]);
  return isletmeDonustur(sonuc.rows[0]);
}

export async function isletmeIdIleGetir(id) {
  const isletmeId = isletmeIdDogrula(id);
  const sonuc = await pool.query("SELECT * FROM isletmeler WHERE id=$1", [isletmeId]);
  return isletmeDonustur(sonuc.rows[0]);
}

export async function isletmeleriGetir() {
  const sonuc = await pool.query("SELECT * FROM isletmeler ORDER BY ad,id");
  return sonuc.rows.map(isletmeDonustur);
}

export async function isletmeOlustur(veri = {}) {
  const slug = String(veri.slug || "").trim().toLowerCase();
  const ad = String(veri.ad || "").trim().slice(0, 160);
  const konsept = String(veri.konsept || "burger").trim().toLowerCase().slice(0, 60) || "burger";
  const logoUrl = String(veri.logoUrl || "").trim().slice(0, 1000) || null;
  if (!SLUG_DESENI.test(slug) || slug.length > 80) throw new Error("İşletme slug bilgisi geçersiz.");
  if (ad.length < 2) throw new Error("İşletme adı zorunludur.");
  if (!KONSEPTLER[konsept]) throw new Error("Konsept yalnızca burger, cafe veya pizza olabilir.");
  const temizTema = temaGirdisiniTemizle(veri.tema || {}, { konsept, tema: {} }).tema;
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const sonuc = await baglanti.query(
      `INSERT INTO isletmeler (slug,ad,konsept,logo_url,tema,aktif)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
      [slug, ad, konsept, logoUrl, JSON.stringify(temizTema), veri.aktif !== false]
    );
    const isletme = isletmeDonustur(sonuc.rows[0]);
    for (const [sira, kategori] of KONSEPTLER[konsept].kategoriler.entries()) {
      await baglanti.query(
        `INSERT INTO kategoriler (isletme_id,ad,sira,aktif)
         VALUES ($1,$2,$3,true) ON CONFLICT (isletme_id,ad) DO NOTHING`,
        [isletme.id, kategori, (sira + 1) * 10]
      );
    }
    await baglanti.query("COMMIT");
    return isletme;
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
}

export async function isletmeTemasiniGuncelle(isletmeId, girdi = {}) {
  const id = isletmeIdDogrula(isletmeId);
  const mevcut = await isletmeIdIleGetir(id);
  if (!mevcut) throw new Error("İşletme bulunamadı.");
  const temiz = temaGirdisiniTemizle(girdi, mevcut);
  const sonuc = await pool.query(
    `UPDATE isletmeler SET konsept=$2,tema=$3::jsonb WHERE id=$1 RETURNING *`,
    [id, temiz.konsept, JSON.stringify(temiz.tema)]
  );
  return isletmeDonustur(sonuc.rows[0]);
}

export async function isletmeLogosunuGuncelle(isletmeId, logoUrl) {
  const id = isletmeIdDogrula(isletmeId);
  const url = String(logoUrl || "").trim().slice(0, 1000) || null;
  const sonuc = await pool.query(
    "UPDATE isletmeler SET logo_url=$2 WHERE id=$1 RETURNING *",
    [id, url]
  );
  if (!sonuc.rows.length) throw new Error("İşletme bulunamadı.");
  return isletmeDonustur(sonuc.rows[0]);
}

export { TENANT_TABLOLARI };
