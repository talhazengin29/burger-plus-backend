import { createHash, randomBytes, randomUUID } from "crypto";

export const PERSONEL_CAGRI_NEDENLERI = ["siparis", "hesap", "ihtiyac", "temizlik"];
export const PERSONEL_CAGRI_DURUMLARI = ["bekliyor", "goruldu", "tamamlandi", "masada_yok", "iptal"];
export const CAGRI_BEKLEME_SANIYESI = 60;
export const CAGRI_PENCERE_DAKIKASI = 10;
export const CAGRI_PENCERE_LIMITI = 3;

const sha256 = (deger) => createHash("sha256").update(String(deger || "")).digest("hex");
const uuidMi = (deger) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(deger || ""));

export function personelCagriNedeniniTemizle(deger) {
  const sonuc = String(deger || "").trim().toLowerCase();
  if (!PERSONEL_CAGRI_NEDENLERI.includes(sonuc)) throw new Error("Çağrı nedeni geçersiz.");
  return sonuc;
}

export function personelCagriDurumunuTemizle(deger) {
  const sonuc = String(deger || "").trim().toLowerCase();
  if (!["goruldu", "tamamlandi", "masada_yok"].includes(sonuc)) throw new Error("Çağrı durumu geçersiz.");
  return sonuc;
}

function kaydiDonustur(kayit) {
  if (!kayit) return null;
  return {
    id: kayit.id,
    masaNo: kayit.masa_no,
    neden: kayit.neden,
    durum: kayit.durum,
    olusturma: kayit.olusturma,
    gorulme: kayit.gorulme,
    tamamlanma: kayit.tamamlanma,
    personelAdi: kayit.personel_adi || null,
  };
}

export async function personelCagriTablolariHazirla(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS masa_cagri_oturumlari (
      id UUID PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      masa_no TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      cihaz_hash TEXT NOT NULL,
      aktif BOOLEAN NOT NULL DEFAULT TRUE,
      engelli_bitis TIMESTAMPTZ,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      son_kullanim TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      bitis TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_masa_cagri_oturum_aktif
      ON masa_cagri_oturumlari(isletme_id, masa_no, aktif, bitis);
    CREATE INDEX IF NOT EXISTS idx_masa_cagri_oturum_cihaz
      ON masa_cagri_oturumlari(isletme_id, cihaz_hash, engelli_bitis);

    CREATE TABLE IF NOT EXISTS personel_cagrilari (
      id UUID PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      masa_no TEXT NOT NULL,
      oturum_id UUID NOT NULL REFERENCES masa_cagri_oturumlari(id) ON DELETE CASCADE,
      neden TEXT NOT NULL CHECK (neden IN ('siparis','hesap','ihtiyac','temizlik')),
      durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor','goruldu','tamamlandi','masada_yok','iptal')),
      istek_anahtari UUID NOT NULL,
      personel_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      gorulme TIMESTAMPTZ,
      tamamlanma TIMESTAMPTZ,
      UNIQUE (isletme_id, istek_anahtari)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_personel_cagri_tek_aktif
      ON personel_cagrilari(isletme_id, masa_no)
      WHERE durum IN ('bekliyor','goruldu');
    CREATE INDEX IF NOT EXISTS idx_personel_cagri_liste
      ON personel_cagrilari(isletme_id, durum, olusturma DESC);
  `);
}

export async function masaCagriOturumuBaslat(isletmeId, pool, masaNo, cihazAnahtari) {
  if (!uuidMi(cihazAnahtari)) throw new Error("Cihaz kimliği geçersiz.");
  const cihazHash = sha256(cihazAnahtari);
  const engel = await pool.query(
    `SELECT engelli_bitis FROM masa_cagri_oturumlari
     WHERE isletme_id=$1 AND cihaz_hash=$2 AND engelli_bitis > NOW()
     ORDER BY engelli_bitis DESC LIMIT 1`,
    [isletmeId, cihazHash]
  );
  if (engel.rows[0]) {
    const hata = new Error("Bu cihazdan masa çağrısı geçici olarak engellendi.");
    hata.status = 429;
    throw hata;
  }
  await pool.query(
    `UPDATE masa_cagri_oturumlari SET aktif=FALSE
     WHERE isletme_id=$1 AND masa_no=$2 AND cihaz_hash=$3 AND aktif=TRUE`,
    [isletmeId, String(masaNo), cihazHash]
  );
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const sonuc = await pool.query(
    `INSERT INTO masa_cagri_oturumlari(id,isletme_id,masa_no,token_hash,cihaz_hash,bitis)
     VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '2 hours') RETURNING bitis`,
    [id, isletmeId, String(masaNo), sha256(token), cihazHash]
  );
  return { token, bitis: sonuc.rows[0].bitis };
}

async function oturumuDogrula(client, isletmeId, masaNo, token, kilitle = false) {
  if (!token) throw new Error("Masa çağrı oturumu gerekli.");
  const sonuc = await client.query(
    `SELECT * FROM masa_cagri_oturumlari
     WHERE isletme_id=$1 AND masa_no=$2 AND token_hash=$3 AND aktif=TRUE AND bitis>NOW()
     ${kilitle ? "FOR UPDATE" : ""}`,
    [isletmeId, String(masaNo), sha256(token)]
  );
  if (!sonuc.rows[0]) {
    const hata = new Error("Masa çağrı oturumu geçersiz veya süresi dolmuş.");
    hata.status = 403;
    throw hata;
  }
  await client.query("UPDATE masa_cagri_oturumlari SET son_kullanim=NOW() WHERE id=$1", [sonuc.rows[0].id]);
  return sonuc.rows[0];
}

export async function masaPersonelCagrisiniGetir(isletmeId, pool, masaNo, token) {
  const oturum = await oturumuDogrula(pool, isletmeId, masaNo, token);
  const sonuc = await pool.query(
    `SELECT pc.*, CONCAT_WS(' ',k.ad,k.soyad) personel_adi FROM personel_cagrilari pc
     LEFT JOIN kullanicilar k ON k.id=pc.personel_id
     WHERE pc.isletme_id=$1 AND pc.masa_no=$2
       AND (pc.durum IN ('bekliyor','goruldu') OR pc.oturum_id=$3)
     ORDER BY (pc.durum IN ('bekliyor','goruldu')) DESC, pc.olusturma DESC LIMIT 1`,
    [isletmeId, String(masaNo), oturum.id]
  );
  return kaydiDonustur(sonuc.rows[0]);
}

export async function masaPersonelCagrisiOlustur(isletmeId, pool, masaNo, token, neden, istekAnahtari) {
  const temizNeden = personelCagriNedeniniTemizle(neden);
  if (!uuidMi(istekAnahtari)) throw new Error("İstek anahtarı geçersiz.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const oturum = await oturumuDogrula(client, isletmeId, masaNo, token, true);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${isletmeId}:${masaNo}`]);
    const ayni = await client.query("SELECT * FROM personel_cagrilari WHERE isletme_id=$1 AND istek_anahtari=$2", [isletmeId, istekAnahtari]);
    if (ayni.rows[0]) { await client.query("COMMIT"); return kaydiDonustur(ayni.rows[0]); }
    const aktif = await client.query(
      `SELECT * FROM personel_cagrilari WHERE isletme_id=$1 AND masa_no=$2 AND durum IN ('bekliyor','goruldu') ORDER BY olusturma DESC LIMIT 1`,
      [isletmeId, String(masaNo)]
    );
    if (aktif.rows[0]) { await client.query("COMMIT"); return kaydiDonustur(aktif.rows[0]); }
    const son = await client.query(
      "SELECT olusturma FROM personel_cagrilari WHERE isletme_id=$1 AND masa_no=$2 ORDER BY olusturma DESC LIMIT 1",
      [isletmeId, String(masaNo)]
    );
    if (son.rows[0] && Date.now() - new Date(son.rows[0].olusturma).getTime() < CAGRI_BEKLEME_SANIYESI * 1000) {
      const hata = new Error(`Yeni çağrı için ${CAGRI_BEKLEME_SANIYESI} saniye bekleyin.`); hata.status = 429; throw hata;
    }
    const sayac = await client.query(
      `SELECT COUNT(*)::int adet FROM personel_cagrilari WHERE isletme_id=$1 AND masa_no=$2 AND olusturma>NOW()-INTERVAL '${CAGRI_PENCERE_DAKIKASI} minutes'`,
      [isletmeId, String(masaNo)]
    );
    if (sayac.rows[0].adet >= CAGRI_PENCERE_LIMITI) {
      const hata = new Error(`Bu masadan ${CAGRI_PENCERE_DAKIKASI} dakikada en fazla ${CAGRI_PENCERE_LIMITI} çağrı yapılabilir.`); hata.status = 429; throw hata;
    }
    const sonuc = await client.query(
      `INSERT INTO personel_cagrilari(id,isletme_id,masa_no,oturum_id,neden,istek_anahtari)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [randomUUID(), isletmeId, String(masaNo), oturum.id, temizNeden, istekAnahtari]
    );
    await client.query("COMMIT");
    return kaydiDonustur(sonuc.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { client.release(); }
}

export async function aktifPersonelCagrilariniGetir(isletmeId, pool) {
  const sonuc = await pool.query(
    `SELECT pc.*, CONCAT_WS(' ',k.ad,k.soyad) personel_adi FROM personel_cagrilari pc
     LEFT JOIN kullanicilar k ON k.id=pc.personel_id
     WHERE pc.isletme_id=$1 AND pc.durum IN ('bekliyor','goruldu') ORDER BY pc.olusturma ASC`,
    [isletmeId]
  );
  return sonuc.rows.map(kaydiDonustur);
}

export async function personelCagrisiDurumGuncelle(isletmeId, pool, id, durum, personelId) {
  const temizDurum = personelCagriDurumunuTemizle(durum);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sonuc = await client.query(
      `UPDATE personel_cagrilari SET durum=$1, personel_id=$2,
       gorulme=CASE WHEN $1='goruldu' THEN COALESCE(gorulme,NOW()) ELSE gorulme END,
       tamamlanma=CASE WHEN $1 IN ('tamamlandi','masada_yok') THEN NOW() ELSE tamamlanma END
       WHERE id=$3 AND isletme_id=$4 AND durum IN ('bekliyor','goruldu') RETURNING *`,
      [temizDurum, personelId || null, id, isletmeId]
    );
    if (!sonuc.rows[0]) throw new Error("Aktif çağrı bulunamadı.");
    if (temizDurum === "masada_yok") {
      await client.query(
        `UPDATE masa_cagri_oturumlari SET aktif=FALSE, engelli_bitis=NOW()+INTERVAL '24 hours'
         WHERE id=$1`, [sonuc.rows[0].oturum_id]
      );
    }
    await client.query("COMMIT");
    return kaydiDonustur(sonuc.rows[0]);
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
  finally { client.release(); }
}

export async function masaCagriOturumlariniKapat(isletmeId, pool, masaNo) {
  await pool.query("UPDATE masa_cagri_oturumlari SET aktif=FALSE WHERE isletme_id=$1 AND masa_no=$2 AND aktif=TRUE", [isletmeId, String(masaNo)]);
  await pool.query("UPDATE personel_cagrilari SET durum='iptal', tamamlanma=NOW() WHERE isletme_id=$1 AND masa_no=$2 AND durum IN ('bekliyor','goruldu')", [isletmeId, String(masaNo)]);
}
