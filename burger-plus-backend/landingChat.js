const GEMINI_API_KOKU = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_TRANSLATION_MODEL || "gemini-3.1-flash-lite";
const ZAMAN_ASIMI_MS = 15_000;
const EN_FAZLA_MESAJ = 600;
const EN_FAZLA_GECMIS = 6;

const BILGI_TABANI = `
orQRestro, restoran ve kafeler icin web tabanli QR menu ve siparis platformudur.
Musteri uygulama indirmeden masadaki QR kodu tarayarak menuyu acar ve siparis verebilir.
Ozellikler: QR ile siparis, canli mutfak ve salon paneli, sadakat puani ve dijital damga karti,
iyzico ile online odeme, satis raporlari, urun-kategori-kampanya yonetimi, logo ve renk ozellestirme.
Kurulum: menu dijitale aktarilir, masaya ozel QR kodlari olusturulur ve siparisler mutfak ekranina duser.
Baslangic paketi aylik 499 TL: sinirsiz QR menu goruntuleme, temel tema, urun/kategori yonetimi, e-posta destegi.
Profesyonel paket aylik 999 TL: Baslangic ozellikleri, canli siparis, mutfak/salon paneli, iyzico, sadakat ve raporlar.
Kurumsal paket cok subeli zincirler icindir ve fiyat teklif ile belirlenir.
Yillik odemede 2 ay hediye edilir. Tum paketlerde 14 gun ucretsiz deneme vardir.
Kurulumu ve menu aktarimini ekip yapar; deneme sonunda devam edilmezse ucret alinmaz.
Veriler PostgreSQL'de isletme bazinda ayrilir; sifreler bcrypt ile saklanir ve iki adimli dogrulama desteklenir.
Kesin olmayan entegrasyon, fiyat, teslim tarihi veya ozellik icin soz verme. Kullaniciya iletisim formunu oner.
Kart, sifre, kimlik numarasi veya hassas kisisel veri isteme.
`.trim();

const HAZIR_CEVAPLAR = [
  {
    anahtarlar: ["fiyat", "ucret", "kaç tl", "ne kadar", "paket"],
    cevap: "Başlangıç paketi aylık 499 TL, Profesyonel paket aylık 999 TL'dir. Kurumsal paket özel fiyatlandırılır. Yıllık ödemede 2 ay hediye ve tüm paketlerde 14 gün ücretsiz deneme bulunur.",
  },
  {
    anahtarlar: ["deneme", "ucretsiz", "ücretsiz", "14 gun", "14 gün"],
    cevap: "Tüm paketlerde 14 gün ücretsiz deneme var. Kurulumu ve menü aktarımını ekip yapar; deneme sonunda devam etmezseniz ücret alınmaz.",
  },
  {
    anahtarlar: ["uygulama indir", "indirmek", "download", "app gerekli"],
    cevap: "Hayır. Müşteri masadaki QR kodu okutup menüyü doğrudan tarayıcıda açar; uygulama indirmesi gerekmez.",
  },
  {
    anahtarlar: ["kurulum", "nasil baslar", "nasıl başlar", "menu aktar", "menü aktar"],
    cevap: "Menünüz dijitale aktarılır, masalara özel QR kodları oluşturulur ve mutfak/salon panelleri hazırlanır. Ardından müşteriler QR üzerinden sipariş vermeye başlayabilir.",
  },
  {
    anahtarlar: ["ozellik", "özellik", "neler var", "ne yapiyor", "ne yapıyor"],
    cevap: "QR sipariş, canlı mutfak ve salon paneli, online ödeme, sadakat/damga sistemi, kampanyalar, raporlar ve markanıza özel tema özellikleri bulunur.",
  },
  {
    anahtarlar: ["odeme", "ödeme", "iyzico", "guvenli", "güvenli"],
    cevap: "Online ödemeler iyzico üzerinden alınır. Sipariş tutarı ve ödeme sonucu sunucu tarafında doğrulanmadan sipariş mutfağa aktarılmaz.",
  },
  {
    anahtarlar: ["veri", "guvenlik", "güvenlik", "sifre", "şifre", "kvkk"],
    cevap: "İşletme verileri birbirinden ayrı tutulur, şifreler bcrypt ile saklanır ve yönetici hesaplarında iki adımlı doğrulama kullanılabilir. Hassas bilgilerinizi bu sohbette paylaşmayın.",
  },
  {
    anahtarlar: ["demo", "incele", "gorebilir", "görebilir"],
    cevap: "Müşteri uygulaması demosunu sayfadaki “Canlı Demoyu İncele” bağlantısından açabilirsiniz. Kurulum talebi için iletişim bölümünü kullanabilirsiniz.",
  },
  {
    anahtarlar: ["merhaba", "selam", "hey", "iyi gunler", "iyi günler"],
    cevap: "Merhaba! orQRestro'nun fiyatları, özellikleri, kurulumu veya ücretsiz denemesi hakkında yardımcı olabilirim. Neyi merak ediyorsunuz?",
  },
];

const YANIT_SEMASI = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

function normallestir(metin) {
  return String(metin || "").trim().toLocaleLowerCase("tr-TR");
}

export function hazirLandingCevabi(mesaj) {
  const temiz = normallestir(mesaj);
  if (!temiz) return null;
  let enIyi = null;
  let puan = 0;
  for (const kayit of HAZIR_CEVAPLAR) {
    const eslesme = kayit.anahtarlar.reduce((toplam, anahtar) => toplam + (temiz.includes(anahtar) ? 1 : 0), 0);
    if (eslesme > puan) {
      puan = eslesme;
      enIyi = kayit.cevap;
    }
  }
  return puan ? enIyi : null;
}

function gecmisiTemizle(gecmis) {
  if (!Array.isArray(gecmis)) return [];
  return gecmis.slice(-EN_FAZLA_GECMIS).flatMap((kayit) => {
    const rol = kayit?.rol === "asistan" ? "model" : kayit?.rol === "kullanici" ? "user" : "";
    const metin = String(kayit?.metin || "").trim().slice(0, EN_FAZLA_MESAJ);
    return rol && metin ? [{ role: rol, parts: [{ text: metin }] }] : [];
  });
}

function geminiMetniniOku(veri) {
  const ham = veri?.candidates?.[0]?.content?.parts?.map((parca) => parca?.text || "").join("").trim();
  if (!ham) throw new Error("Gemini boş yanıt döndürdü.");
  const ayrismis = JSON.parse(ham);
  const cevap = String(ayrismis?.answer || "").trim();
  if (!cevap) throw new Error("Gemini yanıtı geçersiz.");
  return cevap.slice(0, 900);
}

async function geminiLandingCevabi(mesaj, gecmis, fetchImpl) {
  if (!process.env.GEMINI_API_KEY) return null;
  const denetleyici = new AbortController();
  const zamanlayici = setTimeout(() => denetleyici.abort(), ZAMAN_ASIMI_MS);
  try {
    const yanit = await fetchImpl(`${GEMINI_API_KOKU}/${encodeURIComponent(MODEL)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
      signal: denetleyici.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `Sen orQRestro landing sayfasının Türkçe satış destek asistanısın. Yalnızca aşağıdaki doğrulanmış bilgilerle kısa, doğal ve en fazla 3 cümleyle cevap ver. Bilmediğin konuda tahmin yürütme; iletişim formuna yönlendir.\n\n${BILGI_TABANI}` }] },
        contents: [...gecmisiTemizle(gecmis), { role: "user", parts: [{ text: mesaj }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 240, responseMimeType: "application/json", responseJsonSchema: YANIT_SEMASI },
      }),
    });
    if (!yanit.ok) throw new Error(`Gemini HTTP ${yanit.status}`);
    return geminiMetniniOku(await yanit.json());
  } finally {
    clearTimeout(zamanlayici);
  }
}

export async function landingChatYaniti({ mesaj, gecmis }, fetchImpl = fetch) {
  const temizMesaj = String(mesaj || "").trim();
  if (!temizMesaj) return { hata: "Mesaj boş olamaz.", durum: 400 };
  if (temizMesaj.length > EN_FAZLA_MESAJ) return { hata: `Mesaj en fazla ${EN_FAZLA_MESAJ} karakter olabilir.`, durum: 400 };

  const hazir = hazirLandingCevabi(temizMesaj);
  if (hazir) return { cevap: hazir, kaynak: "hazir" };

  try {
    const aiCevabi = await geminiLandingCevabi(temizMesaj, gecmis, fetchImpl);
    if (aiCevabi) return { cevap: aiCevabi, kaynak: "ai" };
  } catch (hata) {
    console.error("Landing chatbot AI hatası:", hata?.message || hata);
  }

  return {
    cevap: "Bu konuda doğrulanmış bir yanıt veremiyorum. Fiyatlar, özellikler, kurulum veya ücretsiz deneme hakkında sorabilir; ayrıntılı destek için sayfadaki iletişim bölümünü kullanabilirsiniz.",
    kaynak: "yedek",
  };
}
