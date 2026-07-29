import pool from "./db.js";
import bcrypt from "bcryptjs";

const BASLANGIC_URUNLERI = [
  [1,"Classic Burger",180,"Burgerler",200,"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop"],
  [2,"BBQ Smoke Burger",220,"Burgerler",300,"https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400&h=400&fit=crop"],
  [3,"Vegan Burger",195,"Burgerler",180,"https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400&h=400&fit=crop"],
  [4,"Double Cheese",250,"Burgerler",400,"https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=400&fit=crop"],
  [5,"Çıtır Patates",75,"Yan Lezzetler",400,"https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=400&fit=crop"],
  [6,"Soğan Halkası",85,"Yan Lezzetler",200,"https://images.unsplash.com/photo-1639024471283-03518883512d?w=400&h=400&fit=crop"],
  [7,"Kola",40,"İçecekler",330,"https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&h=400&fit=crop"],
  [8,"Limonata",55,"İçecekler",400,"https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400&h=400&fit=crop"],
  [9,"Ayran",35,"İçecekler",300,"https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400&h=400&fit=crop"],
  [10,"Su",15,"İçecekler",500,"https://images.unsplash.com/photo-1616118132534-381148898bb4?w=400&h=400&fit=crop"],
  [11,"Soda",30,"İçecekler",200,"https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400&h=400&fit=crop"],
  [12,"Çay",20,"İçecekler",200,"https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=400&h=400&fit=crop"],
  [13,"Trüflü Mushroom Burger",275,"Burgerler",220,"https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=400&fit=crop"],
  [14,"Acılı Mexican Burger",260,"Burgerler",200,"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop"],
  [15,"Crispy Chicken Burger",220,"Burgerler",180,"https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=400&h=400&fit=crop"],
  [16,"BBQ Ranch Burger",285,"Burgerler",250,"https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400&h=400&fit=crop"],
  [17,"Mozzarella Sticks",110,"Yan Lezzetler",180,"https://images.unsplash.com/photo-1531749668029-2db88e4276c7?w=400&h=400&fit=crop"],
  [18,"Coleslaw Salata",70,"Yan Lezzetler",160,"https://images.unsplash.com/photo-1547592180-85f173990554?w=400&h=400&fit=crop"],
  [19,"Şeftalili Ice Tea",50,"İçecekler",330,"https://images.unsplash.com/photo-1497534446932-c925b458314e?w=400&h=400&fit=crop"],
  [20,"Çikolatalı Milkshake",95,"İçecekler",400,"https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&h=400&fit=crop"],
];

const BASLANGIC_MALZEMELERI = {
  1: ["Dana köfte", "Cheddar", "Marul", "Domates", "Soğan", "Turşu", "Özel sos"],
  2: ["Dana köfte", "Cheddar", "Çıtır soğan", "BBQ sos", "Marul", "Turşu"],
  3: ["Bitkisel köfte", "Marul", "Domates", "Soğan", "Vegan sos"],
  4: ["Dana köfte x2", "Cheddar x2", "Marul", "Domates", "Özel sos"],
  5: ["Patates", "Ayçiçek yağı", "Tuz"],
  6: ["Soğan", "Galeta unu", "Un", "Baharatlar"],
  7: ["Kola"], 8: ["Limonata"], 9: ["Ayran"], 10: ["Su"], 11: ["Soda"], 12: ["Çay"],
  13: ["Dana köfte", "Cheddar", "Mantar", "Trüf sos", "Marul"],
  14: ["Dana köfte", "Cheddar", "Jalapeno", "Meksika sosu", "Marul"],
  15: ["Çıtır tavuk", "Cheddar", "Coleslaw", "Ranch sos"],
  16: ["Dana köfte", "Cheddar", "BBQ sos", "Ranch sos", "Çıtır soğan"],
  17: ["Mozzarella", "Galeta unu", "Marinara sos"],
  18: ["Lahana", "Havuç", "Yoğurtlu sos"],
  19: ["Çay", "Şeftali", "Su"],
  20: ["Süt", "Çikolata", "Dondurma"],
};

const sayi = (deger, varsayilan = 0) => {
  const n = Number(deger);
  return Number.isFinite(n) ? n : varsayilan;
};

export async function ilkYerelAdminOlustur({ email, sifre }) {
  const yerelVeritabani = !process.env.DATABASE_URL && ["localhost", "127.0.0.1"].includes(process.env.PGHOST);
  if (!yerelVeritabani) throw new Error("İlk admin kurulumu yalnızca yerel geliştirme ortamında kullanılabilir.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") || String(sifre || "").length < 8) {
    throw new Error("Geçerli e-posta ve en az 8 karakterli şifre gerekli.");
  }
  const adminVar = await pool.query("SELECT 1 FROM kullanicilar WHERE rol='admin' LIMIT 1");
  if (adminVar.rows.length) throw new Error("İlk yönetici daha önce oluşturulmuş.");
  const sifreHash = await bcrypt.hash(String(sifre), 10);
  await pool.query(
    `INSERT INTO kullanicilar (ad,soyad,email,sifre_hash,rol)
     VALUES ('İşletme','Yöneticisi',$1,$2,'admin')`,
    [String(email).toLowerCase(), sifreHash]
  );
}

export async function yerelAdminKurulumGerekli() {
  const yerelVeritabani = !process.env.DATABASE_URL && ["localhost", "127.0.0.1"].includes(process.env.PGHOST);
  if (!yerelVeritabani) return false;
  const sonuc = await pool.query("SELECT 1 FROM kullanicilar WHERE rol='admin' LIMIT 1");
  return sonuc.rows.length === 0;
}

export async function adminTablolariHazirla() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS urunler (
      id SERIAL PRIMARY KEY,
      ad TEXT NOT NULL,
      fiyat NUMERIC NOT NULL CHECK (fiyat >= 0),
      kategori TEXT NOT NULL,
      gorsel TEXT,
      aciklama TEXT,
      malzemeler JSONB NOT NULL DEFAULT '[]'::jsonb,
      alerjenler JSONB NOT NULL DEFAULT '[]'::jsonb,
      besin_degerleri JSONB,
      temel_miktar NUMERIC,
      gramaj_opsiyonu JSONB,
      aktif BOOLEAN NOT NULL DEFAULT true,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS personeller (
      id SERIAL PRIMARY KEY,
      ad TEXT NOT NULL,
      soyad TEXT NOT NULL,
      rol TEXT NOT NULL,
      email TEXT UNIQUE,
      telefon TEXT,
      saatlik_ucret NUMERIC NOT NULL DEFAULT 0,
      aktif BOOLEAN NOT NULL DEFAULT true,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vardiyalar (
      id SERIAL PRIMARY KEY,
      personel_id INTEGER NOT NULL REFERENCES personeller(id),
      giris TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cikis TIMESTAMPTZ,
      notlar TEXT
    );

    CREATE TABLE IF NOT EXISTS sistem_ayarlari (
      anahtar TEXT PRIMARY KEY,
      deger JSONB NOT NULL DEFAULT '{}'::jsonb,
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS duyurular (
      id SERIAL PRIMARY KEY,
      baslik TEXT NOT NULL,
      mesaj TEXT NOT NULL,
      hedef TEXT NOT NULL DEFAULT '/anasayfa',
      aktif BOOLEAN NOT NULL DEFAULT true,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE siparis_kalemleri
    ADD COLUMN IF NOT EXISTS siparis_no TEXT
  `);

  await pool.query("ALTER TABLE urunler ADD COLUMN IF NOT EXISTS besin_degerleri JSONB");
  for (const [id, ad, fiyat, kategori, temelMiktar, gorsel] of BASLANGIC_URUNLERI) {
    await pool.query(
      `INSERT INTO urunler (id,ad,fiyat,kategori,temel_miktar,gorsel)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [id, ad, fiyat, kategori, temelMiktar, gorsel]
    );
  }
  await pool.query("SELECT setval('urunler_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM urunler), 20))");

  // Yeni eklenen başlangıç ürünleri eski kurulumlarda da içerikleriyle görünür.
  for (const [id, malzemeler] of Object.entries(BASLANGIC_MALZEMELERI)) {
    await pool.query(
      "UPDATE urunler SET malzemeler=$1::jsonb WHERE id=$2 AND malzemeler='[]'::jsonb",
      [JSON.stringify(malzemeler), id]
    );
  }

  // Demo başlangıç verileri yalnızca bir defa eklenir. Sonraki başlangıçlarda
  // adminin eklediği/değiştirdiği kayıtlar korunur ve veriler çoğalmaz.
  const demoKuruldu = await pool.query("SELECT 1 FROM sistem_ayarlari WHERE anahtar='demo_seed_v1'");
  if (!demoKuruldu.rows.length) {
    for (const [id, malzemeler] of Object.entries(BASLANGIC_MALZEMELERI)) {
      await pool.query(
        "UPDATE urunler SET malzemeler=$1::jsonb WHERE id=$2 AND malzemeler='[]'::jsonb",
        [JSON.stringify(malzemeler), id]
      );
    }
    const personelVar = await pool.query("SELECT 1 FROM personeller LIMIT 1");
    if (!personelVar.rows.length) {
      await pool.query(`
        INSERT INTO personeller (ad,soyad,rol,email,telefon,saatlik_ucret) VALUES
          ('Ayşe','Yılmaz','Mutfak','ayse@burgerplus.demo','0555 100 10 10',180),
          ('Mehmet','Demir','Salon','mehmet@burgerplus.demo','0555 200 20 20',170),
          ('Zeynep','Kaya','Kasiyer','zeynep@burgerplus.demo','0555 300 30 30',175)
        ON CONFLICT (email) DO NOTHING
      `);
    }
    await pool.query(
      "INSERT INTO sistem_ayarlari (anahtar,deger) VALUES ('demo_seed_v1',$1::jsonb) ON CONFLICT DO NOTHING",
      [JSON.stringify({ tarih: new Date().toISOString() })]
    );
  }
}

function urunDonustur(u) {
  const urun = {
    id: u.id,
    ad: u.ad,
    fiyat: Number(u.fiyat),
    kategori: u.kategori,
    gorsel: u.gorsel,
    aciklama: u.aciklama,
    malzemeler: u.malzemeler || [],
    alerjenler: u.alerjenler || [],
    besinDegerleri: u.besin_degerleri || null,
    temelMiktar: u.temel_miktar == null ? null : Number(u.temel_miktar),
    aktif: u.aktif,
  };
  if (u.gramaj_opsiyonu != null) urun.gramajOpsiyonu = u.gramaj_opsiyonu;
  return urun;
}

export async function urunleriGetir({ tumu = false } = {}) {
  const sonuc = await pool.query(`
    SELECT u.*
    FROM urunler u
    ${tumu ? "" : "WHERE u.aktif = true"}
    ORDER BY u.kategori, u.ad
  `);
  return sonuc.rows.map(urunDonustur);
}

export async function urunKaydet(veri) {
  const alanlar = [
    String(veri.ad || "").trim().slice(0, 120),
    sayi(veri.fiyat),
    String(veri.kategori || "Genel").trim().slice(0, 80),
    veri.gorsel ? String(veri.gorsel).slice(0, 1000) : null,
    veri.aciklama ? String(veri.aciklama).slice(0, 2000) : null,
    JSON.stringify(Array.isArray(veri.malzemeler) ? veri.malzemeler.slice(0, 100) : []),
    JSON.stringify(Array.isArray(veri.alerjenler) ? veri.alerjenler.slice(0, 50) : []),
    veri.temelMiktar === "" || veri.temelMiktar == null ? null : sayi(veri.temelMiktar),
    veri.gramajOpsiyonu == null ? null : JSON.stringify(veri.gramajOpsiyonu),
    veri.aktif !== false,
  ];
  if (!alanlar[0] || alanlar[1] < 0) throw new Error("Ürün adı ve geçerli fiyat zorunludur.");

  const sonuc = veri.id
    ? await pool.query(
        `UPDATE urunler SET ad=$1, fiyat=$2, kategori=$3, gorsel=$4, aciklama=$5,
          malzemeler=$6::jsonb, alerjenler=$7::jsonb, temel_miktar=$8,
          gramaj_opsiyonu=$9::jsonb, aktif=$10, guncelleme=NOW()
         WHERE id=$11 RETURNING *`, [...alanlar, veri.id]
      )
    : await pool.query(
        `INSERT INTO urunler
          (ad,fiyat,kategori,gorsel,aciklama,malzemeler,alerjenler,temel_miktar,gramaj_opsiyonu,aktif)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10) RETURNING *`, alanlar
      );
  return urunDonustur(sonuc.rows[0]);
}

export async function urunAktiflikDegistir(id, aktif) {
  await pool.query("UPDATE urunler SET aktif=$1, guncelleme=NOW() WHERE id=$2", [!!aktif, id]);
}

export async function personelleriGetir() {
  const sonuc = await pool.query(`
    SELECT p.*,
      v.id AS acik_vardiya_id, v.giris AS vardiya_giris,
      COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(v2.cikis,NOW())-v2.giris))/3600)
                FROM vardiyalar v2 WHERE v2.personel_id=p.id
                AND v2.giris >= date_trunc('month',NOW())),0) AS aylik_saat
    FROM personeller p
    LEFT JOIN vardiyalar v ON v.personel_id=p.id AND v.cikis IS NULL
    WHERE p.aktif=true ORDER BY p.ad,p.soyad
  `);
  return sonuc.rows.map((p) => ({
    ...p,
    saatlik_ucret: Number(p.saatlik_ucret),
    aylik_saat: Number(p.aylik_saat),
  }));
}

export async function personelKaydet(veri) {
  const alanlar = [
    String(veri.ad || "").trim().slice(0, 80), String(veri.soyad || "").trim().slice(0, 80),
    String(veri.rol || "personel").slice(0, 40), veri.email || null, veri.telefon || null,
    sayi(veri.saatlikUcret),
  ];
  if (!alanlar[0] || !alanlar[1]) throw new Error("Personel adı ve soyadı zorunludur.");
  const sonuc = veri.id
    ? await pool.query(
        `UPDATE personeller SET ad=$1,soyad=$2,rol=$3,email=$4,telefon=$5,saatlik_ucret=$6
         WHERE id=$7 RETURNING *`, [...alanlar, veri.id]
      )
    : await pool.query(
        `INSERT INTO personeller (ad,soyad,rol,email,telefon,saatlik_ucret)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, alanlar
      );
  return sonuc.rows[0];
}

export async function vardiyaDegistir(personelId, islem) {
  if (islem === "giris") {
    const acik = await pool.query("SELECT id FROM vardiyalar WHERE personel_id=$1 AND cikis IS NULL", [personelId]);
    if (!acik.rows.length) await pool.query("INSERT INTO vardiyalar (personel_id) VALUES ($1)", [personelId]);
  } else if (islem === "cikis") {
    await pool.query(
      "UPDATE vardiyalar SET cikis=NOW() WHERE personel_id=$1 AND cikis IS NULL",
      [personelId]
    );
  }
}

export async function duyurulariGetir({ tumu = false } = {}) {
  const sonuc = await pool.query(
    `SELECT id,baslik,mesaj,hedef,aktif,olusturma FROM duyurular
     ${tumu ? "" : "WHERE aktif=true"}
     ORDER BY olusturma DESC LIMIT 30`
  );
  return sonuc.rows;
}

export async function duyuruKaydet(veri) {
  const baslik = String(veri.baslik || "").trim().slice(0, 100);
  const mesaj = String(veri.mesaj || "").trim().slice(0, 600);
  const hamHedef = String(veri.hedef || "/anasayfa").trim();
  const hedef = hamHedef.startsWith("/") && !hamHedef.startsWith("//") ? hamHedef.slice(0, 160) : "/anasayfa";
  if (!baslik || !mesaj) throw new Error("Duyuru başlığı ve mesajı zorunludur.");
  const sonuc = await pool.query(
    `INSERT INTO duyurular (baslik,mesaj,hedef,aktif) VALUES ($1,$2,$3,true) RETURNING *`,
    [baslik, mesaj, hedef]
  );
  return sonuc.rows[0];
}

export async function dashboardGetir() {
  const [satis, personel, populer] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(fiyat*adet),0) toplam,
      COUNT(DISTINCT COALESCE(siparis_no, id::text)) siparis_sayisi
      FROM siparis_kalemleri WHERE olusturma >= date_trunc('day',NOW())`),
    pool.query("SELECT COUNT(*) FILTER (WHERE aktif) toplam, (SELECT COUNT(*) FROM vardiyalar WHERE cikis IS NULL) vardiyada FROM personeller"),
    pool.query(`SELECT urun_ad, SUM(adet)::int adet, SUM(fiyat*adet) ciro
      FROM siparis_kalemleri WHERE olusturma >= NOW()-INTERVAL '30 days'
      GROUP BY urun_ad ORDER BY adet DESC LIMIT 5`),
  ]);
  return {
    bugunCiro: Number(satis.rows[0].toplam),
    bugunSiparis: Number(satis.rows[0].siparis_sayisi),
    personel: Number(personel.rows[0].toplam),
    vardiyada: Number(personel.rows[0].vardiyada),
    populer: populer.rows.map((p) => ({ ...p, adet: Number(p.adet), ciro: Number(p.ciro) })),
  };
}

export async function satisRaporuGetir(gun = 30) {
  const aralik = Math.min(365, Math.max(1, sayi(gun, 30)));
  const [gunluk, urunler, kategoriler, saatlik, haftalik] = await Promise.all([
    pool.query(`SELECT date_trunc('day',olusturma)::date gun, SUM(fiyat*adet) ciro, SUM(adet) adet
      FROM siparis_kalemleri WHERE olusturma >= NOW()-($1::text || ' days')::interval
      GROUP BY 1 ORDER BY 1`, [aralik]),
    pool.query(`SELECT urun_ad, SUM(adet) adet, SUM(fiyat*adet) ciro
      FROM siparis_kalemleri WHERE olusturma >= NOW()-($1::text || ' days')::interval
      GROUP BY urun_ad ORDER BY ciro DESC`, [aralik]),
    pool.query(`SELECT COALESCE(u.kategori,'Diğer') kategori, SUM(k.adet)::int adet, SUM(k.fiyat*k.adet) ciro
      FROM siparis_kalemleri k LEFT JOIN urunler u ON u.id=k.urun_id
      WHERE k.olusturma >= NOW()-($1::text || ' days')::interval
      GROUP BY 1 ORDER BY adet DESC`, [aralik]),
    pool.query(`SELECT EXTRACT(HOUR FROM olusturma)::int saat, SUM(adet)::int adet,
        COUNT(DISTINCT COALESCE(siparis_no,id::text))::int siparis
      FROM siparis_kalemleri WHERE olusturma >= NOW()-($1::text || ' days')::interval
      GROUP BY 1 ORDER BY 1`, [aralik]),
    pool.query(`SELECT EXTRACT(ISODOW FROM olusturma)::int gun, SUM(adet)::int adet,
        SUM(fiyat*adet) ciro
      FROM siparis_kalemleri WHERE olusturma >= NOW()-($1::text || ' days')::interval
      GROUP BY 1 ORDER BY 1`, [aralik]),
  ]);
  return {
    gunluk: gunluk.rows.map((g) => ({ ...g, ciro: Number(g.ciro), adet: Number(g.adet) })),
    urunler: urunler.rows.map((u) => ({ ...u, ciro: Number(u.ciro), adet: Number(u.adet) })),
    kategoriler: kategoriler.rows.map((k) => ({ ...k, ciro: Number(k.ciro), adet: Number(k.adet) })),
    saatlik: saatlik.rows.map((s) => ({ ...s, saat: Number(s.saat), adet: Number(s.adet), siparis: Number(s.siparis) })),
    haftalik: haftalik.rows.map((h) => ({ ...h, gun: Number(h.gun), adet: Number(h.adet), ciro: Number(h.ciro) })),
  };
}
