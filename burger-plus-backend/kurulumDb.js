import bcrypt from "bcryptjs";
import pool, { davetKoduUret } from "./db.js";
import { isletmeOlustur } from "./isletmeDb.js";
import { abonelikOlustur } from "./superAdminDb.js";
import { sablonuGetir, slugOlustur } from "./sablonlar.js";

const EMAIL_DESENI = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERSONEL_ROLLERI = new Set(["mutfak", "salon", "kasiyer"]);
const ROL_ETIKETLERI = { mutfak: "Mutfak", salon: "Salon", kasiyer: "Kasiyer" };

const metin = (deger, uzunluk = 500) => String(deger || "").trim().slice(0, uzunluk);
const email = (deger) => metin(deger, 254).toLowerCase();

function sifreDogrula(deger, alan) {
  const sifre = String(deger || "");
  if (sifre.length < 8 || sifre.length > 72) throw new Error(`${alan} şifresi 8-72 karakter olmalıdır.`);
  return sifre;
}

function hesapDogrula(hesap, alan, emailVarsayilani = "") {
  const ad = metin(hesap?.ad, 80);
  const soyad = metin(hesap?.soyad || "Personel", 80);
  const hesapEmail = email(hesap?.email || emailVarsayilani);
  if (!ad || !soyad) throw new Error(`${alan} adı ve soyadı zorunludur.`);
  if (!EMAIL_DESENI.test(hesapEmail)) throw new Error(`${alan} e-postası geçersiz.`);
  return { ad, soyad, email: hesapEmail, sifre: sifreDogrula(hesap?.sifre, alan) };
}

function fiyatDogrula(deger, varsayilan) {
  const fiyat = deger == null || deger === "" ? Number(varsayilan) : Number(deger);
  if (!Number.isFinite(fiyat) || fiyat < 0 || fiyat > 1_000_000) throw new Error("Ürün fiyatlarından biri geçersiz.");
  return Math.round(fiyat * 100) / 100;
}

function seciliIndeksleriDogrula(veri, urunSayisi) {
  if (veri.sablonYukle === false) return [];
  const ham = Array.isArray(veri.seciliUrunler) ? veri.seciliUrunler : [];
  if (!ham.length) return Array.from({ length: urunSayisi }, (_, indeks) => indeks);
  const indeksler = [...new Set(ham.map(Number))];
  if (indeksler.some((indeks) => !Number.isInteger(indeks) || indeks < 0 || indeks >= urunSayisi)) {
    throw new Error("Seçili ürün listesi geçersiz.");
  }
  return indeksler;
}

function tarih(deger, varsayilan = new Date()) {
  const metinDegeri = deger ? metin(deger, 10) : varsayilan.toISOString().slice(0, 10);
  const zaman = Date.parse(`${metinDegeri}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metinDegeri)
    || !Number.isFinite(zaman) || new Date(zaman).toISOString().slice(0, 10) !== metinDegeri) {
    throw new Error("Abonelik tarihi geçersiz.");
  }
  return metinDegeri;
}

export async function slugMusaitlikDurumu(hamSlug) {
  const slug = slugOlustur(hamSlug);
  if (!slug) throw new Error("Geçerli bir işletme adı veya slug girin.");
  const mevcut = await pool.query("SELECT 1 FROM isletmeler WHERE slug=$1", [slug]);
  if (!mevcut.rows.length) return { slug, musait: true };

  for (let sira = 2; sira <= 10_000; sira += 1) {
    const sonEk = `-${sira}`;
    const kok = slug.slice(0, 80 - sonEk.length).replace(/-+$/g, "");
    const oneri = `${kok}${sonEk}`;
    const cakisma = await pool.query("SELECT 1 FROM isletmeler WHERE slug=$1", [oneri]);
    if (!cakisma.rows.length) return { slug, musait: false, oneri };
  }
  throw new Error("Bu ad için uygun bir slug üretilemedi.");
}

export async function isletmeKurulumunuYap(superAdminId, veri = {}, ip = "") {
  const ad = metin(veri.ad, 160);
  const slug = slugOlustur(veri.slug || ad);
  const konsept = metin(veri.konsept, 30).toLowerCase();
  const sablon = sablonuGetir(konsept);
  const iletisimEmail = email(veri.iletisimEmail);
  const iletisimTelefon = metin(veri.iletisimTelefon, 40) || null;
  const adres = metin(veri.adres, 500) || null;
  const masaSayisi = Number(veri.masaSayisi ?? 10);
  if (ad.length < 2 || !slug) throw new Error("İşletme adı ve slug zorunludur.");
  if (!sablon) throw new Error("Konsept yalnızca burger, cafe veya pizza olabilir.");
  if (iletisimEmail && !EMAIL_DESENI.test(iletisimEmail)) throw new Error("İletişim e-postası geçersiz.");
  if (!Number.isInteger(masaSayisi) || masaSayisi < 1 || masaSayisi > 500) throw new Error("Masa sayısı 1-500 arasında olmalıdır.");

  const adminHesap = hesapDogrula(veri.adminHesap, "Admin hesabı");
  const personelHam = Array.isArray(veri.personeller) ? veri.personeller : [];
  if (personelHam.length > 50) throw new Error("Tek kurulumda en fazla 50 personel oluşturulabilir.");
  const personeller = personelHam.map((personel, indeks) => {
    const rol = metin(personel?.rol, 20).toLowerCase();
    if (!PERSONEL_ROLLERI.has(rol)) throw new Error(`${indeks + 1}. personelin rolü geçersiz.`);
    const varsayilanEmail = `${slug}-${rol}-${indeks + 1}@personel.local`;
    return { ...hesapDogrula(personel, `${indeks + 1}. personel`, varsayilanEmail), rol };
  });

  const seciliIndeksler = seciliIndeksleriDogrula(veri, sablon.urunler.length);
  const fiyatlar = veri.urunFiyatlari && typeof veri.urunFiyatlari === "object" ? veri.urunFiyatlari : {};
  const adminSifreHash = await bcrypt.hash(adminHesap.sifre, 12);
  const personelHashleri = await Promise.all(personeller.map((personel) => bcrypt.hash(personel.sifre, 12)));
  const abonelik = veri.abonelik || {};
  const baslangicTarihi = tarih(abonelik.baslangicTarihi);
  const durum = metin(abonelik.durum || (abonelik.deneme ? "deneme" : "aktif"), 30).toLowerCase();
  let bitisTarihi = abonelik.bitisTarihi ? tarih(abonelik.bitisTarihi) : null;
  if (durum === "deneme" && !bitisTarihi) {
    const son = new Date(`${baslangicTarihi}T00:00:00.000Z`);
    son.setUTCDate(son.getUTCDate() + 30);
    bitisTarihi = son.toISOString().slice(0, 10);
  }

  let kurulumOzeti = null;
  let isletme;
  try {
    isletme = await isletmeOlustur({ slug, ad, konsept }, async (baglanti, yeniIsletme) => {
    await baglanti.query(
      `UPDATE isletmeler SET iletisim_email=$2,iletisim_telefon=$3,adres=$4 WHERE id=$1`,
      [yeniIsletme.id, iletisimEmail || null, iletisimTelefon, adres]
    );

    for (const [sira, kategori] of sablon.kategoriler.entries()) {
      await baglanti.query(
        `INSERT INTO kategoriler (isletme_id,ad,sira,aktif)
         VALUES ($1,$2,$3,true) ON CONFLICT (isletme_id,ad) DO UPDATE SET aktif=true,sira=EXCLUDED.sira`,
        [yeniIsletme.id, kategori, (sira + 1) * 10]
      );
    }

    const urunIdleri = new Map();
    for (const indeks of seciliIndeksler) {
      const urun = sablon.urunler[indeks];
      const gramajOpsiyonu = urun.gramaj ? {
        aktif: true,
        etiket: urun.gramaj.birimAdi,
        artisMiktari: urun.gramaj.birim,
        birim: urun.gramaj.olcuBirimi,
        fiyatArtisi: urun.gramaj.ekFiyat,
        maxAdim: urun.gramaj.maxArtis,
      } : null;
      const sonuc = await baglanti.query(
        `INSERT INTO urunler
          (isletme_id,ad,fiyat,kategori,gorsel,aciklama,malzemeler,alerjenler,besin_degerleri,
           temel_miktar,gramaj_opsiyonu,urun_tipi,populer,aktif,arsivli)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12,$13,true,false)
         RETURNING id`,
        [yeniIsletme.id, urun.ad, fiyatDogrula(fiyatlar[indeks], urun.fiyat), urun.kategori, urun.gorsel,
          urun.aciklama, JSON.stringify(urun.malzemeler), JSON.stringify(urun.alerjenler),
          JSON.stringify(urun.besinDegerleri), urun.gramaj?.varsayilan ?? null,
          gramajOpsiyonu ? JSON.stringify(gramajOpsiyonu) : null, urun.urunTipi, urun.populer]
      );
      urunIdleri.set(urun.ad, Number(sonuc.rows[0].id));
    }

    let odulSayisi = 0;
    for (const [sira, odul] of sablon.oduller.entries()) {
      const urunId = urunIdleri.get(odul.urun);
      if (!urunId) continue;
      await baglanti.query(
        `INSERT INTO oduller (isletme_id,kod,ad,puan,urun_id,gorsel,market_aktif,aktif,arsivli)
         VALUES ($1,$2,$3,$4,$5,NULL,true,true,false)`,
        [yeniIsletme.id, `sablon-${slugOlustur(odul.ad)}-${sira + 1}`, odul.ad, odul.puan, urunId]
      );
      odulSayisi += 1;
    }

    for (const [sira, kampanya] of sablon.kampanyalar.entries()) {
      await baglanti.query(
        `INSERT INTO kampanyalar
          (isletme_id,kod,etiket,baslik,aciklama,buton,buton_tipi,gorsel,aktif,baslangic_saat,
           bitis_saat,indirim_yuzde,gecerli_kategoriler,kampanya_tipi,sira)
         VALUES ($1,$2,$3,$4,$5,'Sipariş Ver','primary',NULL,true,$6,$7,$8,$9::jsonb,$10,$11)`,
        [yeniIsletme.id, `kurulum-${slugOlustur(kampanya.baslik)}-${sira + 1}`, kampanya.baslik,
          kampanya.baslik, kampanya.aciklama, kampanya.baslangicSaat ?? null, kampanya.bitisSaat ?? null,
          kampanya.indirimYuzde ?? 0, JSON.stringify(kampanya.gecerliKategoriler || []),
          kampanya.kampanyaTipi || "surekli", (sira + 1) * 10]
      );
    }

    await baglanti.query(
      `INSERT INTO sistem_ayarlari (isletme_id,anahtar,deger)
       VALUES ($1,'sadakat_kurulum_v1',$2::jsonb),($1,'masa_sayisi',$3::jsonb)
       ON CONFLICT (isletme_id,anahtar) DO UPDATE SET deger=EXCLUDED.deger,guncelleme=NOW()`,
      [yeniIsletme.id, JSON.stringify(sablon.sadakat), JSON.stringify({ adet: masaSayisi })]
    );

    const adminSonuc = await baglanti.query(
      `INSERT INTO kullanicilar (isletme_id,ad,soyad,email,sifre_hash,rol,davet_kodu)
       VALUES ($1,$2,$3,$4,$5,'admin',$6) RETURNING id`,
      [yeniIsletme.id, adminHesap.ad, adminHesap.soyad, adminHesap.email, adminSifreHash, davetKoduUret()]
    );

    for (const [indeks, personel] of personeller.entries()) {
      const kullanici = await baglanti.query(
        `INSERT INTO kullanicilar (isletme_id,ad,soyad,email,sifre_hash,rol,davet_kodu)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [yeniIsletme.id, personel.ad, personel.soyad, personel.email, personelHashleri[indeks], personel.rol, davetKoduUret()]
      );
      await baglanti.query(
        `INSERT INTO personeller (isletme_id,ad,soyad,rol,email,saatlik_ucret,kullanici_id,aktif,arsivli)
         VALUES ($1,$2,$3,$4,$5,0,$6,true,false)`,
        [yeniIsletme.id, personel.ad, personel.soyad, ROL_ETIKETLERI[personel.rol], personel.email, kullanici.rows[0].id]
      );
    }

    const abonelikKaydi = await abonelikOlustur({
      isletmeId: yeniIsletme.id,
      plan: abonelik.plan || "baslangic",
      aylikUcret: abonelik.aylikUcret ?? 0,
      baslangicTarihi,
      bitisTarihi,
      durum,
      notlar: abonelik.notlar || null,
    }, baglanti);

    kurulumOzeti = {
      kategoriSayisi: sablon.kategoriler.length,
      urunSayisi: seciliIndeksler.length,
      odulSayisi,
      kampanyaSayisi: sablon.kampanyalar.length,
      personelSayisi: personeller.length,
      masaSayisi,
      adminKullaniciId: Number(adminSonuc.rows[0].id),
      abonelikId: abonelikKaydi.id,
    };
    await baglanti.query(
      `INSERT INTO super_admin_kayitlari (super_admin_id,islem,hedef_isletme_id,detay,ip)
       VALUES ($1,'isletme-kurulum',$2,$3::jsonb,$4)`,
      [superAdminId, yeniIsletme.id, JSON.stringify({
        konsept, ...kurulumOzeti, adminEmail: adminHesap.email,
        personelEpostalar: personeller.map((personel) => personel.email),
      }), metin(ip, 100)]
    );
    });
  } catch (hata) {
    if (hata?.code === "23505") {
      if (String(hata.constraint || "").includes("slug")) throw new Error("Bu slug başka bir işletme tarafından kullanılıyor.");
      if (String(hata.constraint || "").includes("email")) throw new Error("Admin veya personel e-postalarından biri tekrar ediyor.");
      throw new Error("Kurulumdaki benzersiz bilgilerden biri daha önce kullanılmış.");
    }
    throw hata;
  }

  const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/g, "");
  return {
    isletme: { id: isletme.id, slug: isletme.slug, ad: isletme.ad, konsept: isletme.konsept },
    ozet: kurulumOzeti,
    musteriUrl: `${frontendUrl}/${encodeURIComponent(isletme.slug)}`,
    personelUrl: `${frontendUrl}/personel/${encodeURIComponent(isletme.slug)}`,
    hesaplar: {
      adminEmail: adminHesap.email,
      personeller: personeller.map(({ ad: personelAd, soyad, email: personelEmail, rol }) => ({ ad: personelAd, soyad, email: personelEmail, rol })),
    },
  };
}
