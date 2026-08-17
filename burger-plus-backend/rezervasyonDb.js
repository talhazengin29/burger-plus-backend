import { randomUUID } from "crypto";

export const REZERVASYON_DURUMLARI = ["bekliyor", "geldi", "tamamlandi", "gelmedi", "iptal"];
const metin = (deger, uzunluk) => String(deger || "").trim().slice(0, uzunluk);
const tarihMi = (deger) => /^\d{4}-\d{2}-\d{2}$/.test(String(deger || ""));
const saatMi = (deger) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(deger || ""));

export function rezervasyonVerisiniDogrula(ham = {}, { kismi = false } = {}) {
  const sonuc = {};
  const ata = (alan, deger) => { if (!kismi || ham[alan] !== undefined) sonuc[alan] = deger; };
  ata("musteriAdi", metin(ham.musteriAdi, 120)); ata("telefon", metin(ham.telefon, 30));
  ata("tarih", metin(ham.tarih, 10)); ata("saat", metin(ham.saat, 5)); ata("masaNo", metin(ham.masaNo, 30));
  ata("kisiSayisi", Number(ham.kisiSayisi)); ata("sureDakika", Number(ham.sureDakika ?? 120)); ata("not", metin(ham.not, 500));
  if (!kismi || ham.durum !== undefined) ata("durum", metin(ham.durum || "bekliyor", 20).toLowerCase());
  if (sonuc.musteriAdi !== undefined && sonuc.musteriAdi.length < 2) throw new Error("Müşteri adı en az 2 karakter olmalıdır.");
  if (sonuc.telefon !== undefined && sonuc.telefon && !/^[+\d][\d\s()-]{6,29}$/.test(sonuc.telefon)) throw new Error("Telefon numarası geçersiz.");
  if (sonuc.tarih !== undefined && !tarihMi(sonuc.tarih)) throw new Error("Rezervasyon tarihi geçersiz.");
  if (sonuc.saat !== undefined && !saatMi(sonuc.saat)) throw new Error("Rezervasyon saati geçersiz.");
  if (sonuc.masaNo !== undefined && !/^[\p{L}\d _-]{1,30}$/u.test(sonuc.masaNo)) throw new Error("Masa bilgisi geçersiz.");
  if (sonuc.kisiSayisi !== undefined && (!Number.isInteger(sonuc.kisiSayisi) || sonuc.kisiSayisi < 1 || sonuc.kisiSayisi > 100)) throw new Error("Kişi sayısı 1–100 arasında olmalıdır.");
  if (sonuc.sureDakika !== undefined && (!Number.isInteger(sonuc.sureDakika) || sonuc.sureDakika < 30 || sonuc.sureDakika > 480)) throw new Error("Rezervasyon süresi 30–480 dakika arasında olmalıdır.");
  if (sonuc.durum !== undefined && !REZERVASYON_DURUMLARI.includes(sonuc.durum)) throw new Error("Rezervasyon durumu geçersiz.");
  return sonuc;
}

function kaydiDonustur(kayit) {
  return kayit && { id: kayit.id, musteriAdi: kayit.musteri_adi, telefon: kayit.telefon || "", tarih: String(kayit.tarih).slice(0, 10), saat: String(kayit.saat).slice(0, 5), masaNo: kayit.masa_no, kisiSayisi: kayit.kisi_sayisi, sureDakika: kayit.sure_dakika, not: kayit.notlar || "", durum: kayit.durum, olusturma: kayit.olusturma, guncelleme: kayit.guncelleme, personelAdi: kayit.personel_adi || null };
}

export async function rezervasyonTablosunuHazirla(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS rezervasyonlar (
    id UUID PRIMARY KEY, isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
    musteri_adi TEXT NOT NULL, telefon TEXT, tarih DATE NOT NULL, saat TIME NOT NULL, masa_no TEXT NOT NULL,
    kisi_sayisi INTEGER NOT NULL CHECK (kisi_sayisi BETWEEN 1 AND 100),
    sure_dakika INTEGER NOT NULL DEFAULT 120 CHECK (sure_dakika BETWEEN 30 AND 480), notlar TEXT,
    durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor','geldi','tamamlandi','gelmedi','iptal')),
    personel_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW(), guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS idx_rezervasyon_isletme_tarih ON rezervasyonlar(isletme_id,tarih,saat,masa_no);`);
}

const SECIM = `SELECT r.*, CONCAT_WS(' ',k.ad,k.soyad) personel_adi FROM rezervasyonlar r LEFT JOIN kullanicilar k ON k.id=r.personel_id`;
export async function rezervasyonlariGetir(isletmeId, pool, { baslangic, bitis } = {}) {
  const ilk = tarihMi(baslangic) ? baslangic : new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const son = tarihMi(bitis) ? bitis : new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const sonuc = await pool.query(`${SECIM} WHERE r.isletme_id=$1 AND r.tarih BETWEEN $2 AND $3 ORDER BY r.tarih,r.saat,r.masa_no`, [isletmeId, ilk, son]);
  return sonuc.rows.map(kaydiDonustur);
}
async function cakismaVarMi(client, isletmeId, veri, haricId = null) {
  const sonuc = await client.query(`SELECT id FROM rezervasyonlar WHERE isletme_id=$1 AND tarih=$2 AND masa_no=$3
    AND durum IN ('bekliyor','geldi') AND ($6::uuid IS NULL OR id<>$6)
    AND (tarih+ saat,tarih+ saat+(sure_dakika||' minutes')::interval)
    OVERLAPS ($2::date+$4::time,$2::date+$4::time+($5||' minutes')::interval) LIMIT 1`,
  [isletmeId, veri.tarih, veri.masaNo, veri.saat, veri.sureDakika, haricId]);
  return Boolean(sonuc.rows[0]);
}
export async function rezervasyonOlustur(isletmeId, pool, ham, personelId) {
  const veri = rezervasyonVerisiniDogrula(ham); const client = await pool.connect();
  try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`rezervasyon:${isletmeId}:${veri.tarih}:${veri.masaNo}`]);
    if (await cakismaVarMi(client,isletmeId,veri)) throw new Error("Bu masa seçilen saat aralığında başka bir rezervasyona ayrılmış.");
    const sonuc = await client.query(`INSERT INTO rezervasyonlar(id,isletme_id,musteri_adi,telefon,tarih,saat,masa_no,kisi_sayisi,sure_dakika,notlar,durum,personel_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [randomUUID(),isletmeId,veri.musteriAdi,veri.telefon||null,veri.tarih,veri.saat,veri.masaNo,veri.kisiSayisi,veri.sureDakika,veri.not||null,veri.durum,personelId||null]);
    await client.query("COMMIT"); return kaydiDonustur(sonuc.rows[0]);
  } catch(e){ await client.query("ROLLBACK").catch(()=>{}); throw e; } finally { client.release(); }
}
export async function rezervasyonGuncelle(isletmeId, pool, id, ham, personelId) {
  const degisiklik=rezervasyonVerisiniDogrula(ham,{kismi:true}); const client=await pool.connect();
  try { await client.query("BEGIN"); const bulunan=await client.query("SELECT * FROM rezervasyonlar WHERE id=$1 AND isletme_id=$2 FOR UPDATE",[id,isletmeId]);
    if(!bulunan.rows[0]){const e=new Error("Rezervasyon bulunamadı.");e.status=404;throw e;} const veri={...kaydiDonustur(bulunan.rows[0]),...degisiklik};
    if(["bekliyor","geldi"].includes(veri.durum)){await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`rezervasyon:${isletmeId}:${veri.tarih}:${veri.masaNo}`]);if(await cakismaVarMi(client,isletmeId,veri,id))throw new Error("Bu masa seçilen saat aralığında başka bir rezervasyona ayrılmış.");}
    const sonuc=await client.query(`UPDATE rezervasyonlar SET musteri_adi=$1,telefon=$2,tarih=$3,saat=$4,masa_no=$5,kisi_sayisi=$6,sure_dakika=$7,notlar=$8,durum=$9,personel_id=$10,guncelleme=NOW() WHERE id=$11 AND isletme_id=$12 RETURNING *`,[veri.musteriAdi,veri.telefon||null,veri.tarih,veri.saat,veri.masaNo,veri.kisiSayisi,veri.sureDakika,veri.not||null,veri.durum,personelId||null,id,isletmeId]);
    await client.query("COMMIT");return kaydiDonustur(sonuc.rows[0]);
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}finally{client.release();}
}
export async function rezervasyonSil(isletmeId,pool,id){const sonuc=await pool.query("DELETE FROM rezervasyonlar WHERE id=$1 AND isletme_id=$2 RETURNING id",[id,isletmeId]);if(!sonuc.rows[0]){const e=new Error("Rezervasyon bulunamadı.");e.status=404;throw e;}return true;}
