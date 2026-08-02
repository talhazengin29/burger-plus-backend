const gramaj = (varsayilan, birim, birimAdi, olcuBirimi, ekFiyat, maxArtis) => ({
  varsayilan, birim, birimAdi, olcuBirimi, ekFiyat, maxArtis,
});

const urun = (ad, kategori, fiyat, aciklama, malzemeler, alerjenler, besinDegerleri, secenekler = {}) => ({
  ad, kategori, fiyat, aciklama, malzemeler, alerjenler, besinDegerleri,
  gramaj: secenekler.gramaj || null,
  urunTipi: secenekler.urunTipi || (kategori === "İçecekler" || kategori.includes("İçecek") ? "icecek" : "yan_lezzet"),
  populer: secenekler.populer === true,
  gorsel: null,
});

export const MENU_SABLONLARI = {
  burger: {
    kategoriler: ["Burgerler", "Yan Lezzetler", "İçecekler", "Tatlılar"],
    urunler: [
      urun("Classic Burger", "Burgerler", 285, "Izgarada mühürlenmiş dana köfte, taze sebzeler ve ev yapımı özel sosla hazırlanan klasik lezzet.", ["Dana köfte", "Cheddar peyniri", "Marul", "Domates", "Kırmızı soğan", "Turşu", "Özel burger sosu", "Susamlı ekmek"], ["Gluten", "Süt ürünleri", "Yumurta", "Hardal", "Susam"], { kalori: "620 kcal", protein: "35g", karbonhidrat: "45g", yag: "32g" }, { gramaj: gramaj(150, 50, "Köfte", "gr", 55, 3), urunTipi: "burger", populer: true }),
      urun("Double Cheese Burger", "Burgerler", 375, "İki dana köfte, çift cheddar ve karamelize soğanla yoğun peynir lezzeti.", ["Dana köfte x2", "Cheddar peyniri x2", "Karamelize soğan", "Turşu", "Özel sos", "Susamlı ekmek"], ["Gluten", "Süt ürünleri", "Yumurta", "Hardal", "Susam"], { kalori: "890 kcal", protein: "55g", karbonhidrat: "48g", yag: "52g" }, { gramaj: gramaj(200, 50, "Köfte", "gr", 55, 2), urunTipi: "burger", populer: true }),
      urun("Spicy Jalapeño Burger", "Burgerler", 325, "Dana köfte, jalapeño, pepper jack peyniri ve isli acı sosla dengeli bir acılık.", ["Dana köfte", "Pepper jack peyniri", "Jalapeño", "Marul", "Çıtır soğan", "Acı sos", "Susamlı ekmek"], ["Gluten", "Süt ürünleri", "Yumurta", "Hardal", "Susam"], { kalori: "710 kcal", protein: "38g", karbonhidrat: "51g", yag: "37g" }, { gramaj: gramaj(150, 50, "Köfte", "gr", 55, 3), urunTipi: "burger" }),
      urun("Chicken Ranch Burger", "Burgerler", 295, "Çıtır tavuk fileto, coleslaw ve ferah ranch sosla hazırlanan doyurucu tavuk burger.", ["Tavuk fileto", "Çıtır kaplama", "Cheddar", "Coleslaw", "Marul", "Ranch sos", "Susamlı ekmek"], ["Gluten", "Süt ürünleri", "Yumurta", "Hardal", "Susam"], { kalori: "680 kcal", protein: "34g", karbonhidrat: "63g", yag: "31g" }, { gramaj: gramaj(140, 50, "Tavuk", "gr", 50, 2), urunTipi: "burger" }),
      urun("French Fries", "Yan Lezzetler", 125, "Dışı çıtır, içi yumuşak altın sarısı patates kızartması.", ["Patates", "Ayçiçek yağı", "Deniz tuzu"], [], { kalori: "390 kcal", protein: "5g", karbonhidrat: "52g", yag: "18g" }),
      urun("Onion Rings", "Yan Lezzetler", 145, "Baharatlı kaplamayla kızartılmış çıtır soğan halkaları.", ["Soğan", "Buğday unu", "Galeta unu", "Baharat karışımı"], ["Gluten"], { kalori: "410 kcal", protein: "6g", karbonhidrat: "49g", yag: "21g" }),
      urun("Chicken Nuggets", "Yan Lezzetler", 175, "Altı parça çıtır tavuk nugget ve yanında ranch sos.", ["Tavuk eti", "Buğday unu", "Baharat", "Ranch sos"], ["Gluten", "Süt ürünleri", "Yumurta"], { kalori: "460 kcal", protein: "27g", karbonhidrat: "32g", yag: "25g" }),
      urun("Mozzarella Sticks", "Yan Lezzetler", 185, "Uzayan mozzarella peyniri, çıtır kaplama ve domates sosuyla servis edilir.", ["Mozzarella", "Galeta unu", "Yumurta", "Domates sosu"], ["Gluten", "Süt ürünleri", "Yumurta"], { kalori: "510 kcal", protein: "24g", karbonhidrat: "38g", yag: "29g" }),
      urun("Kola", "İçecekler", 65, "Soğuk servis edilen 330 ml kutu kola.", ["Karbonatlı su", "Şeker", "Kola aroması"], [], { kalori: "139 kcal", protein: "0g", karbonhidrat: "35g", yag: "0g" }),
      urun("Ayran", "İçecekler", 55, "Yoğurt, su ve tuzla hazırlanan 300 ml ferah ayran.", ["Yoğurt", "Su", "Tuz"], ["Süt ürünleri"], { kalori: "90 kcal", protein: "5g", karbonhidrat: "7g", yag: "4g" }),
      urun("Su", "İçecekler", 35, "500 ml doğal kaynak suyu.", ["Su"], [], { kalori: "0 kcal", protein: "0g", karbonhidrat: "0g", yag: "0g" }),
      urun("Soda", "İçecekler", 45, "200 ml doğal mineralli maden suyu.", ["Doğal mineralli su"], [], { kalori: "0 kcal", protein: "0g", karbonhidrat: "0g", yag: "0g" }),
      urun("Çay", "İçecekler", 45, "Demlikte taze demlenmiş ince belli bardakta Türk çayı.", ["Siyah çay", "Su"], [], { kalori: "2 kcal", protein: "0g", karbonhidrat: "0g", yag: "0g" }),
      urun("Çikolatalı Brownie", "Tatlılar", 165, "Belçika çikolatası ve cevizle hazırlanan yoğun kıvamlı sıcak brownie.", ["Bitter çikolata", "Tereyağı", "Yumurta", "Buğday unu", "Ceviz", "Şeker"], ["Gluten", "Süt ürünleri", "Yumurta", "Sert kabuklu yemişler"], { kalori: "480 kcal", protein: "7g", karbonhidrat: "55g", yag: "27g" }),
    ],
    oduller: [
      { ad: "Küçük Boy Patates", puan: 300, urun: "French Fries" },
      { ad: "Seçili İçecek", puan: 400, urun: "Kola" },
      { ad: "Classic Burger", puan: 1200, urun: "Classic Burger" },
    ],
    kampanyalar: [
      { baslik: "Happy Hour", aciklama: "14:00-17:00 arası içeceklerde %30 indirim", baslangicSaat: 14, bitisSaat: 17, indirimYuzde: 30, gecerliKategoriler: ["İçecekler"], kampanyaTipi: "saatli" },
      { baslik: "Öğrenci Menüsü", aciklama: "Öğrencilere burgerlerde %15 indirim", indirimYuzde: 15, gecerliKategoriler: ["Burgerler"], kampanyaTipi: "surekli" },
    ],
    sadakat: { hedefAdet: 5, kategori: "Burgerler", odulMetni: "1 Burger Hediye" },
  },

  cafe: {
    kategoriler: ["Sıcak İçecekler", "Soğuk İçecekler", "Tatlılar", "Atıştırmalık"],
    urunler: [
      urun("Espresso", "Sıcak İçecekler", 95, "Yoğun aromalı, kadifemsi kremaya sahip tek shot espresso.", ["Arabica kahve çekirdeği", "Su"], [], { kalori: "5 kcal", protein: "0g", karbonhidrat: "1g", yag: "0g" }, { gramaj: gramaj(1, 1, "Shot", "adet", 30, 2), urunTipi: "icecek" }),
      urun("Americano", "Sıcak İçecekler", 115, "Çift shot espresso ve sıcak suyla hazırlanan dengeli, uzun içimli kahve.", ["Arabica espresso", "Sıcak su"], [], { kalori: "10 kcal", protein: "0g", karbonhidrat: "2g", yag: "0g" }, { gramaj: gramaj(2, 1, "Shot", "adet", 30, 2), urunTipi: "icecek" }),
      urun("Caffe Latte", "Sıcak İçecekler", 145, "Espresso, ipeksi buhar sütü ve ince süt köpüğünün yumuşak uyumu.", ["Espresso", "İnek sütü"], ["Süt ürünleri"], { kalori: "190 kcal", protein: "10g", karbonhidrat: "18g", yag: "9g" }, { gramaj: gramaj(1, 1, "Shot", "adet", 30, 2), urunTipi: "icecek", populer: true }),
      urun("Cappuccino", "Sıcak İçecekler", 145, "Eşit oranlarda espresso, sıcak süt ve yoğun süt köpüğü.", ["Espresso", "İnek sütü"], ["Süt ürünleri"], { kalori: "140 kcal", protein: "8g", karbonhidrat: "12g", yag: "7g" }, { gramaj: gramaj(1, 1, "Shot", "adet", 30, 2), urunTipi: "icecek" }),
      urun("Filtre Kahve", "Sıcak İçecekler", 125, "Günün taze öğütülmüş çekirdeğiyle yavaş demlenen aromatik filtre kahve.", ["Öğütülmüş Arabica kahve", "Su"], [], { kalori: "5 kcal", protein: "0g", karbonhidrat: "1g", yag: "0g" }, { urunTipi: "icecek" }),
      urun("Türk Kahvesi", "Sıcak İçecekler", 105, "Bakır cezvede köpüklü pişirilen geleneksel Türk kahvesi.", ["Türk kahvesi", "Su"], [], { kalori: "12 kcal", protein: "0g", karbonhidrat: "2g", yag: "0g" }, { urunTipi: "icecek" }),
      urun("Ice Latte", "Soğuk İçecekler", 165, "Buz, soğuk süt ve çift shot espressoyla hazırlanan ferah kahve.", ["Espresso", "İnek sütü", "Buz"], ["Süt ürünleri"], { kalori: "170 kcal", protein: "9g", karbonhidrat: "16g", yag: "8g" }, { gramaj: gramaj(2, 1, "Shot", "adet", 30, 2), urunTipi: "icecek", populer: true }),
      urun("Cold Brew", "Soğuk İçecekler", 175, "On sekiz saat soğuk demlenmiş, düşük asiditeli ve yoğun aromalı kahve.", ["Arabica kahve", "Filtre su", "Buz"], [], { kalori: "8 kcal", protein: "0g", karbonhidrat: "2g", yag: "0g" }, { urunTipi: "icecek" }),
      urun("Ev Yapımı Limonata", "Soğuk İçecekler", 135, "Taze limon, nane ve az şekerle günlük hazırlanan limonata.", ["Limon", "Su", "Şeker", "Nane"], [], { kalori: "145 kcal", protein: "1g", karbonhidrat: "36g", yag: "0g" }, { urunTipi: "icecek" }),
      urun("New York Cheesecake", "Tatlılar", 215, "Krem peynirli dolgu, bisküvi tabanı ve orman meyvesi sosuyla servis edilir.", ["Krem peynir", "Yumurta", "Krema", "Bisküvi", "Şeker", "Orman meyveleri"], ["Gluten", "Süt ürünleri", "Yumurta"], { kalori: "520 kcal", protein: "9g", karbonhidrat: "48g", yag: "32g" }, { populer: true }),
      urun("Çikolatalı Brownie", "Tatlılar", 185, "Yoğun bitter çikolata ve cevizle hazırlanan nemli dokulu brownie.", ["Bitter çikolata", "Tereyağı", "Yumurta", "Buğday unu", "Ceviz"], ["Gluten", "Süt ürünleri", "Yumurta", "Sert kabuklu yemişler"], { kalori: "470 kcal", protein: "7g", karbonhidrat: "52g", yag: "26g" }),
      urun("San Sebastian", "Tatlılar", 225, "Yanık yüzeyi ve akışkan krem peynirli merkeziyle İspanyol usulü cheesecake.", ["Krem peynir", "Krema", "Yumurta", "Şeker", "Buğday unu"], ["Gluten", "Süt ürünleri", "Yumurta"], { kalori: "560 kcal", protein: "10g", karbonhidrat: "44g", yag: "38g" }),
      urun("Damla Çikolatalı Kurabiye", "Tatlılar", 95, "Tereyağlı hamur ve bitter çikolata parçalarıyla günlük pişirilen kurabiye.", ["Buğday unu", "Tereyağı", "Yumurta", "Bitter çikolata"], ["Gluten", "Süt ürünleri", "Yumurta"], { kalori: "310 kcal", protein: "4g", karbonhidrat: "39g", yag: "16g" }),
      urun("Kaşarlı Tost", "Atıştırmalık", 175, "Ekşi mayalı tost ekmeğinde bol kaşar peyniri, domates ve yanında yeşillik.", ["Tost ekmeği", "Kaşar peyniri", "Tereyağı", "Domates", "Yeşillik"], ["Gluten", "Süt ürünleri"], { kalori: "540 kcal", protein: "23g", karbonhidrat: "52g", yag: "27g" }),
      urun("Hindi Füme Sandviç", "Atıştırmalık", 215, "Tam tahıllı ekmekte hindi füme, kaşar, roka ve hardallı sos.", ["Tam tahıllı ekmek", "Hindi füme", "Kaşar", "Roka", "Domates", "Hardallı sos"], ["Gluten", "Süt ürünleri", "Yumurta", "Hardal"], { kalori: "490 kcal", protein: "30g", karbonhidrat: "48g", yag: "20g" }),
      urun("Tereyağlı Kruvasan", "Atıştırmalık", 125, "Dışı çıtır, kat kat ve tereyağı aromalı günlük Fransız kruvasanı.", ["Buğday unu", "Tereyağı", "Süt", "Yumurta", "Maya"], ["Gluten", "Süt ürünleri", "Yumurta"], { kalori: "340 kcal", protein: "7g", karbonhidrat: "38g", yag: "18g" }),
    ],
    oduller: [
      { ad: "Filtre Kahve", puan: 250, urun: "Filtre Kahve" },
      { ad: "Dilim Tatlı", puan: 500, urun: "New York Cheesecake" },
    ],
    kampanyalar: [
      { baslik: "Sabah Keyfi", aciklama: "08:00-11:00 arası kahvede %25 indirim", baslangicSaat: 8, bitisSaat: 11, indirimYuzde: 25, gecerliKategoriler: ["Sıcak İçecekler"], kampanyaTipi: "saatli" },
    ],
    sadakat: { hedefAdet: 8, kategori: "Sıcak İçecekler", odulMetni: "1 Kahve Hediye" },
  },

  pizza: {
    kategoriler: ["Pizzalar", "Makarnalar", "Başlangıçlar", "İçecekler"],
    urunler: [
      urun("Margherita", "Pizzalar", 325, "Taş fırında pişen ince hamur üzerinde domates sosu, mozzarella ve taze fesleğen.", ["Pizza hamuru", "Domates sosu", "Mozzarella", "Fesleğen", "Zeytinyağı"], ["Gluten", "Süt ürünleri"], { kalori: "780 kcal", protein: "31g", karbonhidrat: "96g", yag: "29g" }, { gramaj: gramaj(25, 5, "Çap", "cm", 85, 3), urunTipi: "burger", populer: true }),
      urun("Pepperoni Pizza", "Pizzalar", 395, "Mozzarella, dana pepperoni ve hafif acılı domates sosuyla klasik Amerikan lezzeti.", ["Pizza hamuru", "Domates sosu", "Mozzarella", "Dana pepperoni"], ["Gluten", "Süt ürünleri"], { kalori: "980 kcal", protein: "44g", karbonhidrat: "101g", yag: "43g" }, { gramaj: gramaj(25, 5, "Çap", "cm", 95, 3), urunTipi: "burger", populer: true }),
      urun("Karışık Pizza", "Pizzalar", 435, "Sucuk, mantar, biber, zeytin ve mısırla bol malzemeli taş fırın pizzası.", ["Pizza hamuru", "Domates sosu", "Mozzarella", "Dana sucuk", "Mantar", "Biber", "Zeytin", "Mısır"], ["Gluten", "Süt ürünleri"], { kalori: "1050 kcal", protein: "46g", karbonhidrat: "110g", yag: "47g" }, { gramaj: gramaj(25, 5, "Çap", "cm", 100, 3), urunTipi: "burger" }),
      urun("Vejetaryen Pizza", "Pizzalar", 375, "Izgara sebzeler, mantar, zeytin ve mozzarella ile hafif ama doyurucu pizza.", ["Pizza hamuru", "Domates sosu", "Mozzarella", "Kabak", "Patlıcan", "Mantar", "Biber", "Zeytin"], ["Gluten", "Süt ürünleri"], { kalori: "820 kcal", protein: "30g", karbonhidrat: "103g", yag: "31g" }, { gramaj: gramaj(25, 5, "Çap", "cm", 90, 3), urunTipi: "burger" }),
      urun("BBQ Chicken Pizza", "Pizzalar", 445, "Izgara tavuk, kırmızı soğan, mozzarella ve isli BBQ sosla modern pizza yorumu.", ["Pizza hamuru", "BBQ sos", "Mozzarella", "Izgara tavuk", "Kırmızı soğan", "Mısır"], ["Gluten", "Süt ürünleri", "Hardal"], { kalori: "1010 kcal", protein: "52g", karbonhidrat: "108g", yag: "40g" }, { gramaj: gramaj(25, 5, "Çap", "cm", 105, 3), urunTipi: "burger" }),
      urun("Penne Arrabbiata", "Makarnalar", 285, "Acı domates sosu, sarımsak, fesleğen ve parmesanla hazırlanan penne.", ["Penne makarna", "Domates", "Sarımsak", "Acı biber", "Parmesan", "Fesleğen"], ["Gluten", "Süt ürünleri"], { kalori: "690 kcal", protein: "22g", karbonhidrat: "104g", yag: "20g" }),
      urun("Fettuccine Alfredo", "Makarnalar", 335, "Krema, parmesan ve tereyağıyla hazırlanan kadifemsi soslu fettuccine.", ["Fettuccine", "Krema", "Parmesan", "Tereyağı", "Sarımsak"], ["Gluten", "Süt ürünleri", "Yumurta"], { kalori: "920 kcal", protein: "28g", karbonhidrat: "91g", yag: "50g" }, { populer: true }),
      urun("Spaghetti Bolognese", "Makarnalar", 355, "Uzun süre pişmiş dana kıymalı bolonez sos ve parmesanla servis edilir.", ["Spaghetti", "Dana kıyma", "Domates", "Soğan", "Havuç", "Parmesan"], ["Gluten", "Süt ürünleri", "Yumurta"], { kalori: "850 kcal", protein: "40g", karbonhidrat: "98g", yag: "32g" }),
      urun("Sarımsaklı Ekmek", "Başlangıçlar", 145, "Tereyağı, sarımsak ve maydanozla fırınlanmış çıtır ekmek dilimleri.", ["Baget ekmek", "Tereyağı", "Sarımsak", "Maydanoz"], ["Gluten", "Süt ürünleri"], { kalori: "390 kcal", protein: "8g", karbonhidrat: "48g", yag: "18g" }),
      urun("Sezar Salata", "Başlangıçlar", 245, "Izgara tavuk, parmesan, kruton ve ev yapımı Sezar sosla doyurucu salata.", ["Marul", "Izgara tavuk", "Parmesan", "Kruton", "Sezar sos"], ["Gluten", "Süt ürünleri", "Yumurta", "Balık"], { kalori: "480 kcal", protein: "34g", karbonhidrat: "24g", yag: "28g" }),
      urun("Bruschetta", "Başlangıçlar", 175, "Kızarmış ekmek üzerinde domates, fesleğen, sarımsak ve zeytinyağı.", ["Ekşi mayalı ekmek", "Domates", "Fesleğen", "Sarımsak", "Zeytinyağı"], ["Gluten"], { kalori: "310 kcal", protein: "7g", karbonhidrat: "42g", yag: "13g" }),
      urun("Kola", "İçecekler", 65, "Soğuk servis edilen 330 ml kutu kola.", ["Karbonatlı su", "Şeker", "Kola aroması"], [], { kalori: "139 kcal", protein: "0g", karbonhidrat: "35g", yag: "0g" }),
      urun("Ayran", "İçecekler", 55, "Yoğurt, su ve tuzla hazırlanan 300 ml ayran.", ["Yoğurt", "Su", "Tuz"], ["Süt ürünleri"], { kalori: "90 kcal", protein: "5g", karbonhidrat: "7g", yag: "4g" }),
      urun("Su", "İçecekler", 35, "500 ml doğal kaynak suyu.", ["Su"], [], { kalori: "0 kcal", protein: "0g", karbonhidrat: "0g", yag: "0g" }),
      urun("Soda", "İçecekler", 45, "200 ml doğal mineralli maden suyu.", ["Doğal mineralli su"], [], { kalori: "0 kcal", protein: "0g", karbonhidrat: "0g", yag: "0g" }),
    ],
    oduller: [
      { ad: "Sarımsaklı Ekmek", puan: 300, urun: "Sarımsaklı Ekmek" },
      { ad: "Orta Boy Pizza", puan: 1500, urun: "Margherita" },
    ],
    kampanyalar: [
      { baslik: "İkinci Pizza Yarı Fiyatına", aciklama: "Her gün geçerli", indirimYuzde: 50, gecerliKategoriler: ["Pizzalar"], kampanyaTipi: "surekli" },
    ],
    sadakat: { hedefAdet: 5, kategori: "Pizzalar", odulMetni: "1 Pizza Hediye" },
  },
};

export function sablonuGetir(konsept) {
  return MENU_SABLONLARI[String(konsept || "").trim().toLowerCase()] || null;
}

export function slugOlustur(deger) {
  return String(deger || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
