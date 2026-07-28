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
];

const BASLANGIC_MALZEMELERI = {
  1: ["Dana köfte", "Cheddar", "Marul", "Domates", "Soğan", "Turşu", "Özel sos"],
  2: ["Dana köfte", "Cheddar", "Çıtır soğan", "BBQ sos", "Marul", "Turşu"],
  3: ["Bitkisel köfte", "Marul", "Domates", "Soğan", "Vegan sos"],
  4: ["Dana köfte x2", "Cheddar x2", "Marul", "Domates", "Özel sos"],
  5: ["Patates", "Ayçiçek yağı", "Tuz"],
  6: ["Soğan", "Galeta unu", "Un", "Baharatlar"],
  7: ["Kola"], 8: ["Limonata"], 9: ["Ayran"], 10: ["Su"], 11: ["Soda"], 12: ["Çay"],
};

const BASLANGIC_STOKLARI = [
  ["Dana köfte", "Protein", "gr", 18000, 3000, 0.36],
  ["Bitkisel köfte", "Protein", "gr", 5000, 1000, 0.42],
  ["Burger ekmeği", "Ekmek", "adet", 160, 30, 8],
  ["Cheddar", "Süt ürünü", "adet", 240, 40, 5],
  ["Marul", "Sebze", "gr", 5000, 800, 0.08],
  ["Domates", "Sebze", "gr", 6000, 1000, 0.07],
  ["Soğan", "Sebze", "gr", 5000, 800, 0.04],
  ["Turşu", "Sebze", "gr", 4000, 600, 0.09],
  ["Patates", "Yan ürün", "gr", 24000, 4000, 0.05],
  ["Kola", "İçecek", "ml", 30000, 5000, 0.035],
  ["Limonata", "İçecek", "ml", 16000, 3000, 0.045],
  ["Ayran", "İçecek", "ml", 15000, 3000, 0.03],
  ["Su", "İçecek", "ml", 30000, 5000, 0.012],
  ["Soda", "İçecek", "ml", 12000, 2000, 0.02],
  ["Çay", "İçecek", "ml", 10000, 1500, 0.01],
];

const BASLANGIC_RECETELERI = [
  [1,"Dana köfte",200],[1,"Burger ekmeği",1],[1,"Cheddar",1],[1,"Marul",20],[1,"Domates",25],[1,"Soğan",15],[1,"Turşu",15],
  [2,"Dana köfte",300],[2,"Burger ekmeği",1],[2,"Cheddar",1],[2,"Marul",20],[2,"Soğan",20],[2,"Turşu",15],
  [3,"Bitkisel köfte",180],[3,"Burger ekmeği",1],[3,"Marul",20],[3,"Domates",25],[3,"Soğan",15],
  [4,"Dana köfte",400],[4,"Burger ekmeği",1],[4,"Cheddar",2],[4,"Marul",20],[4,"Domates",25],
  [5,"Patates",400],[6,"Soğan",200],
  [7,"Kola",330],[8,"Limonata",400],[9,"Ayran",300],[10,"Su",500],[11,"Soda",200],[12,"Çay",200],
];

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

    CREATE TABLE IF NOT EXISTS stok_kalemleri (
      id SERIAL PRIMARY KEY,
      ad TEXT NOT NULL UNIQUE,
      kategori TEXT NOT NULL DEFAULT 'Genel',
      birim TEXT NOT NULL DEFAULT 'adet',
      mevcut NUMERIC NOT NULL DEFAULT 0,
      kritik_seviye NUMERIC NOT NULL DEFAULT 0,
      birim_maliyet NUMERIC NOT NULL DEFAULT 0,
      aktif BOOLEAN NOT NULL DEFAULT true,
      guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stok_hareketleri (
      id SERIAL PRIMARY KEY,
      stok_id INTEGER NOT NULL REFERENCES stok_kalemleri(id),
      miktar NUMERIC NOT NULL,
      tip TEXT NOT NULL,
      aciklama TEXT,
      yapan_id INTEGER REFERENCES kullanicilar(id),
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS urun_receteleri (
      urun_id INTEGER NOT NULL REFERENCES urunler(id) ON DELETE CASCADE,
      stok_id INTEGER NOT NULL REFERENCES stok_kalemleri(id),
      miktar NUMERIC NOT NULL CHECK (miktar > 0),
      PRIMARY KEY (urun_id, stok_id)
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
  await pool.query("SELECT setval('urunler_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM urunler), 12))");

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
    for (const [ad, kategori, birim, mevcut, kritik, maliyet] of BASLANGIC_STOKLARI) {
      await pool.query(
        `INSERT INTO stok_kalemleri (ad,kategori,birim,mevcut,kritik_seviye,birim_maliyet)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (ad) DO NOTHING`,
        [ad, kategori, birim, mevcut, kritik, maliyet]
      );
    }
    const receteVar = await pool.query("SELECT 1 FROM urun_receteleri LIMIT 1");
    if (!receteVar.rows.length) {
      for (const [urunId, stokAdi, miktar] of BASLANGIC_RECETELERI) {
        await pool.query(
          `INSERT INTO urun_receteleri (urun_id,stok_id,miktar)
           SELECT $1,id,$3 FROM stok_kalemleri WHERE ad=$2
           ON CONFLICT (urun_id,stok_id) DO NOTHING`,
          [urunId, stokAdi, miktar]
        );
      }
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
    satilabilirAdet: u.satilabilir_adet == null ? null : Number(u.satilabilir_adet),
  };
  if (u.gramaj_opsiyonu != null) urun.gramajOpsiyonu = u.gramaj_opsiyonu;
  return urun;
}

export async function urunleriGetir({ tumu = false } = {}) {
  const sonuc = await pool.query(`
    SELECT u.*,
      CASE WHEN COUNT(r.stok_id) = 0 THEN NULL
           ELSE FLOOR(MIN(s.mevcut / NULLIF(r.miktar, 0))) END AS satilabilir_adet
    FROM urunler u
    LEFT JOIN urun_receteleri r ON r.urun_id = u.id
    LEFT JOIN stok_kalemleri s ON s.id = r.stok_id
    ${tumu ? "" : "WHERE u.aktif = true"}
    GROUP BY u.id
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

export async function stoklariGetir() {
  const sonuc = await pool.query(`
    SELECT *, (mevcut <= kritik_seviye) AS kritik
    FROM stok_kalemleri WHERE aktif=true ORDER BY kritik DESC, kategori, ad
  `);
  return sonuc.rows.map((s) => ({
    ...s,
    mevcut: Number(s.mevcut),
    kritik_seviye: Number(s.kritik_seviye),
    birim_maliyet: Number(s.birim_maliyet),
  }));
}

export async function stokHareketleriniGetir(limit = 100) {
  const sonuc = await pool.query(`
    SELECT h.id,h.miktar,h.tip,h.aciklama,h.olusturma,s.ad,s.birim
    FROM stok_hareketleri h JOIN stok_kalemleri s ON s.id=h.stok_id
    ORDER BY h.id DESC LIMIT $1
  `, [Math.min(500, Math.max(1, sayi(limit, 100)))]);
  return sonuc.rows.map((h) => ({ ...h, miktar: Number(h.miktar) }));
}

export async function stokKalemiKaydet(veri) {
  const alanlar = [
    String(veri.ad || "").trim().slice(0, 120),
    String(veri.kategori || "Genel").trim().slice(0, 80),
    String(veri.birim || "adet").trim().slice(0, 20),
    sayi(veri.mevcut), sayi(veri.kritikSeviye), sayi(veri.birimMaliyet),
  ];
  if (!alanlar[0]) throw new Error("Stok kalemi adı zorunludur.");
  const sonuc = veri.id
    ? await pool.query(
        `UPDATE stok_kalemleri SET ad=$1,kategori=$2,birim=$3,mevcut=$4,
         kritik_seviye=$5,birim_maliyet=$6,guncelleme=NOW() WHERE id=$7 RETURNING *`,
        [...alanlar, veri.id]
      )
    : await pool.query(
        `INSERT INTO stok_kalemleri (ad,kategori,birim,mevcut,kritik_seviye,birim_maliyet)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, alanlar
      );
  return sonuc.rows[0];
}

export async function stokHareketiEkle(stokId, miktar, tip, aciklama, yapanId) {
  const delta = sayi(miktar);
  if (!delta) throw new Error("Hareket miktarı sıfır olamaz.");
  const istemci = await pool.connect();
  try {
    await istemci.query("BEGIN");
    await istemci.query(
      "UPDATE stok_kalemleri SET mevcut=GREATEST(0, mevcut+$1), guncelleme=NOW() WHERE id=$2",
      [delta, stokId]
    );
    await istemci.query(
      `INSERT INTO stok_hareketleri (stok_id,miktar,tip,aciklama,yapan_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [stokId, delta, String(tip || "duzeltme").slice(0, 40), String(aciklama || "").slice(0, 500), yapanId]
    );
    await istemci.query("COMMIT");
  } catch (e) {
    await istemci.query("ROLLBACK");
    throw e;
  } finally {
    istemci.release();
  }
}

export async function receteKaydet(urunId, kalemler) {
  const istemci = await pool.connect();
  try {
    await istemci.query("BEGIN");
    await istemci.query("DELETE FROM urun_receteleri WHERE urun_id=$1", [urunId]);
    for (const k of Array.isArray(kalemler) ? kalemler : []) {
      if (sayi(k.miktar) > 0) {
        await istemci.query(
          "INSERT INTO urun_receteleri (urun_id,stok_id,miktar) VALUES ($1,$2,$3)",
          [urunId, k.stokId, sayi(k.miktar)]
        );
      }
    }
    await istemci.query("COMMIT");
  } catch (e) {
    await istemci.query("ROLLBACK");
    throw e;
  } finally {
    istemci.release();
  }
}

export async function receteGetir(urunId) {
  const sonuc = await pool.query(
    `SELECT r.stok_id AS "stokId", r.miktar, s.ad, s.birim
     FROM urun_receteleri r JOIN stok_kalemleri s ON s.id=r.stok_id
     WHERE r.urun_id=$1 ORDER BY s.ad`, [urunId]
  );
  return sonuc.rows.map((r) => ({ ...r, miktar: Number(r.miktar) }));
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

export async function dashboardGetir() {
  const [satis, stok, personel, populer] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(fiyat*adet),0) toplam,
      COUNT(DISTINCT COALESCE(siparis_no, id::text)) siparis_sayisi
      FROM siparis_kalemleri WHERE olusturma >= date_trunc('day',NOW())`),
    pool.query("SELECT COUNT(*) FILTER (WHERE mevcut<=kritik_seviye) kritik, COALESCE(SUM(mevcut*birim_maliyet),0) deger FROM stok_kalemleri WHERE aktif=true"),
    pool.query("SELECT COUNT(*) FILTER (WHERE aktif) toplam, (SELECT COUNT(*) FROM vardiyalar WHERE cikis IS NULL) vardiyada FROM personeller"),
    pool.query(`SELECT urun_ad, SUM(adet)::int adet, SUM(fiyat*adet) ciro
      FROM siparis_kalemleri WHERE olusturma >= NOW()-INTERVAL '30 days'
      GROUP BY urun_ad ORDER BY adet DESC LIMIT 5`),
  ]);
  return {
    bugunCiro: Number(satis.rows[0].toplam),
    bugunSiparis: Number(satis.rows[0].siparis_sayisi),
    kritikStok: Number(stok.rows[0].kritik),
    stokDegeri: Number(stok.rows[0].deger),
    personel: Number(personel.rows[0].toplam),
    vardiyada: Number(personel.rows[0].vardiyada),
    populer: populer.rows.map((p) => ({ ...p, adet: Number(p.adet), ciro: Number(p.ciro) })),
  };
}

export async function satisRaporuGetir(gun = 30) {
  const aralik = Math.min(365, Math.max(1, sayi(gun, 30)));
  const [gunluk, urunler] = await Promise.all([
    pool.query(`SELECT date_trunc('day',olusturma)::date gun, SUM(fiyat*adet) ciro, SUM(adet) adet
      FROM siparis_kalemleri WHERE olusturma >= NOW()-($1::text || ' days')::interval
      GROUP BY 1 ORDER BY 1`, [aralik]),
    pool.query(`SELECT urun_ad, SUM(adet) adet, SUM(fiyat*adet) ciro
      FROM siparis_kalemleri WHERE olusturma >= NOW()-($1::text || ' days')::interval
      GROUP BY urun_ad ORDER BY ciro DESC`, [aralik]),
  ]);
  return {
    gunluk: gunluk.rows.map((g) => ({ ...g, ciro: Number(g.ciro), adet: Number(g.adet) })),
    urunler: urunler.rows.map((u) => ({ ...u, ciro: Number(u.ciro), adet: Number(u.adet) })),
  };
}
