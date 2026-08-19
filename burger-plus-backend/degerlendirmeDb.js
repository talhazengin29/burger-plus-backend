export const degerlendirmePuaniniDogrula = (deger, alan) => {
  const sonuc = Number(deger);
  if (!Number.isInteger(sonuc) || sonuc < 1 || sonuc > 5) {
    throw Object.assign(new Error(`${alan} 1 ile 5 arasında olmalıdır.`), { status: 400 });
  }
  return sonuc;
};
const metin = (deger, sinir) => String(deger ?? "").trim().slice(0, sinir);
const urunAnahtari = (urun) => metin(urun?.sepetAnahtari || urun?.id || urun?.ad, 180);

export async function degerlendirmeTablolariniHazirla(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS siparis_degerlendirmeleri (
      id BIGSERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      siparis_id BIGINT NOT NULL REFERENCES kullanici_siparisleri(id) ON DELETE CASCADE,
      kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
      siparis_no TEXT NOT NULL,
      genel_puan SMALLINT NOT NULL CHECK (genel_puan BETWEEN 1 AND 5),
      servis_hizi_puani SMALLINT NOT NULL CHECK (servis_hizi_puani BETWEEN 1 AND 5),
      personel_puani SMALLINT NOT NULL CHECK (personel_puani BETWEEN 1 AND 5),
      siparis_dogrulugu_puani SMALLINT NOT NULL CHECK (siparis_dogrulugu_puani BETWEEN 1 AND 5),
      yorum TEXT NOT NULL DEFAULT '',
      olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (isletme_id, siparis_id)
    );
    CREATE INDEX IF NOT EXISTS siparis_degerlendirmeleri_isletme_tarih_idx
      ON siparis_degerlendirmeleri (isletme_id, olusturma DESC);

    CREATE TABLE IF NOT EXISTS siparis_urun_degerlendirmeleri (
      id BIGSERIAL PRIMARY KEY,
      isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
      degerlendirme_id BIGINT NOT NULL REFERENCES siparis_degerlendirmeleri(id) ON DELETE CASCADE,
      urun_id INTEGER,
      urun_anahtari TEXT NOT NULL,
      urun_adi TEXT NOT NULL,
      puan SMALLINT NOT NULL CHECK (puan BETWEEN 1 AND 5),
      UNIQUE (degerlendirme_id, urun_anahtari)
    );
    CREATE INDEX IF NOT EXISTS siparis_urun_degerlendirmeleri_urun_idx
      ON siparis_urun_degerlendirmeleri (isletme_id, urun_id, puan);
  `);
}

export async function siparisDegerlendirmesiOlustur(isletmeId, kullaniciId, siparisId, girdi, pool) {
  const baglanti = await pool.connect();
  try {
    await baglanti.query("BEGIN");
    const siparisSonucu = await baglanti.query(
      `SELECT id,siparis_no,urunler,tamamlandi FROM kullanici_siparisleri
       WHERE id=$1 AND isletme_id=$2 AND kullanici_id=$3 FOR UPDATE`,
      [siparisId, isletmeId, kullaniciId]
    );
    const siparis = siparisSonucu.rows[0];
    if (!siparis) throw Object.assign(new Error("Sipariş bulunamadı."), { status: 404 });
    if (!siparis.tamamlandi) throw Object.assign(new Error("Sipariş tamamlandıktan sonra değerlendirilebilir."), { status: 400 });

    const beklenenler = new Map();
    for (const urun of Array.isArray(siparis.urunler) ? siparis.urunler : []) {
      const anahtar = urunAnahtari(urun);
      if (anahtar && !beklenenler.has(anahtar)) beklenenler.set(anahtar, urun);
    }
    if (!beklenenler.size) throw Object.assign(new Error("Değerlendirilecek ürün bulunamadı."), { status: 400 });

    const gonderilenler = new Map((Array.isArray(girdi?.urunler) ? girdi.urunler : []).map((urun) => [metin(urun?.urunAnahtari, 180), urun]));
    const eksik = [...beklenenler.keys()].find((anahtar) => !gonderilenler.has(anahtar));
    if (eksik) throw Object.assign(new Error("Siparişteki her ürün için puan vermelisiniz."), { status: 400 });

    const degerlendirme = await baglanti.query(
      `INSERT INTO siparis_degerlendirmeleri
        (isletme_id,siparis_id,kullanici_id,siparis_no,genel_puan,servis_hizi_puani,personel_puani,siparis_dogrulugu_puani,yorum)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [isletmeId, siparis.id, kullaniciId, siparis.siparis_no,
        degerlendirmePuaniniDogrula(girdi?.genelPuan, "Genel deneyim"),
        degerlendirmePuaniniDogrula(girdi?.servisHiziPuani, "Servis hızı"),
        degerlendirmePuaniniDogrula(girdi?.personelPuani, "Personel"),
        degerlendirmePuaniniDogrula(girdi?.siparisDogruluguPuani, "Sipariş doğruluğu"),
        metin(girdi?.yorum, 1000)]
    );
    for (const [anahtar, urun] of beklenenler) {
      const urunPuani = degerlendirmePuaniniDogrula(gonderilenler.get(anahtar)?.puan, `${metin(urun.ad, 120) || "Ürün"} puanı`);
      const sayisalUrunId = Number(urun.id);
      await baglanti.query(
        `INSERT INTO siparis_urun_degerlendirmeleri
          (isletme_id,degerlendirme_id,urun_id,urun_anahtari,urun_adi,puan)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [isletmeId, degerlendirme.rows[0].id, Number.isInteger(sayisalUrunId) && sayisalUrunId > 0 ? sayisalUrunId : null,
          anahtar, metin(urun.ad, 160) || "Ürün", urunPuani]
      );
    }
    await baglanti.query("COMMIT");
    return { id: Number(degerlendirme.rows[0].id), olusturma: degerlendirme.rows[0].olusturma };
  } catch (e) {
    await baglanti.query("ROLLBACK");
    if (e.code === "23505") throw Object.assign(new Error("Bu sipariş daha önce değerlendirilmiş."), { status: 409 });
    throw e;
  } finally { baglanti.release(); }
}

const ortalama = (deger) => deger == null ? null : Number(Number(deger).toFixed(2));

export async function adminDegerlendirmeRaporunuGetir(isletmeId, pool, gun = 30) {
  const gunSayisi = Math.min(365, Math.max(7, Number(gun) || 30));
  const parametreler = [isletmeId, gunSayisi];
  const [ozet, dagilim, gunluk, urunler, yorumlar] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS adet,AVG(genel_puan) AS genel,AVG(servis_hizi_puani) AS servis_hizi,
      AVG(personel_puani) AS personel,AVG(siparis_dogrulugu_puani) AS siparis_dogrulugu
      FROM siparis_degerlendirmeleri WHERE isletme_id=$1 AND olusturma >= NOW()-($2::int*INTERVAL '1 day')`, parametreler),
    pool.query(`SELECT genel_puan AS puan,COUNT(*)::int AS adet FROM siparis_degerlendirmeleri
      WHERE isletme_id=$1 AND olusturma >= NOW()-($2::int*INTERVAL '1 day') GROUP BY genel_puan ORDER BY genel_puan`, parametreler),
    pool.query(`SELECT olusturma::date AS tarih,COUNT(*)::int AS adet,AVG(genel_puan) AS ortalama
      FROM siparis_degerlendirmeleri WHERE isletme_id=$1 AND olusturma >= NOW()-($2::int*INTERVAL '1 day')
      GROUP BY olusturma::date ORDER BY tarih`, parametreler),
    pool.query(`SELECT urun_id,urun_adi,COUNT(*)::int AS adet,AVG(puan) AS ortalama,
      COUNT(*) FILTER (WHERE puan<=2)::int AS dusuk_puan
      FROM siparis_urun_degerlendirmeleri WHERE isletme_id=$1
      AND degerlendirme_id IN (SELECT id FROM siparis_degerlendirmeleri WHERE isletme_id=$1 AND olusturma >= NOW()-($2::int*INTERVAL '1 day'))
      GROUP BY urun_id,urun_adi ORDER BY AVG(puan) DESC,COUNT(*) DESC,urun_adi LIMIT 100`, parametreler),
    pool.query(`SELECT d.id,d.siparis_no,d.genel_puan,d.servis_hizi_puani,d.personel_puani,
      d.siparis_dogrulugu_puani,d.yorum,d.olusturma,k.ad,k.soyad
      FROM siparis_degerlendirmeleri d JOIN kullanicilar k ON k.id=d.kullanici_id AND k.isletme_id=d.isletme_id
      WHERE d.isletme_id=$1 AND d.olusturma >= NOW()-($2::int*INTERVAL '1 day') AND d.yorum<>''
      ORDER BY d.olusturma DESC LIMIT 30`, parametreler),
  ]);
  const satir = ozet.rows[0] || {};
  return {
    gun: gunSayisi,
    ozet: { adet: Number(satir.adet || 0), genel: ortalama(satir.genel), servisHizi: ortalama(satir.servis_hizi), personel: ortalama(satir.personel), siparisDogrulugu: ortalama(satir.siparis_dogrulugu) },
    dagilim: Object.fromEntries([1,2,3,4,5].map((p) => [p, Number(dagilim.rows.find((r) => Number(r.puan) === p)?.adet || 0)])),
    gunluk: gunluk.rows.map((r) => ({ tarih: r.tarih, adet: Number(r.adet), ortalama: ortalama(r.ortalama) })),
    urunler: urunler.rows.map((r) => ({ urunId: r.urun_id == null ? null : Number(r.urun_id), urunAdi: r.urun_adi, adet: Number(r.adet), ortalama: ortalama(r.ortalama), dusukPuan: Number(r.dusuk_puan) })),
    yorumlar: yorumlar.rows.map((r) => ({ id: Number(r.id), siparisNo: r.siparis_no, musteriAdi: `${r.ad} ${r.soyad}`.trim(), genelPuan: Number(r.genel_puan), servisHiziPuani: Number(r.servis_hizi_puani), personelPuani: Number(r.personel_puani), siparisDogruluguPuani: Number(r.siparis_dogrulugu_puani), yorum: r.yorum, tarih: r.olusturma })),
  };
}
