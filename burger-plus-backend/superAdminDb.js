import bcrypt from "bcryptjs";
import pool, { davetKoduUret } from "./db.js";

const PLANLAR = new Set(["baslangic", "profesyonel", "kurumsal"]);
const ABONELIK_DURUMLARI = new Set(["aktif", "askida", "iptal", "deneme"]);
const KONSEPTLER = new Set(["burger", "cafe", "pizza"]);
const SLUG_DESENI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const sayi = (deger) => Number(deger || 0);
const metin = (deger, uzunluk = 500) => String(deger || "").trim().slice(0, uzunluk);
const emailGecerli = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const idDogrula = (deger, ad = "id") => {
  const id = Number(deger);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`${ad} geçersiz.`);
  return id;
};
const gunSayisi = (deger, varsayilan = 30, enFazla = 365) => Math.min(enFazla, Math.max(1, Number(deger) || varsayilan));
const tarihMetni = (deger) => deger instanceof Date ? deger.toISOString().slice(0, 10) : metin(deger, 10);
const isoTarihGecerli = (deger) => {
  const tarih = metin(deger, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(tarih) && new Date(`${tarih}T00:00:00.000Z`).toISOString().slice(0, 10) === tarih;
};

function raporAraliginiDogrula(gun, baslangic, bitis) {
  const ilk = metin(baslangic, 10), son = metin(bitis, 10);
  if (!ilk && !son) return { gun: gunSayisi(gun), baslangic: null, bitis: null };
  if (!isoTarihGecerli(ilk) || !isoTarihGecerli(son) || son < ilk) throw new Error("Rapor tarih aralığı geçersiz.");
  const fark = Math.floor((Date.parse(`${son}T00:00:00Z`) - Date.parse(`${ilk}T00:00:00Z`)) / 86400000) + 1;
  if (fark > 366) throw new Error("Özel rapor aralığı en fazla 366 gün olabilir.");
  return { gun: fark, baslangic: ilk, bitis: son };
}

function superAdminDonustur(kayit) {
  if (!kayit) return null;
  return {
    id: Number(kayit.id), email: kayit.email, ad: kayit.ad, aktif: kayit.aktif === true,
    ikiFaktorAktif: kayit.iki_faktor_aktif === true, sonGiris: kayit.son_giris, olusturma: kayit.olusturma,
  };
}

function isletmeDonustur(kayit) {
  if (!kayit) return null;
  return {
    id: Number(kayit.id), slug: kayit.slug, ad: kayit.ad, konsept: kayit.konsept,
    logoUrl: kayit.logo_url || null, tema: kayit.tema || {}, aktif: kayit.aktif === true,
    iletisimEmail: kayit.iletisim_email || "", iletisimTelefon: kayit.iletisim_telefon || "",
    adres: kayit.adres || "", notlar: kayit.notlar || "", silinmeTarihi: kayit.silinme_tarihi || null,
    olusturma: kayit.olusturma,
    kullaniciSayisi: sayi(kayit.kullanici_sayisi), personelSayisi: sayi(kayit.personel_sayisi),
    siparisSayisi: sayi(kayit.siparis_sayisi), toplamCiro: sayi(kayit.toplam_ciro),
    aylikCiro: sayi(kayit.aylik_ciro), aylikSiparis: sayi(kayit.aylik_siparis),
    masaSayisi: Math.max(1, sayi(kayit.masa_sayisi) || 10),
    abonelik: kayit.abonelik_id ? {
      id: Number(kayit.abonelik_id), plan: kayit.abonelik_plan, aylikUcret: sayi(kayit.abonelik_ucret),
      durum: kayit.abonelik_durum, baslangicTarihi: kayit.abonelik_baslangic,
      bitisTarihi: kayit.abonelik_bitis, notlar: kayit.abonelik_notlar || "",
    } : null,
  };
}

export async function superAdminTablolariniHazirla() {
  await pool.query(`
    ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS iletisim_email TEXT;
    ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS iletisim_telefon TEXT;
    ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS adres TEXT;
    ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS notlar TEXT;
    ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS silinme_tarihi TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS super_adminler (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      ad TEXT NOT NULL,
      sifre_hash TEXT NOT NULL,
      iki_faktor_sirri TEXT,
      iki_faktor_aktif BOOLEAN NOT NULL DEFAULT false,
      son_giris TIMESTAMPTZ,
      aktif BOOLEAN NOT NULL DEFAULT true,
      olusturma TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS abonelikler (
      id SERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'baslangic',
      aylik_ucret NUMERIC(10,2) NOT NULL DEFAULT 0,
      baslangic_tarihi DATE NOT NULL,
      bitis_tarihi DATE,
      durum TEXT NOT NULL DEFAULT 'aktif',
      notlar TEXT,
      olusturma TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS super_admin_kayitlari (
      id SERIAL PRIMARY KEY,
      super_admin_id INTEGER NOT NULL REFERENCES super_adminler(id),
      islem TEXT NOT NULL,
      hedef_isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE SET NULL,
      detay JSONB DEFAULT '{}'::jsonb,
      ip TEXT,
      olusturma TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS abonelikler_isletme_idx ON abonelikler(isletme_id,olusturma DESC);
    CREATE INDEX IF NOT EXISTS abonelikler_durum_idx ON abonelikler(durum,bitis_tarihi);
    CREATE UNIQUE INDEX IF NOT EXISTS super_adminler_email_ci ON super_adminler(lower(email));
    CREATE INDEX IF NOT EXISTS super_admin_kayitlari_zaman_idx ON super_admin_kayitlari(olusturma DESC);
    CREATE INDEX IF NOT EXISTS super_admin_kayitlari_isletme_idx ON super_admin_kayitlari(hedef_isletme_id,olusturma DESC);
    CREATE INDEX IF NOT EXISTS isletmeler_silinme_idx ON isletmeler(silinme_tarihi) WHERE silinme_tarihi IS NOT NULL;
  `);
}

export async function ilkSuperAdminiHazirla() {
  const adet = await pool.query("SELECT COUNT(*)::int AS adet FROM super_adminler");
  if (Number(adet.rows[0].adet) > 0) return false;
  const email = metin(process.env.SUPER_ADMIN_EMAIL, 254).toLowerCase();
  const sifre = String(process.env.SUPER_ADMIN_SIFRE || "");
  if (!email || !sifre) {
    console.warn("UYARI: İlk super admin için SUPER_ADMIN_EMAIL ve SUPER_ADMIN_SIFRE tanımlanmadı.");
    return false;
  }
  if (!emailGecerli(email) || sifre.length < 12 || sifre.length > 72) {
    throw new Error("SUPER_ADMIN_EMAIL geçerli, SUPER_ADMIN_SIFRE 12-72 karakter olmalıdır.");
  }
  const sifreHash = await bcrypt.hash(sifre, 12);
  const sonuc = await pool.query(
    `INSERT INTO super_adminler (email,ad,sifre_hash)
     SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM super_adminler)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, metin(process.env.SUPER_ADMIN_AD || "Platform Yöneticisi", 120), sifreHash]
  );
  if (sonuc.rowCount) console.warn("İlk super admin oluşturuldu, şifreyi değiştirin");
  return sonuc.rowCount === 1;
}

export async function superAdminEmailIleGetir(email) {
  const sonuc = await pool.query("SELECT * FROM super_adminler WHERE lower(email)=lower($1) LIMIT 1", [metin(email, 254)]);
  return sonuc.rows[0] || null;
}

export async function superAdminIdIleGetir(id) {
  const sonuc = await pool.query("SELECT * FROM super_adminler WHERE id=$1 LIMIT 1", [idDogrula(id, "superAdminId")]);
  return sonuc.rows[0] || null;
}

export async function superAdminIkiFaktorSirriKaydet(id, sifreliSir) {
  const sonuc = await pool.query(
    "UPDATE super_adminler SET iki_faktor_sirri=$2,iki_faktor_aktif=false WHERE id=$1 AND aktif=true RETURNING *",
    [idDogrula(id, "superAdminId"), metin(sifreliSir, 2000)]
  );
  return sonuc.rows[0] || null;
}

export async function superAdminGirisiniKaydet(id, ikiFaktorEtkinlestir = false) {
  const sonuc = await pool.query(
    `UPDATE super_adminler SET son_giris=NOW(),iki_faktor_aktif=CASE WHEN $2 THEN true ELSE iki_faktor_aktif END
     WHERE id=$1 AND aktif=true RETURNING *`,
    [idDogrula(id, "superAdminId"), ikiFaktorEtkinlestir === true]
  );
  return superAdminDonustur(sonuc.rows[0]);
}

export async function superAdminKaydiEkle(superAdminId, { islem, hedefIsletmeId = null, detay = {}, ip = "" } = {}) {
  const guvenliDetay = detay && typeof detay === "object" && !Array.isArray(detay) ? detay : {};
  await pool.query(
    `INSERT INTO super_admin_kayitlari (super_admin_id,islem,hedef_isletme_id,detay,ip)
     VALUES ($1,$2,$3,$4::jsonb,$5)`,
    [idDogrula(superAdminId, "superAdminId"), metin(islem, 120) || "bilinmeyen", hedefIsletmeId ? idDogrula(hedefIsletmeId, "isletmeId") : null, JSON.stringify(guvenliDetay), metin(ip, 100)]
  );
}

export async function superAdminKayitlariniGetir({ limit = 100, islem = "", isletmeId = null, baslangic = null, bitis = null } = {}) {
  const sonuc = await pool.query(
    `SELECT k.id,k.islem,k.hedef_isletme_id,k.detay,k.ip,k.olusturma,
            s.ad AS super_admin_ad,s.email AS super_admin_email,i.ad AS isletme_ad,i.slug AS isletme_slug
     FROM super_admin_kayitlari k
     JOIN super_adminler s ON s.id=k.super_admin_id
     LEFT JOIN isletmeler i ON i.id=k.hedef_isletme_id
     WHERE ($1='' OR k.islem ILIKE '%'||$1||'%')
       AND ($2::int IS NULL OR k.hedef_isletme_id=$2)
       AND ($3::timestamptz IS NULL OR k.olusturma >= $3)
       AND ($4::timestamptz IS NULL OR k.olusturma < $4::timestamptz + INTERVAL '1 day')
     ORDER BY k.olusturma DESC LIMIT $5`,
    [metin(islem, 120), isletmeId ? idDogrula(isletmeId, "isletmeId") : null, baslangic || null, bitis || null, Math.min(500, Math.max(1, Number(limit) || 100))]
  );
  return sonuc.rows.map((satir) => ({
    id: Number(satir.id), islem: satir.islem, hedefIsletmeId: satir.hedef_isletme_id ? Number(satir.hedef_isletme_id) : null,
    isletmeAd: satir.isletme_ad || "Silinmiş işletme", isletmeSlug: satir.isletme_slug || "", detay: satir.detay || {},
    ip: satir.ip, olusturma: satir.olusturma, superAdmin: { ad: satir.super_admin_ad, email: satir.super_admin_email },
  }));
}

const ISLETME_METRIK_SQL = `
  SELECT i.*,
    COALESCE(k.adet,0)::int AS kullanici_sayisi,COALESCE(p.adet,0)::int AS personel_sayisi,
    COALESCE(o.adet,0)::int AS siparis_sayisi,COALESCE(o.ciro,0)::numeric AS toplam_ciro,
    COALESCE(o.aylik_ciro,0)::numeric AS aylik_ciro,COALESCE(o.aylik_adet,0)::int AS aylik_siparis,
    COALESCE(m.masa_sayisi,10)::int AS masa_sayisi,
    a.id AS abonelik_id,a.plan AS abonelik_plan,a.aylik_ucret AS abonelik_ucret,
    a.durum AS abonelik_durum,a.baslangic_tarihi AS abonelik_baslangic,
    a.bitis_tarihi AS abonelik_bitis,a.notlar AS abonelik_notlar
  FROM isletmeler i
  LEFT JOIN LATERAL (SELECT COUNT(*) AS adet FROM kullanicilar WHERE isletme_id=i.id) k ON true
  LEFT JOIN LATERAL (SELECT COUNT(*) AS adet FROM personeller WHERE isletme_id=i.id AND aktif=true AND arsivli=false) p ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE durum='basarili') AS adet,
      COALESCE(SUM(tutar) FILTER (WHERE durum='basarili'),0) AS ciro,
      COALESCE(SUM(tutar) FILTER (WHERE durum='basarili' AND basarili_at>=date_trunc('month',NOW())),0) AS aylik_ciro,
      COUNT(*) FILTER (WHERE durum='basarili' AND basarili_at>=date_trunc('month',NOW())) AS aylik_adet
    FROM odeme_islemleri WHERE isletme_id=i.id
  ) o ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN deger->>'adet' ~ '^[0-9]+$' THEN (deger->>'adet')::int ELSE 10 END AS masa_sayisi
    FROM sistem_ayarlari WHERE isletme_id=i.id AND anahtar='masa_sayisi' LIMIT 1
  ) m ON true
  LEFT JOIN LATERAL (SELECT * FROM abonelikler WHERE isletme_id=i.id ORDER BY olusturma DESC,id DESC LIMIT 1) a ON true`;

export async function superIsletmeleriGetir() {
  const sonuc = await pool.query(`${ISLETME_METRIK_SQL} ORDER BY i.silinme_tarihi NULLS FIRST,i.ad,i.id`);
  return sonuc.rows.map(isletmeDonustur);
}

export async function superIsletmeDetayiGetir(id, veritabani = pool) {
  const sonuc = await veritabani.query(`${ISLETME_METRIK_SQL} WHERE i.id=$1`, [idDogrula(id, "isletmeId")]);
  return isletmeDonustur(sonuc.rows[0]);
}

// ============================================================================
// İşletme yönetici hesabı
//
// Kurulum sihirbazı zaten bir admin hesabı açıyor (kurulumDb.js). Bu uçlar,
// sihirbaz dışında oluşturulmuş işletmelere yönetici tanımlamak veya mevcut
// yöneticinin şifresini sıfırlamak içindir. Şifreyi yalnızca super admin
// belirler; işletme sahibine bu bilgilerle giriş yapması söylenir.
// ============================================================================

function adminDonustur(satir) {
  return {
    id: Number(satir.id),
    ad: satir.ad,
    soyad: satir.soyad,
    email: satir.email,
    ikiFaktorAktif: satir.iki_faktor_aktif === true,
    olusturma: satir.olusturma,
    sifreDegisimTarihi: satir.sifre_degisim_tarihi,
    sifreDegistirmeli: satir.sifre_degistirmeli === true,
    sifreGeciciMetin: satir.sifre_degistirmeli === true ? satir.sifre_gecici_metin : null,
  };
}

export async function isletmeAdminleriniGetir(isletmeId, veritabani = pool) {
  const id = idDogrula(isletmeId, "isletmeId");
  const sonuc = await veritabani.query(
    `SELECT id,ad,soyad,email,iki_faktor_aktif,olusturma,sifre_degisim_tarihi,sifre_degistirmeli,sifre_gecici_metin
       FROM kullanicilar
      WHERE isletme_id=$1 AND rol='admin'
      ORDER BY id`,
    [id]
  );
  return sonuc.rows.map(adminDonustur);
}

export async function isletmeAdminHesabiniAyarla(isletmeId, veri = {}) {
  const id = idDogrula(isletmeId, "isletmeId");
  const isletme = await pool.query("SELECT id FROM isletmeler WHERE id=$1", [id]);
  if (!isletme.rows.length) throw new Error("İşletme bulunamadı.");

  const ad = metin(veri.ad, 60);
  const soyad = metin(veri.soyad, 60);
  const email = metin(veri.email, 254).toLowerCase();
  const sifre = String(veri.sifre || "");
  if (!ad || !soyad) throw new Error("Yönetici adı ve soyadı zorunludur.");
  if (!emailGecerli(email)) throw new Error("Yönetici e-postası geçersiz.");
  if (sifre.length < 8 || sifre.length > 72) throw new Error("Şifre 8-72 karakter olmalıdır.");
  if (/[\r\n\t]/.test(sifre)) throw new Error("Şifre satır sonu veya sekme içeremez.");

  const sifreHash = await bcrypt.hash(sifre, 12);
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const mevcut = await baglanti.query(
      "SELECT id,rol FROM kullanicilar WHERE isletme_id=$1 AND lower(email)=$2 FOR UPDATE",
      [id, email]
    );

    let kullaniciId;
    let olusturuldu;
    // Var olan bir hesap admin'e yükseltiliyorsa arayüz bunu bildirebilsin.
    const oncekiRol = mevcut.rows.length ? mevcut.rows[0].rol : null;
    if (mevcut.rows.length) {
      // Aynı e-posta bu işletmede zaten var: admin'e yükselt ve şifresini
      // yenile. sifre_degisim_tarihi güncellendiği için o hesabın eski
      // oturum token'ları geçersizleşir (bkz. auth.js#tokenDogrula).
      kullaniciId = Number(mevcut.rows[0].id);
      olusturuldu = false;
      await baglanti.query(
        `UPDATE kullanicilar
            SET ad=$2, soyad=$3, sifre_hash=$4, rol='admin', sifre_degisim_tarihi=NOW(),
                sifre_degistirmeli=true, sifre_gecici_metin=$5
          WHERE id=$1`,
        [kullaniciId, ad, soyad, sifreHash, sifre]
      );
    } else {
      olusturuldu = true;
      const eklenen = await baglanti.query(
        `INSERT INTO kullanicilar (isletme_id,ad,soyad,email,sifre_hash,rol,davet_kodu,sifre_degistirmeli,sifre_gecici_metin)
         VALUES ($1,$2,$3,$4,$5,'admin',$6,true,$7) RETURNING id`,
        [id, ad, soyad, email, sifreHash, davetKoduUret(), sifre]
      );
      kullaniciId = Number(eklenen.rows[0].id);
    }
    await baglanti.query("COMMIT");

    const kayit = await pool.query(
      `SELECT id,ad,soyad,email,iki_faktor_aktif,olusturma,sifre_degisim_tarihi
         FROM kullanicilar WHERE id=$1`,
      [kullaniciId]
    );
    return { olusturuldu, oncekiRol, admin: adminDonustur(kayit.rows[0]) };
  } catch (hata) {
    await baglanti.query("ROLLBACK").catch(() => {});
    if (hata?.code === "23505") {
      // Davet kodu çakışması e-posta hatasıyla karıştırılmasın.
      if (String(hata.constraint || "").includes("davet_kodu")) {
        throw new Error("Davet kodu üretilemedi, lütfen tekrar deneyin.");
      }
      throw new Error("Bu e-posta bu işletmede zaten kullanılıyor.");
    }
    throw hata;
  } finally {
    baglanti.release();
  }
}

export async function isletmeAdmininiGuncelle(isletmeId, adminId, veri = {}) {
  const id = idDogrula(isletmeId, "isletmeId");
  const yoneticiId = idDogrula(adminId, "adminId");
  const ad = metin(veri.ad, 60);
  const soyad = metin(veri.soyad, 60);
  const email = metin(veri.email, 254).toLowerCase();
  const sifre = String(veri.sifre || "");
  if (!ad || !soyad) throw new Error("Yönetici adı ve soyadı zorunludur.");
  if (!emailGecerli(email)) throw new Error("Yönetici e-postası geçersiz.");
  if (sifre && (sifre.length < 8 || sifre.length > 72)) throw new Error("Şifre 8-72 karakter olmalıdır.");
  if (/[\r\n\t]/.test(sifre)) throw new Error("Şifre satır sonu veya sekme içeremez.");

  const sifreHash = sifre ? await bcrypt.hash(sifre, 12) : null;
  try {
    const sonuc = await pool.query(
      `UPDATE kullanicilar
          SET ad=$3, soyad=$4, email=$5,
              sifre_hash=CASE WHEN $6::text IS NULL THEN sifre_hash ELSE $6 END,
              sifre_degistirmeli=CASE WHEN $6::text IS NULL THEN sifre_degistirmeli ELSE true END,
              sifre_gecici_metin=CASE WHEN $6::text IS NULL THEN sifre_gecici_metin ELSE $7 END,
              sifre_degisim_tarihi=NOW()
        WHERE isletme_id=$1 AND id=$2 AND rol='admin'
        RETURNING id,ad,soyad,email,iki_faktor_aktif,olusturma,sifre_degisim_tarihi,sifre_degistirmeli,sifre_gecici_metin`,
      [id, yoneticiId, ad, soyad, email, sifreHash, sifre || null]
    );
    if (!sonuc.rows.length) throw new Error("İşletme yöneticisi bulunamadı.");
    return { admin: adminDonustur(sonuc.rows[0]), sifreYenilendi: Boolean(sifre) };
  } catch (hata) {
    if (hata?.code === "23505") throw new Error("Bu e-posta bu işletmede zaten kullanılıyor.");
    throw hata;
  }
}

export async function isletmeAdmininiSil(isletmeId, adminId) {
  const id = idDogrula(isletmeId, "isletmeId");
  const yoneticiId = idDogrula(adminId, "adminId");
  const sonuc = await pool.query(
    `UPDATE kullanicilar
        SET rol='pasif', sifre_degisim_tarihi=NOW(), sifre_degistirmeli=false,
            sifre_gecici_metin=NULL, iki_faktor_aktif=false, iki_faktor_sir=NULL,
            iki_faktor_bekleyen_sir=NULL, iki_faktor_kurtarma='[]'::jsonb
      WHERE isletme_id=$1 AND id=$2 AND rol='admin'
      RETURNING id,email`,
    [id, yoneticiId]
  );
  if (!sonuc.rows.length) throw new Error("İşletme yöneticisi bulunamadı.");
  return { basarili: true, adminId: Number(sonuc.rows[0].id), email: sonuc.rows[0].email };
}

export async function superIsletmeBilgileriniGuncelle(id, veri = {}, veritabani = pool) {
  const isletmeId = idDogrula(id, "isletmeId");
  const mevcut = await veritabani.query("SELECT * FROM isletmeler WHERE id=$1", [isletmeId]);
  if (!mevcut.rows.length) throw new Error("İşletme bulunamadı.");
  const eski = mevcut.rows[0];
  const slug = metin(veri.slug ?? eski.slug, 80).toLowerCase();
  const ad = metin(veri.ad ?? eski.ad, 160);
  const konsept = metin(veri.konsept ?? eski.konsept, 30).toLowerCase();
  const email = metin(veri.iletisimEmail ?? eski.iletisim_email, 254).toLowerCase();
  if (!SLUG_DESENI.test(slug) || !ad || !KONSEPTLER.has(konsept)) throw new Error("İşletme adı, slug veya konsept geçersiz.");
  if (email && !emailGecerli(email)) throw new Error("İletişim e-postası geçersiz.");
  await veritabani.query(
    `UPDATE isletmeler SET slug=$2,ad=$3,konsept=$4,iletisim_email=$5,iletisim_telefon=$6,adres=$7,notlar=$8
     WHERE id=$1`,
    [isletmeId, slug, ad, konsept, email || null, metin(veri.iletisimTelefon ?? eski.iletisim_telefon, 40) || null, metin(veri.adres ?? eski.adres, 500) || null, metin(veri.notlar ?? eski.notlar, 2000) || null]
  );
  return superIsletmeDetayiGetir(isletmeId, veritabani);
}

export async function superIsletmeDurumunuGuncelle(id, aktif) {
  const sonuc = await pool.query(
    "UPDATE isletmeler SET aktif=$2,silinme_tarihi=CASE WHEN $2 THEN NULL ELSE silinme_tarihi END WHERE id=$1 RETURNING id",
    [idDogrula(id, "isletmeId"), aktif === true]
  );
  if (!sonuc.rowCount) throw new Error("İşletme bulunamadı.");
  return superIsletmeDetayiGetir(id);
}

export async function superIsletmeSilmeOzeti(id) {
  const sonuc = await pool.query(
    `SELECT i.id,i.slug,i.ad,
      (SELECT COUNT(*) FROM kullanicilar WHERE isletme_id=i.id)::int AS kullanici_sayisi,
      (SELECT COUNT(*) FROM odeme_islemleri WHERE isletme_id=i.id)::int AS siparis_sayisi,
      (SELECT COUNT(*) FROM personeller WHERE isletme_id=i.id)::int AS personel_sayisi
     FROM isletmeler i WHERE i.id=$1`,
    [idDogrula(id, "isletmeId")]
  );
  const satir = sonuc.rows[0];
  if (!satir) throw new Error("İşletme bulunamadı.");
  return { id: Number(satir.id), slug: satir.slug, ad: satir.ad, kullaniciSayisi: Number(satir.kullanici_sayisi), siparisSayisi: Number(satir.siparis_sayisi), personelSayisi: Number(satir.personel_sayisi) };
}

export async function superIsletmeyiYumusakSil(id) {
  const sonuc = await pool.query(
    "UPDATE isletmeler SET aktif=false,silinme_tarihi=COALESCE(silinme_tarihi,NOW()) WHERE id=$1 RETURNING silinme_tarihi",
    [idDogrula(id, "isletmeId")]
  );
  if (!sonuc.rowCount) throw new Error("İşletme bulunamadı.");
  return { silinmeTarihi: sonuc.rows[0].silinme_tarihi, kaliciSilinmeTarihi: new Date(new Date(sonuc.rows[0].silinme_tarihi).getTime() + 30 * 86400000).toISOString() };
}

export async function platformOzetiniGetir() {
  const sonuc = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM isletmeler WHERE silinme_tarihi IS NULL)::int AS toplam_isletme,
      (SELECT COUNT(*) FROM isletmeler WHERE aktif=true AND silinme_tarihi IS NULL)::int AS aktif_isletme,
      (SELECT COUNT(*) FROM kullanicilar k JOIN isletmeler i ON i.id=k.isletme_id WHERE i.silinme_tarihi IS NULL)::int AS toplam_kullanici,
      (SELECT COUNT(DISTINCT o.kullanici_id) FROM odeme_islemleri o JOIN isletmeler i ON i.id=o.isletme_id WHERE i.silinme_tarihi IS NULL AND o.durum='basarili' AND o.basarili_at>=NOW()-INTERVAL '30 days' AND o.kullanici_id IS NOT NULL)::int AS aktif_kullanici,
      (SELECT COUNT(*) FROM odeme_islemleri o JOIN isletmeler i ON i.id=o.isletme_id WHERE i.silinme_tarihi IS NULL AND o.durum='basarili' AND o.basarili_at>=date_trunc('month',NOW()))::int AS bu_ay_siparis,
      (SELECT COALESCE(SUM(o.tutar),0) FROM odeme_islemleri o JOIN isletmeler i ON i.id=o.isletme_id WHERE i.silinme_tarihi IS NULL AND o.durum='basarili')::numeric AS toplam_ciro,
      (SELECT COALESCE(SUM(a.aylik_ucret),0) FROM isletmeler i JOIN LATERAL (SELECT * FROM abonelikler WHERE isletme_id=i.id AND baslangic_tarihi<=CURRENT_DATE ORDER BY baslangic_tarihi DESC,olusturma DESC,id DESC LIMIT 1) a ON true WHERE i.silinme_tarihi IS NULL AND a.durum IN ('aktif','deneme') AND (a.bitis_tarihi IS NULL OR a.bitis_tarihi>=CURRENT_DATE))::numeric AS mrr
  `);
  const s = sonuc.rows[0];
  return { toplamIsletme: Number(s.toplam_isletme), aktifIsletme: Number(s.aktif_isletme), pasifIsletme: Number(s.toplam_isletme) - Number(s.aktif_isletme), toplamKullanici: Number(s.toplam_kullanici), aktifKullanici: Number(s.aktif_kullanici), buAySiparis: Number(s.bu_ay_siparis), toplamCiro: Number(s.toplam_ciro), mrr: Number(s.mrr) };
}

export async function ciroRaporunuGetir(gun = 30, baslangic = "", bitis = "") {
  const aralik = raporAraliginiDogrula(gun, baslangic, bitis);
  const tarihKosulu = aralik.baslangic
    ? "DATE(COALESCE(o.basarili_at,o.olusturma)) BETWEEN $1::date AND $2::date"
    : "COALESCE(o.basarili_at,o.olusturma)>=NOW()-($1::int*INTERVAL '1 day')";
  const parametreler = aralik.baslangic ? [aralik.baslangic, aralik.bitis] : [aralik.gun];
  const [ozet, gunluk] = await Promise.all([
    pool.query(`SELECT i.id,i.ad,i.slug,COALESCE(SUM(o.tutar),0)::numeric AS ciro,COUNT(o.id)::int AS siparis,
      COALESCE(AVG(o.tutar),0)::numeric AS ortalama_sepet FROM isletmeler i LEFT JOIN odeme_islemleri o ON o.isletme_id=i.id AND o.durum='basarili' AND ${tarihKosulu}
      WHERE i.silinme_tarihi IS NULL GROUP BY i.id ORDER BY ciro DESC`, parametreler),
    pool.query(`SELECT DATE(COALESCE(o.basarili_at,o.olusturma)) AS tarih,o.isletme_id,i.ad,COALESCE(SUM(o.tutar),0)::numeric AS ciro
      FROM odeme_islemleri o JOIN isletmeler i ON i.id=o.isletme_id WHERE i.silinme_tarihi IS NULL AND o.durum='basarili' AND ${tarihKosulu}
      GROUP BY tarih,o.isletme_id,i.ad ORDER BY tarih,o.isletme_id`, parametreler),
  ]);
  return { ...aralik, isletmeler: ozet.rows.map((s) => ({ isletmeId: Number(s.id), ad: s.ad, slug: s.slug, ciro: Number(s.ciro), siparis: Number(s.siparis), ortalamaSepet: Number(s.ortalama_sepet) })), gunluk: gunluk.rows.map((s) => ({ tarih: s.tarih, isletmeId: Number(s.isletme_id), ad: s.ad, ciro: Number(s.ciro) })) };
}

export async function siparisRaporunuGetir(gun = 30, baslangic = "", bitis = "") {
  const rapor = await ciroRaporunuGetir(gun, baslangic, bitis);
  return { gun: rapor.gun, baslangic: rapor.baslangic, bitis: rapor.bitis, isletmeler: rapor.isletmeler.map(({ isletmeId, ad, slug, siparis, ortalamaSepet, ciro }) => ({ isletmeId, ad, slug, siparis, ortalamaSepet, ciro })) };
}

export async function buyumeRaporunuGetir(ay = 12) {
  const aylar = Math.min(36, Math.max(2, Number(ay) || 12));
  const sonuc = await pool.query(`
    WITH aylar AS (SELECT generate_series(date_trunc('month',NOW())-(($1::int-1)*INTERVAL '1 month'),date_trunc('month',NOW()),INTERVAL '1 month') AS ay)
    SELECT a.ay,
      (SELECT COUNT(*) FROM isletmeler i WHERE i.silinme_tarihi IS NULL AND i.olusturma>=a.ay AND i.olusturma<a.ay+INTERVAL '1 month')::int AS yeni_isletme,
      (SELECT COUNT(*) FROM kullanicilar k JOIN isletmeler i ON i.id=k.isletme_id WHERE i.silinme_tarihi IS NULL AND k.olusturma>=a.ay AND k.olusturma<a.ay+INTERVAL '1 month')::int AS yeni_kullanici,
      (SELECT COUNT(*) FROM odeme_islemleri o JOIN isletmeler i ON i.id=o.isletme_id WHERE i.silinme_tarihi IS NULL AND o.durum='basarili' AND o.basarili_at>=a.ay AND o.basarili_at<a.ay+INTERVAL '1 month')::int AS siparis,
      (SELECT COALESCE(SUM(o.tutar),0) FROM odeme_islemleri o JOIN isletmeler i ON i.id=o.isletme_id WHERE i.silinme_tarihi IS NULL AND o.durum='basarili' AND o.basarili_at>=a.ay AND o.basarili_at<a.ay+INTERVAL '1 month')::numeric AS ciro
    FROM aylar a ORDER BY a.ay`, [aylar]);
  return sonuc.rows.map((s) => ({ ay: s.ay, yeniIsletme: Number(s.yeni_isletme), yeniKullanici: Number(s.yeni_kullanici), siparis: Number(s.siparis), ciro: Number(s.ciro) }));
}

export async function kullaniciRaporunuGetir(baslangic = "", bitis = "") {
  const aralik = baslangic || bitis ? raporAraliginiDogrula(30, baslangic, bitis) : null;
  const [isletmeler, trend] = await Promise.all([
    pool.query(`SELECT i.id,i.ad,i.slug,COUNT(k.id)::int AS kullanici_sayisi,
      COUNT(k.id) FILTER (WHERE (($1::date IS NULL AND k.olusturma>=NOW()-INTERVAL '30 days') OR ($1::date IS NOT NULL AND DATE(k.olusturma) BETWEEN $1::date AND $2::date)))::int AS yeni_kullanici
      FROM isletmeler i LEFT JOIN kullanicilar k ON k.isletme_id=i.id WHERE i.silinme_tarihi IS NULL GROUP BY i.id ORDER BY kullanici_sayisi DESC`, [aralik?.baslangic || null, aralik?.bitis || null]),
    pool.query(`SELECT date_trunc('month',k.olusturma) AS ay,COUNT(*)::int AS adet FROM kullanicilar k JOIN isletmeler i ON i.id=k.isletme_id
      WHERE i.silinme_tarihi IS NULL AND k.olusturma>=date_trunc('month',NOW())-INTERVAL '11 months' GROUP BY ay ORDER BY ay`),
  ]);
  return { isletmeler: isletmeler.rows.map((s) => ({ isletmeId: Number(s.id), ad: s.ad, slug: s.slug, kullaniciSayisi: Number(s.kullanici_sayisi), yeniKullanici: Number(s.yeni_kullanici) })), trend: trend.rows.map((s) => ({ ay: s.ay, adet: Number(s.adet) })) };
}

function abonelikVerisiniDogrula(veri = {}, mevcut = {}) {
  const plan = metin(veri.plan ?? mevcut.plan ?? "baslangic", 30).toLowerCase();
  const durum = metin(veri.durum ?? mevcut.durum ?? "aktif", 30).toLowerCase();
  const aylikUcret = Number(veri.aylikUcret ?? mevcut.aylik_ucret ?? 0);
  const baslangicTarihi = tarihMetni(veri.baslangicTarihi ?? mevcut.baslangic_tarihi ?? new Date());
  const bitisTarihi = tarihMetni(veri.bitisTarihi ?? mevcut.bitis_tarihi ?? "") || null;
  if (!PLANLAR.has(plan) || !ABONELIK_DURUMLARI.has(durum)) throw new Error("Abonelik planı veya durumu geçersiz.");
  if (!Number.isFinite(aylikUcret) || aylikUcret < 0 || aylikUcret > 99999999) throw new Error("Aylık ücret geçersiz.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baslangicTarihi) || (bitisTarihi && !/^\d{4}-\d{2}-\d{2}$/.test(bitisTarihi))) throw new Error("Abonelik tarihleri geçersiz.");
  if (bitisTarihi && bitisTarihi < baslangicTarihi) throw new Error("Bitiş tarihi başlangıçtan önce olamaz.");
  return { plan, durum, aylikUcret, baslangicTarihi, bitisTarihi, notlar: metin(veri.notlar ?? mevcut.notlar, 2000) || null };
}

function abonelikDonustur(s) {
  return { id: Number(s.id), isletmeId: Number(s.isletme_id), isletmeAd: s.isletme_ad, isletmeSlug: s.isletme_slug, plan: s.plan, aylikUcret: Number(s.aylik_ucret), baslangicTarihi: s.baslangic_tarihi, bitisTarihi: s.bitis_tarihi, durum: s.durum, notlar: s.notlar || "", olusturma: s.olusturma };
}

export async function abonelikleriGetir() {
  const sonuc = await pool.query(`SELECT a.*,i.ad AS isletme_ad,i.slug AS isletme_slug FROM abonelikler a JOIN isletmeler i ON i.id=a.isletme_id ORDER BY a.olusturma DESC,a.id DESC`);
  return sonuc.rows.map(abonelikDonustur);
}

export async function abonelikOlustur(veri = {}, veritabani = pool) {
  const isletmeId = idDogrula(veri.isletmeId, "isletmeId");
  const isletme = await veritabani.query("SELECT ad,slug,silinme_tarihi FROM isletmeler WHERE id=$1", [isletmeId]);
  if (!isletme.rows.length || isletme.rows[0].silinme_tarihi) throw new Error("İşletme bulunamadı veya silinmek üzere işaretli.");
  const temiz = abonelikVerisiniDogrula(veri);
  const sonuc = await veritabani.query(
    `INSERT INTO abonelikler (isletme_id,plan,aylik_ucret,baslangic_tarihi,bitis_tarihi,durum,notlar)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [isletmeId, temiz.plan, temiz.aylikUcret, temiz.baslangicTarihi, temiz.bitisTarihi, temiz.durum, temiz.notlar]
  );
  return abonelikDonustur({ ...sonuc.rows[0], isletme_ad: isletme.rows[0]?.ad, isletme_slug: isletme.rows[0]?.slug });
}

export async function abonelikGuncelle(id, veri = {}) {
  const abonelikId = idDogrula(id, "abonelikId");
  const mevcut = await pool.query("SELECT * FROM abonelikler WHERE id=$1", [abonelikId]);
  if (!mevcut.rows.length) throw new Error("Abonelik bulunamadı.");
  const temiz = abonelikVerisiniDogrula(veri, mevcut.rows[0]);
  await pool.query(
    `UPDATE abonelikler SET plan=$2,aylik_ucret=$3,baslangic_tarihi=$4,bitis_tarihi=$5,durum=$6,notlar=$7 WHERE id=$1`,
    [abonelikId, temiz.plan, temiz.aylikUcret, temiz.baslangicTarihi, temiz.bitisTarihi, temiz.durum, temiz.notlar]
  );
  const sonuc = await pool.query(`SELECT a.*,i.ad AS isletme_ad,i.slug AS isletme_slug FROM abonelikler a JOIN isletmeler i ON i.id=a.isletme_id WHERE a.id=$1`, [abonelikId]);
  return abonelikDonustur(sonuc.rows[0]);
}

export async function gelirRaporunuGetir(ay = 12) {
  const aylar = Math.min(36, Math.max(1, Number(ay) || 12));
  const sonuc = await pool.query(`
    WITH aylar AS (SELECT generate_series(date_trunc('month',NOW())-(($1::int-1)*INTERVAL '1 month'),date_trunc('month',NOW()),INTERVAL '1 month') AS ay)
    SELECT a.ay,COALESCE(SUM(CASE WHEN b.durum IN ('aktif','deneme') AND (b.bitis_tarihi IS NULL OR b.bitis_tarihi>=a.ay::date) THEN b.aylik_ucret ELSE 0 END),0)::numeric AS mrr,
      COUNT(b.id) FILTER (WHERE b.durum IN ('aktif','deneme') AND (b.bitis_tarihi IS NULL OR b.bitis_tarihi>=a.ay::date))::int AS abonelik
    FROM aylar a CROSS JOIN isletmeler i LEFT JOIN LATERAL (SELECT * FROM abonelikler WHERE isletme_id=i.id AND baslangic_tarihi < LEAST((a.ay+INTERVAL '1 month')::date,CURRENT_DATE+1) ORDER BY baslangic_tarihi DESC,olusturma DESC,id DESC LIMIT 1) b ON true
    WHERE i.silinme_tarihi IS NULL
    GROUP BY a.ay ORDER BY a.ay`, [aylar]);
  const seri = sonuc.rows.map((s) => ({ ay: s.ay, mrr: Number(s.mrr), abonelik: Number(s.abonelik) }));
  return { guncelMrr: seri.at(-1)?.mrr || 0, seri };
}

export { superAdminDonustur };
