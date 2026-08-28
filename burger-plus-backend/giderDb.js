const GIDER_DURUMLARI = new Set(["onay_bekliyor", "onaylandi", "reddedildi", "iptal"]);
const ODEME_YONTEMLERI = new Set(["nakit", "banka", "kredi_karti", "vadeli", "isletme_sahibi"]);
const TEKRAR_PERIYOTLARI = new Set(["haftalik", "aylik", "yillik"]);
const VARSAYILAN_KATEGORILER = [
  "Hammadde ve stok", "Personel maaşları", "Kira", "Elektrik, su ve doğalgaz",
  "Paketleme", "Komisyonlar", "Kurye ve nakliye", "Bakım ve onarım",
  "Reklam ve pazarlama", "Vergi ve muhasebe", "Temizlik", "Diğer",
];

function tenantId(isletmeId) {
  const id = Number(isletmeId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("İşletme bilgisi geçersiz.");
  return id;
}

function pozitifPara(deger, alan = "Tutar") {
  const ham = String(deger ?? "").trim();
  const sayi = Number(ham.includes(",") ? ham.replace(/\./g, "").replace(",", ".") : ham);
  if (!Number.isFinite(sayi) || sayi <= 0 || sayi > 1_000_000_000) throw new Error(`${alan} geçersiz.`);
  return Number(sayi.toFixed(2));
}

function negatifOlmayanPara(deger, alan = "Tutar") {
  const ham = String(deger ?? "").trim();
  const sayi = Number(ham.includes(",") ? ham.replace(/\./g, "").replace(",", ".") : ham);
  if (!Number.isFinite(sayi) || sayi < 0 || sayi > 1_000_000_000) throw new Error(`${alan} geçersiz.`);
  return Number(sayi.toFixed(2));
}

function metin(deger, uzunluk, zorunlu = false, alan = "Alan") {
  const temiz = String(deger || "").trim().slice(0, uzunluk);
  if (zorunlu && !temiz) throw new Error(`${alan} zorunludur.`);
  return temiz;
}

function tarih(deger, alan = "Tarih") {
  const temiz = String(deger || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(temiz) || Number.isNaN(Date.parse(`${temiz}T00:00:00Z`))) throw new Error(`${alan} geçersiz.`);
  return temiz;
}

function idVeyaNull(deger) {
  if (deger == null || deger === "") return null;
  const id = Number(deger);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Kayıt seçimi geçersiz.");
  return id;
}

function gideriMaple(satir) {
  if (!satir) return null;
  return {
    id: Number(satir.id), kategoriId: Number(satir.kategori_id), kategoriAdi: satir.kategori_adi,
    tedarikciId: satir.tedarikci_id == null ? null : Number(satir.tedarikci_id), tedarikciAdi: satir.tedarikci_adi || "",
    baslik: satir.baslik, aciklama: satir.aciklama || "", tutar: Number(satir.tutar), kdvOrani: Number(satir.kdv_orani),
    kdvTutari: Number(satir.kdv_tutari), odemeYontemi: satir.odeme_yontemi, giderTarihi: satir.gider_tarihi,
    odemeTarihi: satir.odeme_tarihi, belgeUrl: satir.belge_url || "", durum: satir.durum,
    redNedeni: satir.red_nedeni || "", olusturanAdi: satir.olusturan_adi || "Sistem",
    onaylayanAdi: satir.onaylayan_adi || "", olusturma: satir.olusturma, guncelleme: satir.guncelleme,
    duzenliGiderId: satir.duzenli_gider_id == null ? null : Number(satir.duzenli_gider_id),
  };
}

export function giderVerisiniDogrula(veri = {}) {
  const tutar = pozitifPara(veri.tutar);
  const kdvOrani = Number(String(veri.kdvOrani ?? 0).replace(",", "."));
  if (!Number.isFinite(kdvOrani) || kdvOrani < 0 || kdvOrani > 100) throw new Error("KDV oranı 0–100 arasında olmalıdır.");
  const odemeYontemi = String(veri.odemeYontemi || "nakit").trim();
  if (!ODEME_YONTEMLERI.has(odemeYontemi)) throw new Error("Ödeme yöntemi geçersiz.");
  const tedarikciId = idVeyaNull(veri.tedarikciId);
  if (odemeYontemi === "vadeli" && !tedarikciId) throw new Error("Vadeli gider için tedarikçi seçilmelidir.");
  return {
    id: idVeyaNull(veri.id), kategoriId: idVeyaNull(veri.kategoriId), tedarikciId,
    baslik: metin(veri.baslik, 140, true, "Gider başlığı"), aciklama: metin(veri.aciklama, 1500),
    tutar, kdvOrani: Number(kdvOrani.toFixed(2)), kdvTutari: Number((tutar * kdvOrani / (100 + kdvOrani || 1)).toFixed(2)),
    odemeYontemi, giderTarihi: tarih(veri.giderTarihi || new Date().toISOString().slice(0, 10), "Gider tarihi"),
    odemeTarihi: veri.odemeTarihi ? tarih(veri.odemeTarihi, "Ödeme tarihi") : null,
    belgeUrl: metin(veri.belgeUrl, 1000),
  };
}

export async function giderTablolariniHazirla(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gider_kategorileri (
      id BIGSERIAL PRIMARY KEY, isletme_id BIGINT NOT NULL, ad TEXT NOT NULL,
      renk TEXT NOT NULL DEFAULT '#ff6b00', aktif BOOLEAN NOT NULL DEFAULT TRUE,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (isletme_id, ad)
    );
    CREATE TABLE IF NOT EXISTS tedarikciler (
      id BIGSERIAL PRIMARY KEY, isletme_id BIGINT NOT NULL, ad TEXT NOT NULL,
      yetkili TEXT NOT NULL DEFAULT '', telefon TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
      vergi_no TEXT NOT NULL DEFAULT '', notlar TEXT NOT NULL DEFAULT '', aktif BOOLEAN NOT NULL DEFAULT TRUE,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(), guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS duzenli_giderler (
      id BIGSERIAL PRIMARY KEY, isletme_id BIGINT NOT NULL, kategori_id BIGINT NOT NULL,
      tedarikci_id BIGINT, baslik TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', tutar NUMERIC(14,2) NOT NULL,
      kdv_orani NUMERIC(5,2) NOT NULL DEFAULT 0, odeme_yontemi TEXT NOT NULL,
      periyot TEXT NOT NULL, sonraki_tarih DATE NOT NULL, bitis_tarihi DATE, aktif BOOLEAN NOT NULL DEFAULT TRUE,
      olusturan_id BIGINT, olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(), guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (odeme_yontemi IN ('nakit','banka','kredi_karti','vadeli','isletme_sahibi')),
      CHECK (periyot IN ('haftalik','aylik','yillik'))
    );
    CREATE TABLE IF NOT EXISTS giderler (
      id BIGSERIAL PRIMARY KEY, isletme_id BIGINT NOT NULL, kategori_id BIGINT NOT NULL, tedarikci_id BIGINT,
      duzenli_gider_id BIGINT, donem_anahtari DATE, baslik TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '',
      tutar NUMERIC(14,2) NOT NULL, kdv_orani NUMERIC(5,2) NOT NULL DEFAULT 0, kdv_tutari NUMERIC(14,2) NOT NULL DEFAULT 0,
      odeme_yontemi TEXT NOT NULL, gider_tarihi DATE NOT NULL, odeme_tarihi DATE, belge_url TEXT NOT NULL DEFAULT '',
      durum TEXT NOT NULL DEFAULT 'onay_bekliyor', red_nedeni TEXT NOT NULL DEFAULT '',
      olusturan_id BIGINT, onaylayan_id BIGINT, onay_tarihi TIMESTAMPTZ, iptal_tarihi TIMESTAMPTZ,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(), guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (durum IN ('onay_bekliyor','onaylandi','reddedildi','iptal')),
      CHECK (odeme_yontemi IN ('nakit','banka','kredi_karti','vadeli','isletme_sahibi'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS giderler_duzenli_donem_unique ON giderler (isletme_id, duzenli_gider_id, donem_anahtari) WHERE duzenli_gider_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS giderler_isletme_tarih_idx ON giderler (isletme_id, gider_tarihi DESC);
    CREATE INDEX IF NOT EXISTS giderler_isletme_durum_idx ON giderler (isletme_id, durum, olusturma DESC);
    CREATE TABLE IF NOT EXISTS tedarikci_hareketleri (
      id BIGSERIAL PRIMARY KEY, isletme_id BIGINT NOT NULL, tedarikci_id BIGINT NOT NULL, gider_id BIGINT,
      tur TEXT NOT NULL, tutar NUMERIC(14,2) NOT NULL, odeme_yontemi TEXT, aciklama TEXT NOT NULL DEFAULT '',
      yapan_id BIGINT, olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (tur IN ('borc','odeme','iptal'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tedarikci_hareketleri_gider_unique ON tedarikci_hareketleri (isletme_id, gider_id) WHERE gider_id IS NOT NULL AND tur='borc';
    CREATE INDEX IF NOT EXISTS tedarikci_hareketleri_tedarikci_idx ON tedarikci_hareketleri (isletme_id, tedarikci_id, olusturma DESC);
    CREATE TABLE IF NOT EXISTS kasa_hareketleri (
      id BIGSERIAL PRIMARY KEY, isletme_id BIGINT NOT NULL, gider_id BIGINT, tedarikci_hareket_id BIGINT,
      tur TEXT NOT NULL, tutar NUMERIC(14,2) NOT NULL, aciklama TEXT NOT NULL DEFAULT '', yapan_id BIGINT,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (tur IN ('gider','gider_iptal','tedarikci_odeme'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS kasa_hareketleri_gider_tur_unique ON kasa_hareketleri (isletme_id, gider_id, tur) WHERE gider_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS gider_butceleri (
      id BIGSERIAL PRIMARY KEY, isletme_id BIGINT NOT NULL, kategori_id BIGINT NOT NULL,
      donem DATE NOT NULL, tutar NUMERIC(14,2) NOT NULL CHECK (tutar >= 0),
      olusturan_id BIGINT, olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(), guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (isletme_id, kategori_id, donem)
    );
    CREATE INDEX IF NOT EXISTS gider_butceleri_isletme_donem_idx ON gider_butceleri (isletme_id, donem);
  `);
}

async function varsayilanKategorileriHazirla(isletmeId, pool) {
  const id = tenantId(isletmeId);
  for (const [sira, ad] of VARSAYILAN_KATEGORILER.entries()) {
    const renkler = ["#ff6b00", "#8b5cf6", "#f59e0b", "#3b82f6", "#14b8a6", "#ec4899"];
    await pool.query("INSERT INTO gider_kategorileri (isletme_id,ad,renk) VALUES ($1,$2,$3) ON CONFLICT (isletme_id,ad) DO NOTHING", [id, ad, renkler[sira % renkler.length]]);
  }
}

export async function giderKategorileriniGetir(isletmeId, pool, tumu = false) {
  const id = tenantId(isletmeId);
  await varsayilanKategorileriHazirla(id, pool);
  const { rows } = await pool.query(`SELECT id,ad,renk,aktif FROM gider_kategorileri WHERE isletme_id=$1 ${tumu ? "" : "AND aktif=TRUE"} ORDER BY aktif DESC,ad`, [id]);
  return rows.map((r) => ({ id: Number(r.id), ad: r.ad, renk: r.renk, aktif: r.aktif }));
}

export async function giderKategorisiKaydet(isletmeId, pool, veri = {}) {
  const id = tenantId(isletmeId); const kategoriId = idVeyaNull(veri.id);
  const ad = metin(veri.ad, 80, true, "Kategori adı");
  const renk = /^#[0-9a-f]{6}$/i.test(String(veri.renk || "")) ? String(veri.renk) : "#ff6b00";
  const sonuc = kategoriId
    ? await pool.query("UPDATE gider_kategorileri SET ad=$3,renk=$4,aktif=$5 WHERE isletme_id=$1 AND id=$2 RETURNING *", [id, kategoriId, ad, renk, veri.aktif !== false])
    : await pool.query("INSERT INTO gider_kategorileri (isletme_id,ad,renk) VALUES ($1,$2,$3) RETURNING *", [id, ad, renk]);
  if (!sonuc.rows[0]) throw new Error("Gider kategorisi bulunamadı.");
  return { ...sonuc.rows[0], id: Number(sonuc.rows[0].id) };
}

export async function giderKategorisiArsivle(isletmeId, pool, kategoriId) {
  const sonuc = await pool.query("UPDATE gider_kategorileri SET aktif=FALSE WHERE isletme_id=$1 AND id=$2 RETURNING id", [tenantId(isletmeId), idVeyaNull(kategoriId)]);
  if (!sonuc.rowCount) throw new Error("Gider kategorisi bulunamadı.");
}

export async function tedarikcileriGetir(isletmeId, pool, tumu = false) {
  const id = tenantId(isletmeId);
  const { rows } = await pool.query(`
    SELECT t.*,COALESCE(SUM(CASE WHEN h.tur='borc' THEN h.tutar ELSE -h.tutar END),0) bakiye
    FROM tedarikciler t LEFT JOIN tedarikci_hareketleri h ON h.isletme_id=t.isletme_id AND h.tedarikci_id=t.id
    WHERE t.isletme_id=$1 ${tumu ? "" : "AND t.aktif=TRUE"} GROUP BY t.id ORDER BY t.aktif DESC,t.ad`, [id]);
  return rows.map((r) => ({ id: Number(r.id), ad: r.ad, yetkili: r.yetkili, telefon: r.telefon, email: r.email, vergiNo: r.vergi_no, notlar: r.notlar, aktif: r.aktif, bakiye: Number(r.bakiye) }));
}

export async function tedarikciKaydet(isletmeId, pool, veri = {}) {
  const id = tenantId(isletmeId); const tedarikciId = idVeyaNull(veri.id);
  const alanlar = [metin(veri.ad, 140, true, "Tedarikçi adı"), metin(veri.yetkili, 120), metin(veri.telefon, 30), metin(veri.email, 254), metin(veri.vergiNo, 30), metin(veri.notlar, 1000)];
  const sonuc = tedarikciId
    ? await pool.query("UPDATE tedarikciler SET ad=$3,yetkili=$4,telefon=$5,email=$6,vergi_no=$7,notlar=$8,aktif=$9,guncelleme=NOW() WHERE isletme_id=$1 AND id=$2 RETURNING *", [id, tedarikciId, ...alanlar, veri.aktif !== false])
    : await pool.query("INSERT INTO tedarikciler (isletme_id,ad,yetkili,telefon,email,vergi_no,notlar) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [id, ...alanlar]);
  if (!sonuc.rows[0]) throw new Error("Tedarikçi bulunamadı.");
  return { ...sonuc.rows[0], id: Number(sonuc.rows[0].id) };
}

export async function tedarikciArsivle(isletmeId, pool, tedarikciId) {
  const sonuc = await pool.query("UPDATE tedarikciler SET aktif=FALSE,guncelleme=NOW() WHERE isletme_id=$1 AND id=$2 RETURNING id", [tenantId(isletmeId), idVeyaNull(tedarikciId)]);
  if (!sonuc.rowCount) throw new Error("Tedarikçi bulunamadı.");
}

const GIDER_SELECT = `SELECT g.*,k.ad kategori_adi,t.ad tedarikci_adi,
  CONCAT_WS(' ',o.ad,o.soyad) olusturan_adi,CONCAT_WS(' ',n.ad,n.soyad) onaylayan_adi
  FROM giderler g JOIN gider_kategorileri k ON k.isletme_id=g.isletme_id AND k.id=g.kategori_id
  LEFT JOIN tedarikciler t ON t.isletme_id=g.isletme_id AND t.id=g.tedarikci_id
  LEFT JOIN kullanicilar o ON o.isletme_id=g.isletme_id AND o.id=g.olusturan_id
  LEFT JOIN kullanicilar n ON n.isletme_id=g.isletme_id AND n.id=g.onaylayan_id`;

export async function giderleriGetir(isletmeId, pool, filtre = {}) {
  const id = tenantId(isletmeId); const kosullar = ["g.isletme_id=$1"]; const degerler = [id];
  const ekle = (sql, deger) => { degerler.push(deger); kosullar.push(sql.replace("?", `$${degerler.length}`)); };
  if (GIDER_DURUMLARI.has(String(filtre.durum))) ekle("g.durum=?", String(filtre.durum));
  if (filtre.kategoriId) ekle("g.kategori_id=?", idVeyaNull(filtre.kategoriId));
  if (filtre.tedarikciId) ekle("g.tedarikci_id=?", idVeyaNull(filtre.tedarikciId));
  if (filtre.baslangic) ekle("g.gider_tarihi>=?", tarih(filtre.baslangic));
  if (filtre.bitis) ekle("g.gider_tarihi<=?", tarih(filtre.bitis));
  if (filtre.arama) {
    degerler.push(`%${metin(filtre.arama, 100)}%`);
    kosullar.push(`(g.baslik ILIKE $${degerler.length} OR g.aciklama ILIKE $${degerler.length})`);
  }
  const { rows } = await pool.query(`${GIDER_SELECT} WHERE ${kosullar.join(" AND ")} ORDER BY g.gider_tarihi DESC,g.id DESC LIMIT 500`, degerler);
  return rows.map(gideriMaple);
}

export async function giderKaydet(isletmeId, pool, kullaniciId, veri = {}) {
  const id = tenantId(isletmeId); await varsayilanKategorileriHazirla(id, pool);
  const gider = giderVerisiniDogrula(veri);
  if (!gider.kategoriId) throw new Error("Gider kategorisi seçilmelidir.");
  const dogrulama = await pool.query("SELECT 1 FROM gider_kategorileri WHERE isletme_id=$1 AND id=$2 AND aktif=TRUE", [id, gider.kategoriId]);
  if (!dogrulama.rowCount) throw new Error("Gider kategorisi bu işletmeye ait değil.");
  if (gider.tedarikciId) {
    const tedarikci = await pool.query("SELECT 1 FROM tedarikciler WHERE isletme_id=$1 AND id=$2 AND aktif=TRUE", [id, gider.tedarikciId]);
    if (!tedarikci.rowCount) throw new Error("Tedarikçi bu işletmeye ait değil.");
  }
  const yapan = idVeyaNull(kullaniciId);
  let sonuc;
  if (gider.id) {
    sonuc = await pool.query(`UPDATE giderler SET kategori_id=$3,tedarikci_id=$4,baslik=$5,aciklama=$6,tutar=$7,kdv_orani=$8,kdv_tutari=$9,odeme_yontemi=$10,gider_tarihi=$11,odeme_tarihi=$12,belge_url=$13,durum='onay_bekliyor',red_nedeni='',guncelleme=NOW() WHERE isletme_id=$1 AND id=$2 AND durum IN ('onay_bekliyor','reddedildi') RETURNING id`, [id, gider.id, gider.kategoriId, gider.tedarikciId, gider.baslik, gider.aciklama, gider.tutar, gider.kdvOrani, gider.kdvTutari, gider.odemeYontemi, gider.giderTarihi, gider.odemeTarihi, gider.belgeUrl]);
  } else {
    sonuc = await pool.query(`INSERT INTO giderler (isletme_id,kategori_id,tedarikci_id,baslik,aciklama,tutar,kdv_orani,kdv_tutari,odeme_yontemi,gider_tarihi,odeme_tarihi,belge_url,olusturan_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [id, gider.kategoriId, gider.tedarikciId, gider.baslik, gider.aciklama, gider.tutar, gider.kdvOrani, gider.kdvTutari, gider.odemeYontemi, gider.giderTarihi, gider.odemeTarihi, gider.belgeUrl, yapan]);
  }
  if (!sonuc.rows[0]) throw new Error("Onaylanmış gider düzenlenemez.");
  const { rows } = await pool.query(`${GIDER_SELECT} WHERE g.isletme_id=$1 AND g.id=$2`, [id, sonuc.rows[0].id]);
  return gideriMaple(rows[0]);
}

export async function giderDurumuGuncelle(isletmeId, pool, kullaniciId, giderId, durum, neden = "") {
  const id = tenantId(isletmeId); const hedef = String(durum || "");
  if (!new Set(["onaylandi", "reddedildi", "iptal"]).has(hedef)) throw new Error("Gider durumu geçersiz.");
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const mevcut = await baglanti.query("SELECT * FROM giderler WHERE isletme_id=$1 AND id=$2 FOR UPDATE", [id, idVeyaNull(giderId)]);
    const gider = mevcut.rows[0]; if (!gider) throw new Error("Gider bulunamadı.");
    if (hedef === "onaylandi") {
      if (!new Set(["onay_bekliyor", "reddedildi"]).has(gider.durum)) throw new Error("Bu gider onaylanamaz.");
      await baglanti.query("UPDATE giderler SET durum='onaylandi',onaylayan_id=$3,onay_tarihi=NOW(),odeme_tarihi=COALESCE(odeme_tarihi,CURRENT_DATE),red_nedeni='',guncelleme=NOW() WHERE isletme_id=$1 AND id=$2", [id, gider.id, idVeyaNull(kullaniciId)]);
      if (gider.odeme_yontemi === "nakit") await baglanti.query("INSERT INTO kasa_hareketleri (isletme_id,gider_id,tur,tutar,aciklama,yapan_id) VALUES ($1,$2,'gider',$3,$4,$5) ON CONFLICT DO NOTHING", [id, gider.id, -Number(gider.tutar), gider.baslik, idVeyaNull(kullaniciId)]);
      if (gider.odeme_yontemi === "vadeli") await baglanti.query("INSERT INTO tedarikci_hareketleri (isletme_id,tedarikci_id,gider_id,tur,tutar,aciklama,yapan_id) VALUES ($1,$2,$3,'borc',$4,$5,$6) ON CONFLICT DO NOTHING", [id, gider.tedarikci_id, gider.id, gider.tutar, gider.baslik, idVeyaNull(kullaniciId)]);
    } else if (hedef === "reddedildi") {
      if (gider.durum !== "onay_bekliyor") throw new Error("Yalnızca bekleyen gider reddedilebilir.");
      await baglanti.query("UPDATE giderler SET durum='reddedildi',red_nedeni=$3,onaylayan_id=$4,onay_tarihi=NOW(),guncelleme=NOW() WHERE isletme_id=$1 AND id=$2", [id, gider.id, metin(neden, 500, true, "Red nedeni"), idVeyaNull(kullaniciId)]);
    } else {
      if (gider.durum !== "onaylandi") throw new Error("Yalnızca onaylı gider iptal edilebilir.");
      await baglanti.query("UPDATE giderler SET durum='iptal',iptal_tarihi=NOW(),guncelleme=NOW() WHERE isletme_id=$1 AND id=$2", [id, gider.id]);
      if (gider.odeme_yontemi === "nakit") await baglanti.query("INSERT INTO kasa_hareketleri (isletme_id,gider_id,tur,tutar,aciklama,yapan_id) VALUES ($1,$2,'gider_iptal',$3,$4,$5) ON CONFLICT DO NOTHING", [id, gider.id, Number(gider.tutar), `${gider.baslik} iptali`, idVeyaNull(kullaniciId)]);
      if (gider.odeme_yontemi === "vadeli") await baglanti.query("INSERT INTO tedarikci_hareketleri (isletme_id,tedarikci_id,gider_id,tur,tutar,aciklama,yapan_id) VALUES ($1,$2,$3,'iptal',$4,$5,$6)", [id, gider.tedarikci_id, gider.id, gider.tutar, `${gider.baslik} iptali`, idVeyaNull(kullaniciId)]);
    }
    await baglanti.query("COMMIT");
  } catch (hata) { await baglanti.query("ROLLBACK"); throw hata; } finally { baglanti.release(); }
  const { rows } = await pool.query(`${GIDER_SELECT} WHERE g.isletme_id=$1 AND g.id=$2`, [id, giderId]);
  return gideriMaple(rows[0]);
}

export async function tedarikciOdemesiKaydet(isletmeId, pool, kullaniciId, tedarikciId, veri = {}) {
  const id = tenantId(isletmeId); const tid = idVeyaNull(tedarikciId); const tutar = pozitifPara(veri.tutar);
  const odemeYontemi = String(veri.odemeYontemi || "banka");
  if (!new Set(["nakit", "banka", "kredi_karti", "isletme_sahibi"]).has(odemeYontemi)) throw new Error("Tedarikçi ödeme yöntemi geçersiz.");
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const tedarikci = await baglanti.query("SELECT id,ad FROM tedarikciler WHERE isletme_id=$1 AND id=$2 AND aktif=TRUE", [id, tid]);
    if (!tedarikci.rowCount) throw new Error("Tedarikçi bulunamadı.");
    const bakiyeSonucu = await baglanti.query("SELECT COALESCE(SUM(CASE WHEN tur='borc' THEN tutar ELSE -tutar END),0) bakiye FROM tedarikci_hareketleri WHERE isletme_id=$1 AND tedarikci_id=$2", [id, tid]);
    const bakiye = Number(bakiyeSonucu.rows[0].bakiye);
    if (tutar > bakiye) throw new Error(`Ödeme açık tedarikçi bakiyesini aşamaz (${bakiye.toFixed(2)} TL).`);
    const hareket = await baglanti.query("INSERT INTO tedarikci_hareketleri (isletme_id,tedarikci_id,tur,tutar,odeme_yontemi,aciklama,yapan_id) VALUES ($1,$2,'odeme',$3,$4,$5,$6) RETURNING id", [id, tid, tutar, odemeYontemi, metin(veri.aciklama, 500) || "Tedarikçi ödemesi", idVeyaNull(kullaniciId)]);
    if (odemeYontemi === "nakit") await baglanti.query("INSERT INTO kasa_hareketleri (isletme_id,tedarikci_hareket_id,tur,tutar,aciklama,yapan_id) VALUES ($1,$2,'tedarikci_odeme',$3,$4,$5)", [id, hareket.rows[0].id, -tutar, `${tedarikci.rows[0].ad} ödemesi`, idVeyaNull(kullaniciId)]);
    await baglanti.query("COMMIT"); return { id: Number(hareket.rows[0].id), tutar, odemeYontemi };
  } catch (hata) { await baglanti.query("ROLLBACK"); throw hata; } finally { baglanti.release(); }
}

function duzenliVerisiniDogrula(veri = {}) {
  const temel = giderVerisiniDogrula(veri);
  const periyot = String(veri.periyot || "aylik");
  if (!TEKRAR_PERIYOTLARI.has(periyot)) throw new Error("Tekrarlama periyodu geçersiz.");
  return { ...temel, periyot, sonrakiTarih: tarih(veri.sonrakiTarih || temel.giderTarihi, "Sonraki tarih"), bitisTarihi: veri.bitisTarihi ? tarih(veri.bitisTarihi, "Bitiş tarihi") : null, aktif: veri.aktif !== false };
}

export async function duzenliGiderKaydet(isletmeId, pool, kullaniciId, veri = {}) {
  const id = tenantId(isletmeId); const d = duzenliVerisiniDogrula(veri);
  if (!d.kategoriId) throw new Error("Gider kategorisi seçilmelidir.");
  const sonuc = d.id
    ? await pool.query("UPDATE duzenli_giderler SET kategori_id=$3,tedarikci_id=$4,baslik=$5,aciklama=$6,tutar=$7,kdv_orani=$8,odeme_yontemi=$9,periyot=$10,sonraki_tarih=$11,bitis_tarihi=$12,aktif=$13,guncelleme=NOW() WHERE isletme_id=$1 AND id=$2 RETURNING id", [id, d.id, d.kategoriId, d.tedarikciId, d.baslik, d.aciklama, d.tutar, d.kdvOrani, d.odemeYontemi, d.periyot, d.sonrakiTarih, d.bitisTarihi, d.aktif])
    : await pool.query("INSERT INTO duzenli_giderler (isletme_id,kategori_id,tedarikci_id,baslik,aciklama,tutar,kdv_orani,odeme_yontemi,periyot,sonraki_tarih,bitis_tarihi,olusturan_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id", [id, d.kategoriId, d.tedarikciId, d.baslik, d.aciklama, d.tutar, d.kdvOrani, d.odemeYontemi, d.periyot, d.sonrakiTarih, d.bitisTarihi, idVeyaNull(kullaniciId)]);
  if (!sonuc.rowCount) throw new Error("Düzenli gider bulunamadı.");
  return Number(sonuc.rows[0].id);
}

export async function duzenliGiderArsivle(isletmeId, pool, giderId) {
  const sonuc = await pool.query("UPDATE duzenli_giderler SET aktif=FALSE,guncelleme=NOW() WHERE isletme_id=$1 AND id=$2 RETURNING id", [tenantId(isletmeId), idVeyaNull(giderId)]);
  if (!sonuc.rowCount) throw new Error("Düzenli gider bulunamadı.");
}

export async function vadesiGelenDuzenliGiderleriOlustur(isletmeId, pool) {
  const id = tenantId(isletmeId);
  let olusturulan = 0;
  // Uzun süre açılmayan işletmelerde kaçırılan dönemleri de üretir; güvenlik
  // sınırı tek istekte en fazla 36 dönemdir. Satır kilidi eşzamanlı isteklerin
  // aynı planı iki kez ilerletmesini engeller, unique indeks de ikinci emniyettir.
  for (let tur = 0; tur < 36; tur += 1) {
    const adaylar = await pool.query("SELECT id FROM duzenli_giderler WHERE isletme_id=$1 AND aktif=TRUE AND sonraki_tarih<=CURRENT_DATE AND (bitis_tarihi IS NULL OR sonraki_tarih<=bitis_tarihi) ORDER BY sonraki_tarih LIMIT 100", [id]);
    if (!adaylar.rowCount) break;
    for (const aday of adaylar.rows) {
      const baglanti = await pool.connect();
      try {
        await baglanti.query("BEGIN");
        const kilitli = await baglanti.query("SELECT * FROM duzenli_giderler WHERE isletme_id=$1 AND id=$2 AND aktif=TRUE AND sonraki_tarih<=CURRENT_DATE AND (bitis_tarihi IS NULL OR sonraki_tarih<=bitis_tarihi) FOR UPDATE", [id, aday.id]);
        const d = kilitli.rows[0];
        if (!d) { await baglanti.query("ROLLBACK"); continue; }
        const kdv = Number((Number(d.tutar) * Number(d.kdv_orani) / (100 + Number(d.kdv_orani) || 1)).toFixed(2));
        const eklenen = await baglanti.query(`INSERT INTO giderler (isletme_id,kategori_id,tedarikci_id,duzenli_gider_id,donem_anahtari,baslik,aciklama,tutar,kdv_orani,kdv_tutari,odeme_yontemi,gider_tarihi,olusturan_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$5,$12) ON CONFLICT DO NOTHING RETURNING id`, [id, d.kategori_id, d.tedarikci_id, d.id, d.sonraki_tarih, d.baslik, d.aciklama, d.tutar, d.kdv_orani, kdv, d.odeme_yontemi, d.olusturan_id]);
        await baglanti.query(`UPDATE duzenli_giderler SET sonraki_tarih=CASE periyot WHEN 'haftalik' THEN sonraki_tarih+INTERVAL '7 days' WHEN 'aylik' THEN sonraki_tarih+INTERVAL '1 month' ELSE sonraki_tarih+INTERVAL '1 year' END,guncelleme=NOW() WHERE isletme_id=$1 AND id=$2`, [id, d.id]);
        await baglanti.query("COMMIT");
        olusturulan += eklenen.rowCount;
      } catch (hata) { await baglanti.query("ROLLBACK"); throw hata; } finally { baglanti.release(); }
    }
  }
  return olusturulan;
}

export async function duzenliGiderleriGetir(isletmeId, pool) {
  const id = tenantId(isletmeId); await vadesiGelenDuzenliGiderleriOlustur(id, pool);
  const { rows } = await pool.query(`SELECT d.*,k.ad kategori_adi,t.ad tedarikci_adi FROM duzenli_giderler d JOIN gider_kategorileri k ON k.isletme_id=d.isletme_id AND k.id=d.kategori_id LEFT JOIN tedarikciler t ON t.isletme_id=d.isletme_id AND t.id=d.tedarikci_id WHERE d.isletme_id=$1 ORDER BY d.aktif DESC,d.sonraki_tarih`, [id]);
  return rows.map((d) => ({ id: Number(d.id), kategoriId: Number(d.kategori_id), kategoriAdi: d.kategori_adi, tedarikciId: d.tedarikci_id == null ? null : Number(d.tedarikci_id), tedarikciAdi: d.tedarikci_adi || "", baslik: d.baslik, aciklama: d.aciklama, tutar: Number(d.tutar), kdvOrani: Number(d.kdv_orani), odemeYontemi: d.odeme_yontemi, periyot: d.periyot, sonrakiTarih: d.sonraki_tarih, bitisTarihi: d.bitis_tarihi, aktif: d.aktif }));
}

export async function finansOzetiniGetir(isletmeId, pool) {
  const id = tenantId(isletmeId);
  const [ozet, dagilim, kasa] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(tutar) FILTER (WHERE durum='onaylandi' AND date_trunc('month',gider_tarihi)=date_trunc('month',CURRENT_DATE)),0) ay_gideri,COALESCE(SUM(tutar) FILTER (WHERE durum='onay_bekliyor'),0) bekleyen_tutar,COUNT(*) FILTER (WHERE durum='onay_bekliyor') bekleyen_adet,COALESCE(SUM(tutar) FILTER (WHERE durum='onaylandi' AND gider_tarihi=CURRENT_DATE),0) bugun_gideri FROM giderler WHERE isletme_id=$1`, [id]),
    pool.query(`SELECT k.ad,COALESCE(SUM(g.tutar),0) tutar FROM gider_kategorileri k LEFT JOIN giderler g ON g.isletme_id=k.isletme_id AND g.kategori_id=k.id AND g.durum='onaylandi' AND date_trunc('month',g.gider_tarihi)=date_trunc('month',CURRENT_DATE) WHERE k.isletme_id=$1 GROUP BY k.id ORDER BY tutar DESC LIMIT 6`, [id]),
    pool.query("SELECT COALESCE(SUM(tutar),0) bakiye FROM kasa_hareketleri WHERE isletme_id=$1", [id]),
  ]);
  const o = ozet.rows[0];
  return { ayGideri: Number(o.ay_gideri), bugunGideri: Number(o.bugun_gideri), bekleyenTutar: Number(o.bekleyen_tutar), bekleyenAdet: Number(o.bekleyen_adet), kasaGiderHareketi: Number(kasa.rows[0].bakiye), kategoriDagilimi: dagilim.rows.map((d) => ({ ad: d.ad, tutar: Number(d.tutar) })) };
}

export async function finansMerkeziniGetir(isletmeId, pool, filtre = {}) {
  const id = tenantId(isletmeId);
  await varsayilanKategorileriHazirla(id, pool);
  const [kategoriler, tedarikciler, giderler, duzenliGiderler, ozet] = await Promise.all([
    giderKategorileriniGetir(id, pool, true), tedarikcileriGetir(id, pool, true), giderleriGetir(id, pool, filtre), duzenliGiderleriGetir(id, pool), finansOzetiniGetir(id, pool),
  ]);
  return { kategoriler, tedarikciler, giderler, duzenliGiderler, ozet };
}

function raporTarihleriniDogrula(filtre = {}) {
  const simdi = new Date();
  const varsayilanBitis = simdi.toISOString().slice(0, 10);
  const varsayilanBaslangic = `${varsayilanBitis.slice(0, 7)}-01`;
  const baslangic = tarih(filtre.baslangic || varsayilanBaslangic, "Başlangıç tarihi");
  const bitis = tarih(filtre.bitis || varsayilanBitis, "Bitiş tarihi");
  const gun = Math.round((Date.parse(`${bitis}T00:00:00Z`) - Date.parse(`${baslangic}T00:00:00Z`)) / 86400000);
  if (gun < 0) throw new Error("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
  if (gun > 731) throw new Error("Rapor aralığı en fazla iki yıl olabilir.");
  const hamButceAyi = String(filtre.butceAyi || bitis.slice(0, 7)).slice(0, 7);
  const butceAyi = tarih(`${hamButceAyi}-01`, "Bütçe ayı");
  return { baslangic, bitis, butceAyi };
}

export function butceVerisiniDogrula(veri = {}) {
  const hamDonem = String(veri.donem || "").slice(0, 7);
  const donem = tarih(`${hamDonem}-01`, "Bütçe dönemi");
  if (!Array.isArray(veri.butceler) || veri.butceler.length > 100) throw new Error("Bütçe listesi geçersiz.");
  const benzersiz = new Set();
  const butceler = veri.butceler.map((butce) => {
    const kategoriId = idVeyaNull(butce?.kategoriId);
    if (!kategoriId || benzersiz.has(kategoriId)) throw new Error("Bütçe kategorileri geçersiz veya tekrarlı.");
    benzersiz.add(kategoriId);
    return { kategoriId, tutar: negatifOlmayanPara(butce?.tutar, "Bütçe tutarı") };
  });
  return { donem, butceler };
}

export async function giderButceleriniKaydet(isletmeId, pool, kullaniciId, veri = {}) {
  const id = tenantId(isletmeId);
  const temiz = butceVerisiniDogrula(veri);
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const kategoriIdleri = temiz.butceler.map((b) => b.kategoriId);
    if (kategoriIdleri.length) {
      const kategoriler = await baglanti.query("SELECT id FROM gider_kategorileri WHERE isletme_id=$1 AND id=ANY($2::bigint[])", [id, kategoriIdleri]);
      if (kategoriler.rowCount !== kategoriIdleri.length) throw new Error("Bütçe kategorilerinden biri bu işletmeye ait değil.");
    }
    await baglanti.query("DELETE FROM gider_butceleri WHERE isletme_id=$1 AND donem=$2", [id, temiz.donem]);
    for (const butce of temiz.butceler.filter((b) => b.tutar > 0)) {
      await baglanti.query("INSERT INTO gider_butceleri (isletme_id,kategori_id,donem,tutar,olusturan_id) VALUES ($1,$2,$3,$4,$5)", [id, butce.kategoriId, temiz.donem, butce.tutar, idVeyaNull(kullaniciId)]);
    }
    await baglanti.query("COMMIT");
    return temiz;
  } catch (hata) {
    await baglanti.query("ROLLBACK");
    throw hata;
  } finally { baglanti.release(); }
}

export async function finansRaporunuGetir(isletmeId, pool, filtre = {}) {
  const id = tenantId(isletmeId);
  const { baslangic, bitis, butceAyi } = raporTarihleriniDogrula(filtre);
  const [gelir, gider, gunluk, aylik, kategori, butce, odeme] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(tutar),0) ciro,COUNT(*)::int siparis,COALESCE(AVG(tutar),0) ortalama_sepet
      FROM odeme_islemleri WHERE isletme_id=$1 AND durum='basarili' AND COALESCE(basarili_at,olusturma)::date BETWEEN $2::date AND $3::date`, [id, baslangic, bitis]),
    pool.query(`SELECT COALESCE(SUM(tutar),0) gider,COALESCE(SUM(kdv_tutari),0) kdv,COUNT(*)::int kayit
      FROM giderler WHERE isletme_id=$1 AND durum='onaylandi' AND gider_tarihi BETWEEN $2::date AND $3::date`, [id, baslangic, bitis]),
    pool.query(`WITH gunler AS (SELECT generate_series($2::date,$3::date,'1 day')::date gun),
      gelir AS (SELECT COALESCE(basarili_at,olusturma)::date gun,SUM(tutar) tutar FROM odeme_islemleri WHERE isletme_id=$1 AND durum='basarili' AND COALESCE(basarili_at,olusturma)::date BETWEEN $2::date AND $3::date GROUP BY 1),
      gider AS (SELECT gider_tarihi gun,SUM(tutar) tutar FROM giderler WHERE isletme_id=$1 AND durum='onaylandi' AND gider_tarihi BETWEEN $2::date AND $3::date GROUP BY 1)
      SELECT g.gun,COALESCE(ge.tutar,0) gelir,COALESCE(gi.tutar,0) gider FROM gunler g LEFT JOIN gelir ge USING(gun) LEFT JOIN gider gi USING(gun) ORDER BY g.gun`, [id, baslangic, bitis]),
    pool.query(`WITH aylar AS (SELECT generate_series(date_trunc('month',$2::date)-INTERVAL '5 months',date_trunc('month',$2::date),'1 month')::date ay),
      gelir AS (SELECT date_trunc('month',COALESCE(basarili_at,olusturma))::date ay,SUM(tutar) tutar FROM odeme_islemleri WHERE isletme_id=$1 AND durum='basarili' AND COALESCE(basarili_at,olusturma)>=date_trunc('month',$2::date)-INTERVAL '5 months' AND COALESCE(basarili_at,olusturma)<date_trunc('month',$2::date)+INTERVAL '1 month' GROUP BY 1),
      gider AS (SELECT date_trunc('month',gider_tarihi)::date ay,SUM(tutar) tutar FROM giderler WHERE isletme_id=$1 AND durum='onaylandi' AND gider_tarihi>=date_trunc('month',$2::date)-INTERVAL '5 months' AND gider_tarihi<date_trunc('month',$2::date)+INTERVAL '1 month' GROUP BY 1)
      SELECT a.ay,COALESCE(ge.tutar,0) gelir,COALESCE(gi.tutar,0) gider FROM aylar a LEFT JOIN gelir ge USING(ay) LEFT JOIN gider gi USING(ay) ORDER BY a.ay`, [id, bitis]),
    pool.query(`SELECT k.id,k.ad,k.renk,COALESCE(SUM(g.tutar),0) tutar FROM gider_kategorileri k LEFT JOIN giderler g ON g.isletme_id=k.isletme_id AND g.kategori_id=k.id AND g.durum='onaylandi' AND g.gider_tarihi BETWEEN $2::date AND $3::date WHERE k.isletme_id=$1 GROUP BY k.id ORDER BY tutar DESC,k.ad`, [id, baslangic, bitis]),
    pool.query(`SELECT k.id,k.ad,k.renk,COALESCE(b.tutar,0) butce,COALESCE(SUM(g.tutar),0) gerceklesen
      FROM gider_kategorileri k LEFT JOIN gider_butceleri b ON b.isletme_id=k.isletme_id AND b.kategori_id=k.id AND b.donem=$2::date
      LEFT JOIN giderler g ON g.isletme_id=k.isletme_id AND g.kategori_id=k.id AND g.durum='onaylandi' AND g.gider_tarihi>= $2::date AND g.gider_tarihi<($2::date+INTERVAL '1 month')
      WHERE k.isletme_id=$1 AND k.aktif=TRUE GROUP BY k.id,b.tutar ORDER BY k.ad`, [id, butceAyi]),
    pool.query(`SELECT yontem,COUNT(*)::int adet,COALESCE(SUM(tutar),0) tutar FROM odeme_islemleri WHERE isletme_id=$1 AND durum='basarili' AND COALESCE(basarili_at,olusturma)::date BETWEEN $2::date AND $3::date GROUP BY yontem ORDER BY tutar DESC`, [id, baslangic, bitis]),
  ]);
  const ciro = Number(gelir.rows[0].ciro); const toplamGider = Number(gider.rows[0].gider); const net = ciro - toplamGider;
  const sayi = (deger) => Number(deger || 0);
  return {
    donem: { baslangic, bitis, butceAyi },
    ozet: { ciro, gider: toplamGider, net, siparis: Number(gelir.rows[0].siparis), ortalamaSepet: Number(gelir.rows[0].ortalama_sepet), giderKaydi: Number(gider.rows[0].kayit), indirilecekKdv: Number(gider.rows[0].kdv), karMarji: ciro ? Number((net / ciro * 100).toFixed(1)) : 0, giderOrani: ciro ? Number((toplamGider / ciro * 100).toFixed(1)) : 0 },
    gunluk: gunluk.rows.map((r) => ({ tarih: r.gun, gelir: sayi(r.gelir), gider: sayi(r.gider) })),
    aylik: aylik.rows.map((r) => ({ ay: r.ay, gelir: sayi(r.gelir), gider: sayi(r.gider) })),
    kategoriler: kategori.rows.map((r) => ({ id: Number(r.id), ad: r.ad, renk: r.renk, tutar: sayi(r.tutar) })),
    butceler: butce.rows.map((r) => { const plan = sayi(r.butce); const gerceklesen = sayi(r.gerceklesen); return { kategoriId: Number(r.id), ad: r.ad, renk: r.renk, butce: plan, gerceklesen, kalan: plan - gerceklesen, kullanim: plan ? Number((gerceklesen / plan * 100).toFixed(1)) : 0 }; }),
    odemeYontemleri: odeme.rows.map((r) => ({ yontem: r.yontem, adet: Number(r.adet), tutar: sayi(r.tutar) })),
  };
}
