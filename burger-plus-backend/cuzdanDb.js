import { randomUUID } from "crypto";

const UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isletmeIdZorunlu(isletmeId) {
  const id = Number(isletmeId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("isletmeId zorunlu");
  return id;
}

export function paraKurusunaCevir(deger) {
  const temiz = String(deger ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(temiz)) throw new Error("Geçerli bir yükleme tutarı girin.");
  const [lira, kurus = ""] = temiz.split(".");
  const sonuc = Number(lira) * 100 + Number(kurus.padEnd(2, "0"));
  if (!Number.isSafeInteger(sonuc)) throw new Error("Yükleme tutarı çok yüksek.");
  return sonuc;
}

export function bonusKurusunuHesapla(nakitKurus, bonusYuzde) {
  const bazPuan = Math.round(Number(bonusYuzde) * 100);
  return Math.round(Number(nakitKurus) * bazPuan / 10_000);
}

function paraDonustur(kurus) {
  return Number(kurus || 0) / 100;
}

export async function cuzdanTablolariHazirla(pool) {
  await pool.query("ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS bakiye_kurus BIGINT NOT NULL DEFAULT 0 CHECK (bakiye_kurus >= 0)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cuzdan_hareketleri (
      id UUID PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
      tur TEXT NOT NULL CHECK (tur IN ('nakit_yukleme','cuzdan_harcama','iade','duzeltme')),
      tutar_kurus BIGINT NOT NULL CHECK (tutar_kurus <> 0),
      nakit_tutar_kurus BIGINT NOT NULL DEFAULT 0 CHECK (nakit_tutar_kurus >= 0),
      bonus_tutar_kurus BIGINT NOT NULL DEFAULT 0 CHECK (bonus_tutar_kurus >= 0),
      bonus_yuzde NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (bonus_yuzde >= 0 AND bonus_yuzde <= 100),
      personel_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
      odeme_id UUID REFERENCES odeme_islemleri(id) ON DELETE RESTRICT,
      istek_anahtari UUID,
      aciklama TEXT NOT NULL,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS cuzdan_hareketleri_istek_unique
      ON cuzdan_hareketleri (isletme_id,istek_anahtari) WHERE istek_anahtari IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS cuzdan_hareketleri_odeme_unique
      ON cuzdan_hareketleri (isletme_id,odeme_id) WHERE odeme_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS cuzdan_hareketleri_kullanici_idx
      ON cuzdan_hareketleri (isletme_id,kullanici_id,olusturma DESC);
  `);
}

export async function cuzdanAyariniGetir(isletmeId, veritabani) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const sonuc = await veritabani.query(
    "SELECT deger FROM sistem_ayarlari WHERE isletme_id=$1 AND anahtar='cuzdan_kurulum_v1'",
    [tenantId]
  );
  const ayar = sonuc.rows[0]?.deger || {};
  const bonusYuzde = Number(ayar.bonusYuzde);
  const minYukleme = Number(ayar.minYukleme);
  const maxYukleme = Number(ayar.maxYukleme);
  return {
    aktif: ayar.aktif !== false,
    bonusAktif: ayar.bonusAktif !== false,
    bonusYuzde: Number.isFinite(bonusYuzde) && bonusYuzde >= 0 && bonusYuzde <= 100 ? bonusYuzde : 5,
    minYukleme: Number.isFinite(minYukleme) && minYukleme >= 1 ? minYukleme : 100,
    maxYukleme: Number.isFinite(maxYukleme) && maxYukleme >= 1 ? maxYukleme : 10_000,
    kampanyaBasligi: String(ayar.kampanyaBasligi || "Nakit yüklemene ekstra bakiye").trim().slice(0, 100),
    kampanyaAciklamasi: String(ayar.kampanyaAciklamasi || "Kasadan nakit yükle, bonus bakiyeni anında kullan.").trim().slice(0, 240),
  };
}

export async function adminCuzdanAyariniKaydet(isletmeId, pool, veri) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const bonusYuzde = Number(veri?.bonusYuzde);
  const minYukleme = Number(veri?.minYukleme);
  const maxYukleme = Number(veri?.maxYukleme);
  if (!Number.isFinite(bonusYuzde) || bonusYuzde < 0 || bonusYuzde > 100) throw new Error("Bonus oranı %0 ile %100 arasında olmalıdır.");
  if (!Number.isFinite(minYukleme) || minYukleme < 1) throw new Error("Minimum yükleme en az ₺1 olmalıdır.");
  if (!Number.isFinite(maxYukleme) || maxYukleme < minYukleme || maxYukleme > 1_000_000) throw new Error("Maksimum yükleme minimum tutardan büyük olmalıdır.");
  const ayar = {
    aktif: veri?.aktif !== false,
    bonusAktif: veri?.bonusAktif !== false,
    bonusYuzde: Math.round(bonusYuzde * 100) / 100,
    minYukleme: Math.round(minYukleme * 100) / 100,
    maxYukleme: Math.round(maxYukleme * 100) / 100,
    kampanyaBasligi: String(veri?.kampanyaBasligi || "").trim().slice(0, 100) || "Nakit yüklemene ekstra bakiye",
    kampanyaAciklamasi: String(veri?.kampanyaAciklamasi || "").trim().slice(0, 240),
  };
  await pool.query(
    `INSERT INTO sistem_ayarlari (isletme_id,anahtar,deger,guncelleme)
     VALUES ($1,'cuzdan_kurulum_v1',$2::jsonb,NOW())
     ON CONFLICT (isletme_id,anahtar) DO UPDATE SET deger=EXCLUDED.deger,guncelleme=NOW()`,
    [tenantId, JSON.stringify(ayar)]
  );
  return ayar;
}

function hareketDonustur(hareket) {
  return {
    id: hareket.id,
    tur: hareket.tur,
    tutar: paraDonustur(hareket.tutar_kurus),
    nakitTutar: paraDonustur(hareket.nakit_tutar_kurus),
    bonusTutar: paraDonustur(hareket.bonus_tutar_kurus),
    bonusYuzde: Number(hareket.bonus_yuzde || 0),
    aciklama: hareket.aciklama,
    tarih: hareket.olusturma,
    personelAdi: hareket.personel_adi || null,
  };
}

export async function cuzdanOzetiniGetir(isletmeId, pool, kullaniciId) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const [kullanici, hareketler, ayar] = await Promise.all([
    pool.query("SELECT bakiye_kurus FROM kullanicilar WHERE isletme_id=$1 AND id=$2", [tenantId, kullaniciId]),
    pool.query(
      `SELECT h.*,concat_ws(' ',p.ad,p.soyad) AS personel_adi
       FROM cuzdan_hareketleri h LEFT JOIN kullanicilar p ON p.isletme_id=$1 AND p.id=h.personel_id
       WHERE h.isletme_id=$1 AND h.kullanici_id=$2 ORDER BY h.olusturma DESC LIMIT 100`,
      [tenantId, kullaniciId]
    ),
    cuzdanAyariniGetir(tenantId, pool),
  ]);
  if (!kullanici.rows.length) throw new Error("Kullanıcı bulunamadı.");
  return { bakiye: paraDonustur(kullanici.rows[0].bakiye_kurus), ayar, hareketler: hareketler.rows.map(hareketDonustur) };
}

export async function kasaMusteriAra(isletmeId, pool, arama) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const temiz = String(arama || "").trim().slice(0, 100);
  if (temiz.length < 2) return [];
  const desen = `%${temiz}%`;
  const sonuc = await pool.query(
    `SELECT id,ad,soyad,email,telefon,bakiye_kurus FROM kullanicilar
     WHERE isletme_id=$1 AND rol='kullanici' AND
       (lower(email) LIKE lower($2) OR telefon LIKE $2 OR concat_ws(' ',ad,soyad) ILIKE $2 OR id::text=$3)
     ORDER BY ad,soyad LIMIT 12`,
    [tenantId, desen, temiz]
  );
  return sonuc.rows.map((k) => ({ id: Number(k.id), ad: k.ad, soyad: k.soyad, email: k.email, telefon: k.telefon || "", bakiye: paraDonustur(k.bakiye_kurus) }));
}

export async function kasaSonYuklemeleriGetir(isletmeId, pool, limit = 20) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const sonuc = await pool.query(
    `SELECT h.*,concat_ws(' ',k.ad,k.soyad) AS musteri_adi,concat_ws(' ',p.ad,p.soyad) AS personel_adi
     FROM cuzdan_hareketleri h
     JOIN kullanicilar k ON k.isletme_id=$1 AND k.id=h.kullanici_id
     LEFT JOIN kullanicilar p ON p.isletme_id=$1 AND p.id=h.personel_id
     WHERE h.isletme_id=$1 AND h.tur='nakit_yukleme' ORDER BY h.olusturma DESC LIMIT $2`,
    [tenantId, Math.min(100, Math.max(1, Number(limit) || 20))]
  );
  return sonuc.rows.map((h) => ({ ...hareketDonustur(h), musteriAdi: h.musteri_adi, kullaniciId: Number(h.kullanici_id) }));
}

export async function adminCuzdanRaporunuGetir(isletmeId, pool) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const [hareket, bakiye] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(nakit_tutar_kurus) FILTER (WHERE tur='nakit_yukleme'),0)::bigint AS toplam_nakit,
         COALESCE(SUM(bonus_tutar_kurus) FILTER (WHERE tur='nakit_yukleme'),0)::bigint AS toplam_bonus,
         COALESCE(SUM(nakit_tutar_kurus) FILTER (WHERE tur='nakit_yukleme' AND olusturma::date=CURRENT_DATE),0)::bigint AS bugun_nakit,
         COUNT(DISTINCT kullanici_id) FILTER (WHERE tur='nakit_yukleme') AS yukleme_yapan
       FROM cuzdan_hareketleri WHERE isletme_id=$1`,
      [tenantId]
    ),
    pool.query("SELECT COALESCE(SUM(bakiye_kurus),0)::bigint AS toplam_bakiye FROM kullanicilar WHERE isletme_id=$1 AND rol='kullanici'", [tenantId]),
  ]);
  const h = hareket.rows[0] || {};
  return {
    toplamNakit: paraDonustur(h.toplam_nakit),
    toplamBonus: paraDonustur(h.toplam_bonus),
    bugunNakit: paraDonustur(h.bugun_nakit),
    yuklemeYapanMusteri: Number(h.yukleme_yapan || 0),
    dolasimdakiBakiye: paraDonustur(bakiye.rows[0]?.toplam_bakiye),
  };
}

export async function kasadanCuzdanYukle(isletmeId, pool, personelId, veri) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const kullaniciId = Number(veri?.kullaniciId);
  const istekAnahtari = String(veri?.istekAnahtari || "").trim();
  if (!Number.isSafeInteger(kullaniciId) || kullaniciId < 1) throw new Error("Yükleme yapılacak müşteriyi seçin.");
  if (!UUID_DESENI.test(istekAnahtari)) throw new Error("Yükleme işlem anahtarı geçersiz.");
  const nakitKurus = paraKurusunaCevir(veri?.tutar);
  const ayar = await cuzdanAyariniGetir(tenantId, pool);
  if (!ayar.aktif) throw new Error("İşletme cüzdan yüklemelerini şu anda durdurmuş.");
  const minKurus = paraKurusunaCevir(ayar.minYukleme);
  const maxKurus = paraKurusunaCevir(ayar.maxYukleme);
  if (nakitKurus < minKurus || nakitKurus > maxKurus) throw new Error(`Yükleme ₺${ayar.minYukleme} ile ₺${ayar.maxYukleme} arasında olmalıdır.`);
  const bonusYuzde = ayar.bonusAktif ? ayar.bonusYuzde : 0;
  const bonusKurus = bonusKurusunuHesapla(nakitKurus, bonusYuzde);
  const toplamKurus = nakitKurus + bonusKurus;
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const kullanici = await baglanti.query(
      "SELECT id,ad,soyad,bakiye_kurus FROM kullanicilar WHERE isletme_id=$1 AND id=$2 AND rol='kullanici' FOR UPDATE",
      [tenantId, kullaniciId]
    );
    if (!kullanici.rows.length) throw new Error("Müşteri bulunamadı.");
    const mevcut = await baglanti.query("SELECT * FROM cuzdan_hareketleri WHERE isletme_id=$1 AND istek_anahtari=$2", [tenantId, istekAnahtari]);
    if (mevcut.rows.length) {
      await baglanti.query("COMMIT");
      return { ...hareketDonustur(mevcut.rows[0]), bakiye: paraDonustur(kullanici.rows[0].bakiye_kurus), tekrar: true };
    }
    const bakiye = await baglanti.query(
      "UPDATE kullanicilar SET bakiye_kurus=bakiye_kurus+$1 WHERE isletme_id=$2 AND id=$3 RETURNING bakiye_kurus",
      [toplamKurus, tenantId, kullaniciId]
    );
    const hareket = await baglanti.query(
      `INSERT INTO cuzdan_hareketleri
        (id,isletme_id,kullanici_id,tur,tutar_kurus,nakit_tutar_kurus,bonus_tutar_kurus,bonus_yuzde,personel_id,istek_anahtari,aciklama)
       VALUES ($1,$2,$3,'nakit_yukleme',$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [randomUUID(), tenantId, kullaniciId, toplamKurus, nakitKurus, bonusKurus, bonusYuzde, personelId, istekAnahtari,
        bonusKurus > 0 ? `Kasadan nakit yükleme + %${bonusYuzde} hediye` : "Kasadan nakit yükleme"]
    );
    await baglanti.query("COMMIT");
    return { ...hareketDonustur(hareket.rows[0]), bakiye: paraDonustur(bakiye.rows[0].bakiye_kurus), tekrar: false };
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
}
