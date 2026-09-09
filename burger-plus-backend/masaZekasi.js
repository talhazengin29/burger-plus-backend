const PLAN_TURLERI = ["dengeli", "ekonomik", "hizli"];
const ANA_URUN_TIPLERI = new Set(["burger", "menu"]);

const TURKCE_HARFLER = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

function normalize(metin) {
  return String(metin || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (harf) => TURKCE_HARFLER[harf])
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function sayiSinirla(deger, min, max, varsayilan) {
  const sayi = Number(deger);
  return Number.isFinite(sayi) ? Math.min(max, Math.max(min, sayi)) : varsayilan;
}

function metinListesi(deger, enFazla = 20) {
  const liste = Array.isArray(deger) ? deger : String(deger || "").split(",");
  return [...new Set(liste.map((oge) => normalize(String(oge).slice(0, 60))).filter(Boolean))].slice(0, enFazla);
}

export function tercihleriDogrula(ham = {}) {
  const aclik = ["hafif", "normal", "cok"].includes(ham.aclik) ? ham.aclik : "normal";
  const beslenme = ["farketmez", "vejetaryen", "vegan"].includes(ham.beslenme) ? ham.beslenme : "farketmez";
  return {
    kisiSayisi: Math.round(sayiSinirla(ham.kisiSayisi, 1, 12, 2)),
    butceKisi: Math.round(sayiSinirla(ham.butceKisi, 50, 5000, 400)),
    paylasim: ham.paylasim !== false,
    aclik,
    aci: Math.round(sayiSinirla(ham.aci, 0, 5, 2)),
    beslenme,
    alerjenler: metinListesi(ham.alerjenler),
    sevilmeyenler: metinListesi(ham.sevilmeyenler),
  };
}

function urunMetni(urun) {
  return normalize([urun.ad, urun.kategori, urun.aciklama, ...(urun.malzemeler || []), ...(urun.alerjenler || [])].join(" "));
}

function kelimeEslesir(metin, aranan) {
  return ` ${metin} `.includes(` ${aranan} `);
}

const ET_KELIMELERI = ["et", "kofte", "tavuk", "sucuk", "salam", "jambon", "balik", "ton", "pastirma"];
const HAYVANSAL_KELIMELER = [...ET_KELIMELERI, "sut", "peynir", "kasar", "yumurta", "krema", "tereyag", "mayonez"];
const ACI_KELIMELERI = ["aci", "jalapeno", "chili", "chilli", "hot", "buffalo"];

function urunUygunMu(urun, tercih) {
  if (!urun || urun.aktif === false || urun.stokta === false || !(Number(urun.fiyat) > 0)) return false;
  const metin = urunMetni(urun);
  if (tercih.alerjenler.some((aranan) => kelimeEslesir(metin, aranan))) return false;
  if (tercih.sevilmeyenler.some((aranan) => kelimeEslesir(metin, aranan))) return false;
  if (urun.urunTipi === "menu" && tercih.beslenme === "vegan" && !kelimeEslesir(metin, "vegan")) return false;
  if (urun.urunTipi === "menu" && tercih.beslenme === "vejetaryen" && !["vejetaryen", "vegan"].some((etiket) => kelimeEslesir(metin, etiket))) return false;
  const yasaklar = tercih.beslenme === "vegan" ? HAYVANSAL_KELIMELER : tercih.beslenme === "vejetaryen" ? ET_KELIMELERI : [];
  return !yasaklar.some((kelime) => kelimeEslesir(metin, kelime));
}

function etkinIndirim(urun, kampanyalar, uye) {
  if (!uye) return 0;
  const saat = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23",
  }).format(new Date()));
  return (kampanyalar || []).reduce((enYuksek, kampanya) => {
    if (!kampanya?.aktif) return enYuksek;
    if (kampanya.baslangicSaat != null && kampanya.bitisSaat != null) {
      const aktifSaat = kampanya.baslangicSaat <= kampanya.bitisSaat
        ? saat >= kampanya.baslangicSaat && saat < kampanya.bitisSaat
        : saat >= kampanya.baslangicSaat || saat < kampanya.bitisSaat;
      if (!aktifSaat) return enYuksek;
    }
    const kategoriler = Array.isArray(kampanya.gecerliKategoriler) ? kampanya.gecerliKategoriler : [];
    if (!kategoriler.includes(urun.kategori)) return enYuksek;
    return Math.max(enYuksek, sayiSinirla(kampanya.indirimYuzde, 0, 100, 0));
  }, 0);
}

function fiyatliUrun(urun, kampanyalar, uye) {
  const indirimYuzde = etkinIndirim(urun, kampanyalar, uye);
  return { ...urun, hesaplananFiyat: Number((Number(urun.fiyat) * (1 - indirimYuzde / 100)).toFixed(2)), indirimYuzde };
}

function sirala(liste, tur, tercih) {
  return [...liste].sort((a, b) => {
    if (tur === "ekonomik") return a.hesaplananFiyat - b.hesaplananFiyat || Number(b.populer) - Number(a.populer);
    if (tur === "hizli") return Number(b.populer) - Number(a.populer) || Number(a.sira || 100) - Number(b.sira || 100);
    const aAci = ACI_KELIMELERI.some((k) => urunMetni(a).includes(k));
    const bAci = ACI_KELIMELERI.some((k) => urunMetni(b).includes(k));
    const aciPuani = (urunAci) => tercih.aci >= 3 ? Number(urunAci) : Number(!urunAci);
    return aciPuani(bAci) - aciPuani(aAci) || Number(b.populer) - Number(a.populer) || Number(a.sira || 100) - Number(b.sira || 100);
  });
}

function adetEkle(harita, urun, adet) {
  if (!urun || adet < 1) return;
  const onceki = harita.get(Number(urun.id));
  harita.set(Number(urun.id), { urun, adet: (onceki?.adet || 0) + adet });
}

function planKur(tur, urunler, tercih, kampanyalar, uye) {
  const uygun = urunler.filter((u) => urunUygunMu(u, tercih)).map((u) => fiyatliUrun(u, kampanyalar, uye));
  const ana = sirala(uygun.filter((u) => ANA_URUN_TIPLERI.has(u.urunTipi)), tur, tercih);
  const yan = sirala(uygun.filter((u) => u.urunTipi === "yan_lezzet"), tur, tercih);
  const icecek = sirala(uygun.filter((u) => u.urunTipi === "icecek"), tur, tercih);
  if (!ana.length && !yan.length && !icecek.length) return null;

  const kalemler = new Map();
  const anaAdet = tercih.aclik === "hafif" ? Math.max(1, Math.ceil(tercih.kisiSayisi * .7)) : tercih.kisiSayisi;
  const yanAdet = tercih.paylasim
    ? Math.ceil(tercih.kisiSayisi / (tercih.aclik === "cok" ? 1.5 : 2.5))
    : (tercih.aclik === "cok" ? tercih.kisiSayisi : Math.ceil(tercih.kisiSayisi / 2));
  const anaCesit = Math.min(ana.length, tercih.kisiSayisi > 2 ? 2 : 1);
  for (let i = 0; i < anaAdet; i += 1) adetEkle(kalemler, ana[i % anaCesit], 1);
  const secilenMenuVar = [...kalemler.values()].some(({ urun }) => urun?.urunTipi === "menu");
  if (!secilenMenuVar) {
    for (let i = 0; i < yanAdet; i += 1) adetEkle(kalemler, yan[i % Math.max(1, Math.min(yan.length, 2))], 1);
    for (let i = 0; i < tercih.kisiSayisi; i += 1) adetEkle(kalemler, icecek[i % Math.max(1, Math.min(icecek.length, 2))], 1);
  }

  let secilenler = [...kalemler.values()].filter(({ urun }) => urun);
  const butce = tercih.butceKisi * tercih.kisiSayisi;
  let toplam = secilenler.reduce((t, { urun, adet }) => t + urun.hesaplananFiyat * adet, 0);
  if (toplam > butce && tur !== "dengeli") {
    secilenler = secilenler.filter(({ urun }) => urun.urunTipi !== "yan_lezzet");
    toplam = secilenler.reduce((t, { urun, adet }) => t + urun.hesaplananFiyat * adet, 0);
  }
  if (!secilenler.length) return null;

  const adlar = { dengeli: "Dengeli seçim", ekonomik: "Bütçe dostu", hizli: "Hızlı ve popüler" };
  const aciklamalar = {
    dengeli: "Ana ürün, yan lezzet ve içecek dengesini gözetir.",
    ekonomik: "Kişi başı bütçeye yaklaşan uygun seçenekleri öne çıkarır.",
    hizli: "Popüler ve mutfak akışına uygun ürünleri öne çıkarır.",
  };
  return {
    id: tur,
    baslik: adlar[tur],
    aciklama: aciklamalar[tur],
    toplam: Number(toplam.toFixed(2)),
    kisiBasi: Number((toplam / tercih.kisiSayisi).toFixed(2)),
    butceyeUygun: toplam <= butce,
    kalemler: secilenler.map(({ urun, adet }) => ({
      urunId: Number(urun.id), ad: urun.ad, gorsel: urun.gorsel || null, kategori: urun.kategori,
      adet, birimFiyat: urun.hesaplananFiyat, indirimYuzde: urun.indirimYuzde,
    })),
  };
}

function mutfakOzeti(masalar = []) {
  const kalemSayisi = masalar.reduce((toplam, masa) => toplam + (masa?.kalemler || []).filter((k) => !["hazir", "teslim", "iptal"].includes(k.durum)).length, 0);
  const seviye = kalemSayisi >= 16 ? "yoğun" : kalemSayisi >= 7 ? "normal" : "sakin";
  const ekSure = Math.min(18, Math.ceil(kalemSayisi * .8));
  return { seviye, aktifKalem: kalemSayisi, tahminiDakika: { min: 10 + ekSure, max: 18 + ekSure } };
}

export function masaPlaniOlustur({ urunler = [], kampanyalar = [], masalar = [], tercihler = {}, uye = false } = {}) {
  const tercih = tercihleriDogrula(tercihler);
  const planlar = PLAN_TURLERI.map((tur) => planKur(tur, urunler, tercih, kampanyalar, uye)).filter(Boolean);
  if (!planlar.length) {
    const hata = new Error("Tercihlerinize ve mevcut stoğa uygun bir plan bulunamadı.");
    hata.status = 422;
    throw hata;
  }
  return {
    tercihler: tercih,
    ozet: {
      kisiSayisi: tercih.kisiSayisi,
      butceToplam: tercih.butceKisi * tercih.kisiSayisi,
      mutfak: mutfakOzeti(masalar),
      uyarilar: ["Alerjen filtresi ürün kayıtlarına göre uygulanır. Çapraz temas riski için personele danışın.", "Tutarlar ödeme anındaki kampanya ve seçimlerle kesinleşir."],
    },
    planlar,
  };
}

function cihazAnahtariniDogrula(deger) {
  const anahtar = String(deger || "").trim();
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(anahtar)) {
    const hata = new Error("Cihaz anahtarı geçersiz.");
    hata.status = 400;
    throw hata;
  }
  return anahtar;
}

function katilimciAdiniDogrula(deger) {
  const ad = String(deger || "Misafir").replace(/[<>\u0000-\u001F]/g, "").trim().slice(0, 40);
  return ad || "Misafir";
}

export async function masaZekasiTablolariniHazirla(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS masa_zekasi_oturumlari (
      id BIGSERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      masa_no VARCHAR(30) NOT NULL,
      durum VARCHAR(12) NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif','kapali')),
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS masa_zekasi_aktif_masa_idx
      ON masa_zekasi_oturumlari(isletme_id, masa_no) WHERE durum='aktif';
    CREATE TABLE IF NOT EXISTS masa_zekasi_katilimcilari (
      id BIGSERIAL PRIMARY KEY,
      oturum_id BIGINT NOT NULL REFERENCES masa_zekasi_oturumlari(id) ON DELETE CASCADE,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      cihaz_anahtari VARCHAR(80) NOT NULL,
      ad VARCHAR(40) NOT NULL,
      tercihler JSONB,
      katilma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (oturum_id, cihaz_anahtari)
    );
    CREATE INDEX IF NOT EXISTS masa_zekasi_katilimci_tenant_idx
      ON masa_zekasi_katilimcilari(isletme_id, oturum_id);
  `);
}

async function aktifOturumuBulVeyaAc(isletmeId, pool, masaNo) {
  await pool.query("UPDATE masa_zekasi_oturumlari SET durum='kapali',guncelleme=NOW() WHERE isletme_id=$1 AND durum='aktif' AND guncelleme < NOW()-INTERVAL '6 hours'", [isletmeId]);
  const sonuc = await pool.query(`
    INSERT INTO masa_zekasi_oturumlari(isletme_id,masa_no)
    VALUES($1,$2)
    ON CONFLICT (isletme_id,masa_no) WHERE durum='aktif'
    DO UPDATE SET guncelleme=NOW()
    RETURNING id,isletme_id,masa_no,durum,olusturma,guncelleme
  `, [isletmeId, masaNo]);
  return sonuc.rows[0];
}

function oturumuDonustur(oturum, katilimcilar, benimCihazim = "") {
  return {
    id: String(oturum.id),
    masaNo: oturum.masa_no,
    durum: oturum.durum,
    katilimcilar: katilimcilar.map((k) => ({
      id: String(k.id), ad: k.ad, hazir: Boolean(k.tercihler), ben: benimCihazim ? k.cihaz_anahtari === benimCihazim : false,
    })),
    guncelleme: oturum.guncelleme,
  };
}

export async function masaZekasiOturumunuGetir(isletmeId, pool, masaNo, benimCihazim = "") {
  const sonuc = await pool.query("SELECT * FROM masa_zekasi_oturumlari WHERE isletme_id=$1 AND masa_no=$2 AND durum='aktif' ORDER BY id DESC LIMIT 1", [isletmeId, masaNo]);
  if (!sonuc.rows[0]) return null;
  const katilimcilar = await pool.query("SELECT id,ad,cihaz_anahtari,tercihler FROM masa_zekasi_katilimcilari WHERE isletme_id=$1 AND oturum_id=$2 ORDER BY katilma,id", [isletmeId, sonuc.rows[0].id]);
  return oturumuDonustur(sonuc.rows[0], katilimcilar.rows, benimCihazim);
}

export async function masaZekasiOturumunaKatil(isletmeId, pool, masaNo, cihazAnahtari, ad) {
  const cihaz = cihazAnahtariniDogrula(cihazAnahtari);
  const oturum = await aktifOturumuBulVeyaAc(isletmeId, pool, masaNo);
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    await baglanti.query("SELECT id FROM masa_zekasi_oturumlari WHERE id=$1 AND isletme_id=$2 FOR UPDATE", [oturum.id, isletmeId]);
    const mevcut = await baglanti.query("SELECT id FROM masa_zekasi_katilimcilari WHERE oturum_id=$1 AND isletme_id=$2 AND cihaz_anahtari=$3", [oturum.id, isletmeId, cihaz]);
    if (!mevcut.rowCount) {
      const sayac = await baglanti.query("SELECT COUNT(*)::int AS adet FROM masa_zekasi_katilimcilari WHERE oturum_id=$1 AND isletme_id=$2", [oturum.id, isletmeId]);
      if (Number(sayac.rows[0]?.adet) >= 12) {
        const hata = new Error("Bu ortak masa oturumu en fazla 12 katılımcı kabul eder.");
        hata.status = 409;
        throw hata;
      }
    }
    await baglanti.query(`
      INSERT INTO masa_zekasi_katilimcilari(oturum_id,isletme_id,cihaz_anahtari,ad)
      VALUES($1,$2,$3,$4)
      ON CONFLICT(oturum_id,cihaz_anahtari) DO UPDATE SET ad=EXCLUDED.ad,guncelleme=NOW()
    `, [oturum.id, isletmeId, cihaz, katilimciAdiniDogrula(ad)]);
    await baglanti.query("COMMIT");
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
  return masaZekasiOturumunuGetir(isletmeId, pool, masaNo, cihaz);
}

export async function masaZekasiTercihiniKaydet(isletmeId, pool, masaNo, cihazAnahtari, tercihler) {
  const cihaz = cihazAnahtariniDogrula(cihazAnahtari);
  const dogrulanmis = tercihleriDogrula({ ...tercihler, kisiSayisi: 1 });
  const sonuc = await pool.query(`
    UPDATE masa_zekasi_katilimcilari k SET tercihler=$4::jsonb,guncelleme=NOW()
    FROM masa_zekasi_oturumlari o
    WHERE o.id=k.oturum_id AND o.isletme_id=$1 AND o.masa_no=$2 AND o.durum='aktif'
      AND k.isletme_id=$1 AND k.cihaz_anahtari=$3
    RETURNING k.id
  `, [isletmeId, masaNo, cihaz, JSON.stringify(dogrulanmis)]);
  if (!sonuc.rowCount) {
    const hata = new Error("Önce ortak masa oturumuna katılın.");
    hata.status = 409;
    throw hata;
  }
  await pool.query("UPDATE masa_zekasi_oturumlari SET guncelleme=NOW() WHERE isletme_id=$1 AND masa_no=$2 AND durum='aktif'", [isletmeId, masaNo]);
  return masaZekasiOturumunuGetir(isletmeId, pool, masaNo, cihaz);
}

export function ortakTercihleriBirlestir(tercihler) {
  const hazir = tercihler.map((t) => tercihleriDogrula(t)).filter(Boolean);
  if (!hazir.length) {
    const hata = new Error("Plan oluşturmak için en az bir kişi tercihlerini tamamlamalı.");
    hata.status = 409;
    throw hata;
  }
  const aclikPuani = { hafif: 1, normal: 2, cok: 3 };
  const ortalamaAclik = hazir.reduce((t, x) => t + aclikPuani[x.aclik], 0) / hazir.length;
  const beslenme = hazir.some((x) => x.beslenme === "vegan") ? "vegan" : hazir.some((x) => x.beslenme === "vejetaryen") ? "vejetaryen" : "farketmez";
  return {
    kisiSayisi: hazir.length,
    butceKisi: Math.round(hazir.reduce((t, x) => t + x.butceKisi, 0) / hazir.length),
    paylasim: hazir.some((x) => x.paylasim),
    aclik: ortalamaAclik >= 2.5 ? "cok" : ortalamaAclik < 1.5 ? "hafif" : "normal",
    aci: Math.round(hazir.reduce((t, x) => t + x.aci, 0) / hazir.length),
    beslenme,
    alerjenler: [...new Set(hazir.flatMap((x) => x.alerjenler))],
    sevilmeyenler: [...new Set(hazir.flatMap((x) => x.sevilmeyenler))],
  };
}

export async function masaZekasiOrtakTercihleriniGetir(isletmeId, pool, masaNo, cihazAnahtari) {
  const cihaz = cihazAnahtariniDogrula(cihazAnahtari);
  const sonuc = await pool.query(`
    SELECT k.tercihler FROM masa_zekasi_katilimcilari k
    JOIN masa_zekasi_oturumlari o ON o.id=k.oturum_id
    WHERE o.isletme_id=$1 AND o.masa_no=$2 AND o.durum='aktif' AND k.isletme_id=$1
      AND EXISTS(SELECT 1 FROM masa_zekasi_katilimcilari ben WHERE ben.oturum_id=o.id AND ben.cihaz_anahtari=$3)
      AND k.tercihler IS NOT NULL
  `, [isletmeId, masaNo, cihaz]);
  return ortakTercihleriBirlestir(sonuc.rows.map((r) => r.tercihler));
}

export async function masaZekasiOturumunuKapat(isletmeId, pool, masaNo) {
  await pool.query("UPDATE masa_zekasi_oturumlari SET durum='kapali',guncelleme=NOW() WHERE isletme_id=$1 AND masa_no=$2 AND durum='aktif'", [isletmeId, masaNo]);
}
