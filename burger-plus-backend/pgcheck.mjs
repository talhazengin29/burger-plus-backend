import { io } from "socket.io-client";
const s = io("http://localhost:4000");
s.on("connect", () => {
  s.emit("masaya-katil", "9");
  setTimeout(() => {
    s.emit("urun-ekle", { masaNo: "9", urun: { id: 1, ad: "Test", fiyat: 180, adet: 1 }, kisiAdi: "A" });
    setTimeout(async () => {
      const r = await fetch("http://localhost:4000/api/masa/9");
      const d = await r.json();
      console.log("Kalem sayısı:", d.kalemler.length);
      if (d.kalemler[0]) {
        const k = d.kalemler[0];
        console.log("fiyat degeri:", JSON.stringify(k.fiyat), "| tipi:", typeof k.fiyat);
        console.log("adet degeri:", JSON.stringify(k.adet), "| tipi:", typeof k.adet);
      }
      s.close(); process.exit(0);
    }, 500);
  }, 300);
});
