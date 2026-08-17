import { randomUUID } from "crypto";

const KATEGORILER = ["siparis", "urun", "personel", "odeme", "uygulama", "diger"];
const DURUMLAR = ["yeni", "inceleniyor", "cozuldu", "reddedildi"];
const uuidMi = (deger) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(deger || ""));

export function sikayetVerisiniTemizle(veri = {}) {
  const kategori = String(veri.kategori || "").trim().toLowerCase();
  const baslik = String(veri.baslik || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const aciklama = String(veri.aciklama || "").trim().slice(0, 3000);
  const gorselUrl = String(veri.gorselUrl || "").trim().slice(0, 1000) || null;
  const istekAnahtari = String(veri.istekAnahtari || "").trim();
  if (!KATEGORILER.includes(kategori)) throw new Error("Şikayet kategorisi geçersiz.");
  if (baslik.length < 5) throw new Error("Konu en az 5 karakter olmalıdır.");
  if (aciklama.length < 20) throw new Error("Açıklama en az 20 karakter olmalıdır.");
  if (!uuidMi(istekAnahtari)) throw new Error("İstek anahtarı geçersiz.");
  return { kategori, baslik, aciklama, gorselUrl, istekAnahtari };
}

export function sikayetDurumunuTemizle(deger) {
  const durum = String(deger || "").trim().toLowerCase();
  if (!DURUMLAR.includes(durum)) throw new Error("Şikayet durumu geçersiz.");
  return durum;
}

function donustur(kayit) {
  if (!kayit) return null;
  return {
    id: kayit.id,
    kategori: kayit.kategori,
    baslik: kayit.baslik,
    aciklama: kayit.aciklama,
    gorselUrl: kayit.gorsel_url,
    durum: kayit.durum,
    yoneticiNotu: kayit.yonetici_notu || "",
    olusturma: kayit.olusturma,
    guncelleme: kayit.guncelleme,
    musteri: kayit.kullanici_id ? {
      id: kayit.kullanici_id,
      ad: [kayit.musteri_ad, kayit.musteri_soyad].filter(Boolean).join(" "),
      email: kayit.musteri_email || "",
      telefon: kayit.musteri_telefon || "",
    } : null,
    cozenPersonelAdi: kayit.cozen_personel_adi || null,
  };
}

function musteriyeDonustur(kayit) {
  const sikayet = donustur(kayit);
  if (!sikayet) return null;
  delete sikayet.yoneticiNotu;
  delete sikayet.musteri;
  delete sikayet.cozenPersonelAdi;
  return sikayet;
}

export async function sikayetTablosunuHazirla(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sikayetler (
      id UUID PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
      kategori TEXT NOT NULL CHECK (kategori IN ('siparis','urun','personel','odeme','uygulama','diger')),
      baslik VARCHAR(120) NOT NULL,
      aciklama TEXT NOT NULL,
      gorsel_url TEXT,
      durum TEXT NOT NULL DEFAULT 'yeni' CHECK (durum IN ('yeni','inceleniyor','cozuldu','reddedildi')),
      yonetici_notu VARCHAR(1000) NOT NULL DEFAULT '',
      istek_anahtari UUID NOT NULL,
      cozen_personel_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (isletme_id, istek_anahtari)
    );
    CREATE INDEX IF NOT EXISTS idx_sikayetler_yonetim ON sikayetler(isletme_id, durum, olusturma DESC);
    CREATE INDEX IF NOT EXISTS idx_sikayetler_musteri ON sikayetler(isletme_id, kullanici_id, olusturma DESC);
  `);
}

const secim = `SELECT s.*, k.ad musteri_ad, k.soyad musteri_soyad, k.email musteri_email,
  k.telefon musteri_telefon, CONCAT_WS(' ',p.ad,p.soyad) cozen_personel_adi
  FROM sikayetler s JOIN kullanicilar k ON k.id=s.kullanici_id
  LEFT JOIN kullanicilar p ON p.id=s.cozen_personel_id`;

export async function musteriSikayetleriniGetir(isletmeId, pool, kullaniciId) {
  const sonuc = await pool.query(`${secim} WHERE s.isletme_id=$1 AND s.kullanici_id=$2 ORDER BY s.olusturma DESC LIMIT 30`, [isletmeId, kullaniciId]);
  return sonuc.rows.map(musteriyeDonustur);
}

export async function sikayetOlustur(isletmeId, pool, kullaniciId, veri) {
  const temiz = sikayetVerisiniTemizle(veri);
  const ayni = await pool.query("SELECT * FROM sikayetler WHERE isletme_id=$1 AND istek_anahtari=$2", [isletmeId, temiz.istekAnahtari]);
  if (ayni.rows[0]) return musteriyeDonustur(ayni.rows[0]);
  const sayac = await pool.query(
    "SELECT COUNT(*)::int adet FROM sikayetler WHERE isletme_id=$1 AND kullanici_id=$2 AND olusturma>NOW()-INTERVAL '24 hours'",
    [isletmeId, kullaniciId]
  );
  if (sayac.rows[0].adet >= 5) {
    const hata = new Error("24 saat içinde en fazla 5 şikayet gönderebilirsiniz.");
    hata.status = 429;
    throw hata;
  }
  const sonuc = await pool.query(
    `INSERT INTO sikayetler(id,isletme_id,kullanici_id,kategori,baslik,aciklama,gorsel_url,istek_anahtari)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [randomUUID(), isletmeId, kullaniciId, temiz.kategori, temiz.baslik, temiz.aciklama, temiz.gorselUrl, temiz.istekAnahtari]
  );
  return musteriyeDonustur(sonuc.rows[0]);
}

export async function adminSikayetleriniGetir(isletmeId, pool, durum = "") {
  const temizDurum = String(durum || "").trim().toLowerCase();
  const filtre = DURUMLAR.includes(temizDurum) ? " AND s.durum=$2" : "";
  const degerler = filtre ? [isletmeId, temizDurum] : [isletmeId];
  const sonuc = await pool.query(`${secim} WHERE s.isletme_id=$1${filtre} ORDER BY CASE s.durum WHEN 'yeni' THEN 0 WHEN 'inceleniyor' THEN 1 ELSE 2 END, s.olusturma DESC LIMIT 300`, degerler);
  return sonuc.rows.map(donustur);
}

export async function adminSikayetGuncelle(isletmeId, pool, id, veri, personelId) {
  if (!uuidMi(id)) throw new Error("Şikayet kimliği geçersiz.");
  const durum = sikayetDurumunuTemizle(veri?.durum);
  const yoneticiNotu = String(veri?.yoneticiNotu || "").trim().slice(0, 1000);
  const sonuc = await pool.query(
    `UPDATE sikayetler SET durum=$1, yonetici_notu=$2, cozen_personel_id=$3, guncelleme=NOW()
     WHERE id=$4 AND isletme_id=$5 RETURNING *`,
    [durum, yoneticiNotu, personelId || null, id, isletmeId]
  );
  if (!sonuc.rows[0]) throw new Error("Şikayet bulunamadı.");
  return donustur(sonuc.rows[0]);
}
