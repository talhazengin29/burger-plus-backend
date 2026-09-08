import { createHash, randomUUID } from "node:crypto";

export const BASVURU_DURUMLARI = ["yeni", "iletisime_gecildi", "teklif_verildi", "musteri_oldu", "reddedildi", "spam"];
const DURUMLAR = new Set(BASVURU_DURUMLARI);
const PAKETLER = new Set(["Başlangıç", "Profesyonel", "Kurumsal", "Kararsızım"]);
const UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_DESENI = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const metin = (deger, uzunluk) => String(deger || "").trim().replace(/\s+/g, " ").slice(0, uzunluk);
const cokSatirliMetin = (deger, uzunluk) => String(deger || "").trim().replace(/\r\n?/g, "\n").slice(0, uzunluk);
const telefonRakamlari = (deger) => String(deger || "").replace(/\D/g, "");

export function basvuruVerisiniTemizle(veri = {}) {
  const adSoyad = metin(veri.adSoyad, 120);
  const isletmeAdi = metin(veri.isletmeAdi, 160);
  const telefon = telefonRakamlari(veri.telefon).replace(/^0090/, "90");
  const email = metin(veri.email, 254).toLowerCase();
  const masaSayisi = veri.masaSayisi === "" || veri.masaSayisi == null ? null : Number(veri.masaSayisi);
  const paket = metin(veri.paket, 40) || "Kararsızım";
  const mesaj = cokSatirliMetin(veri.mesaj, 2000);
  const istekAnahtari = metin(veri.istekAnahtari, 36);
  const formSuresiMs = Number(veri.formSuresiMs);
  const website = metin(veri.website, 200);

  if (website) return { bot: true };
  if (adSoyad.length < 3) throw new Error("Ad soyad en az 3 karakter olmalıdır.");
  if (isletmeAdi.length < 2) throw new Error("İşletme adı en az 2 karakter olmalıdır.");
  if (!/^(90)?0?\d{10}$/.test(telefon)) throw new Error("Telefon numarası geçersiz.");
  if (email && !EMAIL_DESENI.test(email)) throw new Error("E-posta adresi geçersiz.");
  if (masaSayisi != null && (!Number.isSafeInteger(masaSayisi) || masaSayisi < 1 || masaSayisi > 999)) {
    throw new Error("Masa sayısı 1 ile 999 arasında olmalıdır.");
  }
  if (!PAKETLER.has(paket)) throw new Error("Paket seçimi geçersiz.");
  if (veri.kvkkOnay !== true) throw new Error("KVKK aydınlatma metni onaylanmalıdır.");
  if (!UUID_DESENI.test(istekAnahtari)) throw new Error("İstek anahtarı geçersiz.");
  if (!Number.isFinite(formSuresiMs) || formSuresiMs < 1800) throw new Error("Form çok hızlı gönderildi. Lütfen tekrar deneyin.");

  return { adSoyad, isletmeAdi, telefon, email: email || null, masaSayisi, paket, mesaj, istekAnahtari, bot: false };
}

export function basvuruDurumunuTemizle(deger) {
  const durum = metin(deger, 40).toLowerCase();
  if (!DURUMLAR.has(durum)) throw new Error("Başvuru durumu geçersiz.");
  return durum;
}

export function basvuruIpOzeti(ip, tuz = "") {
  return createHash("sha256").update(`${tuz}:${String(ip || "bilinmiyor")}`).digest("hex");
}

function donustur(kayit) {
  if (!kayit) return null;
  return {
    id: kayit.id,
    adSoyad: kayit.ad_soyad,
    isletmeAdi: kayit.isletme_adi,
    telefon: kayit.telefon,
    email: kayit.email || "",
    masaSayisi: kayit.masa_sayisi == null ? null : Number(kayit.masa_sayisi),
    paket: kayit.paket,
    mesaj: kayit.mesaj || "",
    durum: kayit.durum,
    yoneticiNotu: kayit.yonetici_notu || "",
    kaynak: kayit.kaynak || "landing",
    kampanya: kayit.kampanya || {},
    olusturma: kayit.olusturma,
    guncelleme: kayit.guncelleme,
    sonIslemYapan: kayit.son_islem_yapan || null,
  };
}

export async function basvuruTablosunuHazirla(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS satis_basvurulari (
      id UUID PRIMARY KEY,
      ad_soyad VARCHAR(120) NOT NULL,
      isletme_adi VARCHAR(160) NOT NULL,
      telefon VARCHAR(20) NOT NULL,
      email VARCHAR(254),
      masa_sayisi SMALLINT CHECK (masa_sayisi BETWEEN 1 AND 999),
      paket VARCHAR(40) NOT NULL DEFAULT 'Kararsızım',
      mesaj VARCHAR(2000) NOT NULL DEFAULT '',
      durum VARCHAR(40) NOT NULL DEFAULT 'yeni'
        CHECK (durum IN ('yeni','iletisime_gecildi','teklif_verildi','musteri_oldu','reddedildi','spam')),
      yonetici_notu VARCHAR(3000) NOT NULL DEFAULT '',
      kaynak VARCHAR(50) NOT NULL DEFAULT 'landing',
      kampanya JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_hash CHAR(64) NOT NULL,
      user_agent VARCHAR(300) NOT NULL DEFAULT '',
      istek_anahtari UUID NOT NULL UNIQUE,
      kvkk_onay_zamani TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      son_islem_super_admin_id INTEGER REFERENCES super_adminler(id) ON DELETE SET NULL,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS satis_basvurulari_durum_zaman_idx
      ON satis_basvurulari(durum, olusturma DESC);
    CREATE INDEX IF NOT EXISTS satis_basvurulari_telefon_zaman_idx
      ON satis_basvurulari(telefon, olusturma DESC);
    CREATE INDEX IF NOT EXISTS satis_basvurulari_ip_zaman_idx
      ON satis_basvurulari(ip_hash, olusturma DESC);
  `);
}

export async function landingBasvurusuOlustur(pool, veri, baglam = {}) {
  const temiz = basvuruVerisiniTemizle(veri);
  if (temiz.bot) return { kabulEdildi: true, basvuru: null };

  const ipHash = basvuruIpOzeti(baglam.ip, baglam.ipTuzu);
  const mevcut = await pool.query("SELECT * FROM satis_basvurulari WHERE istek_anahtari=$1", [temiz.istekAnahtari]);
  if (mevcut.rows[0]) return { kabulEdildi: true, basvuru: donustur(mevcut.rows[0]) };

  const saatlik = await pool.query(
    "SELECT COUNT(*)::int adet FROM satis_basvurulari WHERE ip_hash=$1 AND olusturma>NOW()-INTERVAL '1 hour'",
    [ipHash],
  );
  if (Number(saatlik.rows[0].adet) >= 10) {
    const hata = new Error("Çok fazla başvuru gönderildi. Lütfen daha sonra tekrar deneyin.");
    hata.status = 429;
    throw hata;
  }

  const yakin = await pool.query(
    "SELECT * FROM satis_basvurulari WHERE telefon=$1 AND olusturma>NOW()-INTERVAL '5 minutes' ORDER BY olusturma DESC LIMIT 1",
    [temiz.telefon],
  );
  if (yakin.rows[0]) return { kabulEdildi: true, basvuru: donustur(yakin.rows[0]) };

  const kampanya = {
    source: metin(baglam.kampanya?.source, 100),
    medium: metin(baglam.kampanya?.medium, 100),
    campaign: metin(baglam.kampanya?.campaign, 160),
    referrer: metin(baglam.kampanya?.referrer, 500),
  };
  const sonuc = await pool.query(
    `INSERT INTO satis_basvurulari
      (id,ad_soyad,isletme_adi,telefon,email,masa_sayisi,paket,mesaj,kaynak,kampanya,ip_hash,user_agent,istek_anahtari)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'landing',$9::jsonb,$10,$11,$12)
     ON CONFLICT (istek_anahtari) DO UPDATE SET istek_anahtari=EXCLUDED.istek_anahtari
     RETURNING *`,
    [randomUUID(), temiz.adSoyad, temiz.isletmeAdi, temiz.telefon, temiz.email, temiz.masaSayisi,
      temiz.paket, temiz.mesaj, JSON.stringify(kampanya), ipHash, metin(baglam.userAgent, 300), temiz.istekAnahtari],
  );
  return { kabulEdildi: true, basvuru: donustur(sonuc.rows[0]) };
}

const SECIM = `SELECT b.*, s.ad son_islem_yapan
  FROM satis_basvurulari b
  LEFT JOIN super_adminler s ON s.id=b.son_islem_super_admin_id`;

export async function superBasvurulariGetir(pool, filtre = {}) {
  const kosullar = [], degerler = [];
  const durum = metin(filtre.durum, 40).toLowerCase();
  const arama = metin(filtre.arama, 160);
  if (durum && DURUMLAR.has(durum)) {
    degerler.push(durum);
    kosullar.push(`b.durum=$${degerler.length}`);
  }
  if (arama) {
    degerler.push(`%${arama}%`);
    kosullar.push(`(b.ad_soyad ILIKE $${degerler.length} OR b.isletme_adi ILIKE $${degerler.length} OR b.telefon ILIKE $${degerler.length} OR COALESCE(b.email,'') ILIKE $${degerler.length})`);
  }
  const limit = Math.min(300, Math.max(1, Number(filtre.limit) || 200));
  degerler.push(limit);
  const where = kosullar.length ? `WHERE ${kosullar.join(" AND ")}` : "";
  const sonuc = await pool.query(
    `${SECIM} ${where} ORDER BY CASE b.durum WHEN 'yeni' THEN 0 WHEN 'iletisime_gecildi' THEN 1 WHEN 'teklif_verildi' THEN 2 ELSE 3 END, b.olusturma DESC LIMIT $${degerler.length}`,
    degerler,
  );
  return sonuc.rows.map(donustur);
}

export async function superBasvuruOzetiniGetir(pool) {
  const sonuc = await pool.query(`
    SELECT COUNT(*)::int toplam,
      COUNT(*) FILTER (WHERE durum='yeni')::int yeni,
      COUNT(*) FILTER (WHERE durum='iletisime_gecildi')::int iletisime_gecildi,
      COUNT(*) FILTER (WHERE durum='teklif_verildi')::int teklif_verildi,
      COUNT(*) FILTER (WHERE durum='musteri_oldu')::int musteri_oldu,
      COUNT(*) FILTER (WHERE olusturma>=date_trunc('month',NOW()))::int bu_ay
    FROM satis_basvurulari
  `);
  const kayit = sonuc.rows[0];
  return {
    toplam: Number(kayit.toplam), yeni: Number(kayit.yeni), iletisimeGecildi: Number(kayit.iletisime_gecildi),
    teklifVerildi: Number(kayit.teklif_verildi), musteriOldu: Number(kayit.musteri_oldu), buAy: Number(kayit.bu_ay),
  };
}

export async function superBasvuruGuncelle(pool, id, veri, superAdminId) {
  if (!UUID_DESENI.test(String(id || ""))) throw new Error("Başvuru kimliği geçersiz.");
  const durum = basvuruDurumunuTemizle(veri?.durum);
  const yoneticiNotu = cokSatirliMetin(veri?.yoneticiNotu, 3000);
  const sonuc = await pool.query(
    `UPDATE satis_basvurulari SET durum=$1, yonetici_notu=$2, son_islem_super_admin_id=$3, guncelleme=NOW()
     WHERE id=$4 RETURNING *`,
    [durum, yoneticiNotu, Number(superAdminId), id],
  );
  if (!sonuc.rows[0]) throw new Error("Başvuru bulunamadı.");
  return donustur(sonuc.rows[0]);
}
