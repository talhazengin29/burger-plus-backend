const DESTEKLENEN_DILLER = new Set(["tr", "en"]);
const ANAHTAR_DESENI = /^[a-z][a-z0-9]*(?:\.[a-zA-Z0-9]+)*(?:_(?:one|other))?$/;

function tenantId(isletmeId) {
  const id = Number(isletmeId);
  if (!Number.isInteger(id) || id < 1) throw new Error("İşletme bilgisi geçersiz.");
  return id;
}

function diliDogrula(dil) {
  const temiz = String(dil || "").trim().toLowerCase();
  if (!DESTEKLENEN_DILLER.has(temiz)) throw new Error("Desteklenmeyen dil.");
  return temiz;
}

function anahtariDogrula(anahtar) {
  const temiz = String(anahtar || "").trim().slice(0, 160);
  if (!ANAHTAR_DESENI.test(temiz)) throw new Error(`Geçersiz sözlük anahtarı: ${temiz || "(boş)"}`);
  return temiz;
}

function degeriTemizle(deger) {
  return [...String(deger || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()].slice(0, 1000).join("");
}

export async function i18nTablosunuHazirla(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS i18n_sozluk (
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      dil VARCHAR(5) NOT NULL,
      anahtar VARCHAR(160) NOT NULL,
      deger TEXT NOT NULL,
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (isletme_id, dil, anahtar),
      CHECK (dil IN ('tr','en')),
      CHECK (char_length(deger) BETWEEN 1 AND 1000)
    );
    CREATE INDEX IF NOT EXISTS i18n_sozluk_isletme_dil_idx ON i18n_sozluk(isletme_id,dil);
  `);
}

export async function i18nSozlugunuGetir(pool, isletmeId, dil) {
  const sonuc = await pool.query(
    "SELECT anahtar,deger,guncelleme FROM i18n_sozluk WHERE isletme_id=$1 AND dil=$2 ORDER BY anahtar",
    [tenantId(isletmeId), diliDogrula(dil)]
  );
  return {
    sozluk: Object.fromEntries(sonuc.rows.map((satir) => [satir.anahtar, satir.deger])),
    guncelleme: sonuc.rows.reduce((son, satir) => !son || satir.guncelleme > son ? satir.guncelleme : son, null),
  };
}

export async function i18nTumSozlukleriGetir(pool, isletmeId) {
  const sonuc = await pool.query(
    "SELECT dil,anahtar,deger,guncelleme FROM i18n_sozluk WHERE isletme_id=$1 ORDER BY anahtar,dil",
    [tenantId(isletmeId)]
  );
  const sozlukler = { tr: {}, en: {} };
  for (const satir of sonuc.rows) sozlukler[satir.dil][satir.anahtar] = satir.deger;
  return { sozlukler, kayitSayisi: sonuc.rows.length };
}

export async function i18nSozlugunuKaydet(pool, isletmeId, girdi) {
  const id = tenantId(isletmeId);
  const sozlukler = girdi?.sozlukler;
  if (!sozlukler || typeof sozlukler !== "object" || Array.isArray(sozlukler)) throw new Error("Sözlük verisi geçersiz.");
  const islemler = [];
  for (const [hamDil, hamSozluk] of Object.entries(sozlukler)) {
    const dil = diliDogrula(hamDil);
    if (!hamSozluk || typeof hamSozluk !== "object" || Array.isArray(hamSozluk)) throw new Error(`${dil} sözlüğü geçersiz.`);
    for (const [hamAnahtar, hamDeger] of Object.entries(hamSozluk)) {
      islemler.push({ dil, anahtar: anahtariDogrula(hamAnahtar), deger: degeriTemizle(hamDeger) });
    }
  }
  if (islemler.length > 1000) throw new Error("Tek istekte en fazla 1000 sözlük kaydı güncellenebilir.");
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    for (const kayit of islemler) {
      if (!kayit.deger) {
        await baglanti.query("DELETE FROM i18n_sozluk WHERE isletme_id=$1 AND dil=$2 AND anahtar=$3", [id, kayit.dil, kayit.anahtar]);
      } else {
        await baglanti.query(
          `INSERT INTO i18n_sozluk (isletme_id,dil,anahtar,deger) VALUES ($1,$2,$3,$4)
           ON CONFLICT (isletme_id,dil,anahtar) DO UPDATE SET deger=EXCLUDED.deger,guncelleme=NOW()`,
          [id, kayit.dil, kayit.anahtar, kayit.deger]
        );
      }
    }
    await baglanti.query("COMMIT");
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally {
    baglanti.release();
  }
  return i18nTumSozlukleriGetir(pool, id);
}

const KONSEPT_METINLERI = {
  burger: {
    tr: { slogan: "Lezzetli Yemek, Harika Deneyim!", sloganVurgu: "Harika Deneyim!", aramaPlaceholder: "Menüde ara...", urunBolumBaslik: "Popüler Ürünler" },
    en: { slogan: "Delicious Food, Great Experience!", sloganVurgu: "Great Experience!", aramaPlaceholder: "Search the menu...", urunBolumBaslik: "Popular Products" },
  },
  cafe: {
    tr: { slogan: "Günün Her Anına Eşlik Eden Lezzet", sloganVurgu: "Eşlik Eden Lezzet", aramaPlaceholder: "Kahve, tatlı ara...", urunBolumBaslik: "Öne Çıkanlar" },
    en: { slogan: "Flavor for Every Moment of Your Day", sloganVurgu: "Every Moment", aramaPlaceholder: "Search coffee and desserts...", urunBolumBaslik: "Featured Products" },
  },
  pizza: {
    tr: { slogan: "Taş Fırından Sofrana", sloganVurgu: "Sofrana", aramaPlaceholder: "Pizza, makarna ara...", urunBolumBaslik: "Fırından Yeni Çıkanlar" },
    en: { slogan: "From the Stone Oven to Your Table", sloganVurgu: "Your Table", aramaPlaceholder: "Search pizza and pasta...", urunBolumBaslik: "Fresh from the Oven" },
  },
};

function katalogKaydi(anahtar, grup, etiket, turkce, varsayilanEn = "") {
  return { anahtar, grup, etiket, turkce: String(turkce || "").trim(), varsayilanEn: String(varsayilanEn || "").trim() };
}

export async function i18nHazirlikRaporuGetir(pool, isletmeId, dil = "en") {
  const id = tenantId(isletmeId);
  const temizDil = diliDogrula(dil);
  if (temizDil === "tr") return { dil: "tr", hazir: true, eksikSayisi: 0, eksikler: [], katalog: [] };
  const [isletmeSonucu, kategoriSonucu, urunSonucu, kampanyaSonucu, duyuruSonucu, ayarSonucu, sozlukSonucu] = await Promise.all([
    pool.query("SELECT konsept,tema FROM isletmeler WHERE id=$1", [id]),
    pool.query("SELECT id,ad,ceviriler FROM kategoriler WHERE isletme_id=$1 AND aktif=true AND arsivli=false ORDER BY sira,id", [id]),
    pool.query("SELECT id,ad,aciklama,ceviriler,malzemeler,alerjenler,gramaj_opsiyonu,boyut_secenekleri,ekstra_malzeme_ayari FROM urunler WHERE isletme_id=$1 AND aktif=true AND arsivli=false ORDER BY sira,id", [id]),
    pool.query("SELECT id,etiket,baslik,aciklama,buton,ceviriler FROM kampanyalar WHERE isletme_id=$1 AND aktif=true AND arsivli=false ORDER BY sira,id", [id]),
    pool.query("SELECT id,baslik,mesaj,ceviriler FROM duyurular WHERE isletme_id=$1 AND aktif=true AND arsivli=false ORDER BY id", [id]),
    pool.query("SELECT anahtar,deger FROM sistem_ayarlari WHERE isletme_id=$1 AND anahtar IN ('sadakat_kurulum_v1','cuzdan_kurulum_v1')", [id]),
    pool.query("SELECT anahtar,deger FROM i18n_sozluk WHERE isletme_id=$1 AND dil=$2", [id, temizDil]),
  ]);
  const katalog = [];
  const isletme = isletmeSonucu.rows[0] || {};
  const konsept = KONSEPT_METINLERI[isletme.konsept] || KONSEPT_METINLERI.burger;
  const temaMetinleri = isletme.tema?.metinler || {};
  const temaCevirileri = isletme.tema?.metinCevirileri || {};
  for (const [alan, turkceVarsayilan] of Object.entries(konsept.tr)) {
    katalog.push(katalogKaydi(`business.${alan}`, "Marka metinleri", alan, temaMetinleri[alan] || turkceVarsayilan, temaCevirileri[alan]?.en || konsept.en[alan]));
  }
  for (const kategori of kategoriSonucu.rows) katalog.push(katalogKaydi(`category.${kategori.id}.name`, "Kategoriler", kategori.ad, kategori.ad, kategori.ceviriler?.ad?.en));
  for (const urun of urunSonucu.rows) {
    katalog.push(katalogKaydi(`product.${urun.id}.name`, "Ürünler", `${urun.ad} · ad`, urun.ad, urun.ceviriler?.ad?.en));
    if (String(urun.aciklama || "").trim()) katalog.push(katalogKaydi(`product.${urun.id}.description`, "Ürünler", `${urun.ad} · açıklama`, urun.aciklama, urun.ceviriler?.aciklama?.en));
    for (const [index, malzeme] of (Array.isArray(urun.malzemeler) ? urun.malzemeler : []).entries()) katalog.push(katalogKaydi(`product.${urun.id}.ingredient.${index}`, "Ürün içerikleri", `${urun.ad} · ${malzeme}`, malzeme));
    for (const [index, alerjen] of (Array.isArray(urun.alerjenler) ? urun.alerjenler : []).entries()) katalog.push(katalogKaydi(`product.${urun.id}.allergen.${index}`, "Ürün içerikleri", `${urun.ad} · ${alerjen}`, alerjen));
    if (urun.gramaj_opsiyonu?.etiket) katalog.push(katalogKaydi(`product.${urun.id}.amountLabel`, "Ürün seçenekleri", `${urun.ad} · miktar başlığı`, urun.gramaj_opsiyonu.etiket));
    for (const [index, boyut] of (Array.isArray(urun.boyut_secenekleri) ? urun.boyut_secenekleri : []).entries()) if (boyut?.etiket) katalog.push(katalogKaydi(`product.${urun.id}.size.${index}`, "Ürün seçenekleri", `${urun.ad} · ${boyut.etiket}`, boyut.etiket));
    const ekstra = urun.ekstra_malzeme_ayari || {};
    if (ekstra.aktif && ekstra.baslik) katalog.push(katalogKaydi(`product.${urun.id}.extrasTitle`, "Ürün seçenekleri", `${urun.ad} · ekstra başlığı`, ekstra.baslik));
    for (const [index, secenek] of (Array.isArray(ekstra.secenekler) ? ekstra.secenekler : []).filter((secenek) => secenek?.aktif !== false).entries()) if (secenek?.ad) katalog.push(katalogKaydi(`product.${urun.id}.extra.${index}`, "Ürün seçenekleri", `${urun.ad} · ${secenek.ad}`, secenek.ad));
  }
  for (const kampanya of kampanyaSonucu.rows) {
    for (const [alan, etiket] of [["etiket", "etiket"], ["baslik", "başlık"], ["aciklama", "açıklama"], ["buton", "buton"]]) {
      katalog.push(katalogKaydi(`campaign.${kampanya.id}.${alan}`, "Kampanyalar", `${kampanya.baslik} · ${etiket}`, kampanya[alan], kampanya.ceviriler?.[alan]?.en));
    }
  }
  for (const duyuru of duyuruSonucu.rows) {
    katalog.push(katalogKaydi(`announcement.${duyuru.id}.title`, "Duyurular", `${duyuru.baslik} · başlık`, duyuru.baslik, duyuru.ceviriler?.baslik?.en));
    katalog.push(katalogKaydi(`announcement.${duyuru.id}.message`, "Duyurular", `${duyuru.baslik} · mesaj`, duyuru.mesaj, duyuru.ceviriler?.mesaj?.en));
  }
  const ayarlar = Object.fromEntries(ayarSonucu.rows.map((satir) => [satir.anahtar, satir.deger || {}]));
  const sadakat = ayarlar.sadakat_kurulum_v1 || {};
  const sadakatVarsayilanlari = { kartEtiketi: ["YE KAZAN", "EARN & ENJOY"], baslik: ["Lezzet yolculuğun", "Your flavor journey"], aciklama: ["Her uygun üründe bir damga kazan, kartını tamamla ve hediyeni kap.", "Earn a stamp with every eligible product, complete your card and claim your reward."], odulMetni: ["1 Burger Hediye", "1 Free Burger"], damgaBirimi: ["ürün", "item"], tamamlanmaMetni: ["Hediyen hazır!", "Your reward is ready!"] };
  for (const [alan, [tr, en]] of Object.entries(sadakatVarsayilanlari)) katalog.push(katalogKaydi(`loyalty.${alan}`, "Damga kartı", alan, sadakat[alan] || tr, sadakat.ceviriler?.[alan]?.en || en));
  const cuzdan = ayarlar.cuzdan_kurulum_v1 || {};
  for (const [alan, tr, en] of [["kampanyaBasligi", "Nakit yüklemene ekstra bakiye", "Bonus balance for your cash top-up"], ["kampanyaAciklamasi", "Kasadan nakit yükle, bonus bakiyeni anında kullan.", "Top up with cash at the register and use your bonus instantly."]]) katalog.push(katalogKaydi(`wallet.${alan}`, "Cüzdan", alan, cuzdan[alan] || tr, cuzdan.ceviriler?.[alan]?.en || en));
  const dbSozluk = Object.fromEntries(sozlukSonucu.rows.map((satir) => [satir.anahtar, satir.deger]));
  const eksikler = katalog.filter((kayit) => !String(dbSozluk[kayit.anahtar] || "").trim());
  return { dil: temizDil, hazir: eksikler.length === 0, eksikSayisi: eksikler.length, eksikler: eksikler.map(({ anahtar, grup, etiket }) => ({ anahtar, grup, etiket })), katalog };
}

export const i18nDogrulama = { diliDogrula, anahtariDogrula, degeriTemizle };
