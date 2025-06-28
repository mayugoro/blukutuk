const axios = require("axios");
const { incrementStat, saveLog, saveUrlCache } = require("../db");

async function downloadFromFacebook(url) {
  try {
    const res = await axios.get(`https://fb.bdbots.xyz/dl?url=${encodeURIComponent(url)}`);
    const data = res.data;

    if (!data || data.status !== "success" || !Array.isArray(data.downloads) || data.downloads.length === 0) {
      throw new Error("Gagal mendapatkan video dari Facebook.");
    }

    // Ambil list video dengan URL yang valid
    const availableVideos = data.downloads.filter(v => v.url);
    if (availableVideos.length === 0) {
      throw new Error("❌ Tidak ada video dengan URL yang tersedia.");
    }

    // Pilih kualitas terbaik: HD > SD > lainnya
    const preferredOrder = ["HD", "SD"];
    const selectedVideo =
      preferredOrder
        .map(q => availableVideos.find(v => v.quality === q && v.url))
        .find(Boolean) || availableVideos[0];

    // Simpan ke database
    const caption = "Diunduh melalui: @iniuntukdonlotvidiotiktokbot";
    incrementStat("facebook");
    saveLog("facebook", url);
    saveUrlCache(url, "facebook", selectedVideo.url, null, caption);

    // Kembalikan hasil
    return {
      video: selectedVideo.url,
      title: data.title || "Video Facebook"
    };

  } catch (err) {
    const status = err?.response?.status;

    if (status === 400) {
      console.error("❌ FB - API Error 400: Bad Request");
      throw new Error("❌ Link tidak valid atau video tidak tersedia.");
    }

    if (status === 503) {
      console.error("❌ FB - API Error 503: Service Unavailable");
      throw new Error("❌ Server Facebook API sedang sibuk / down. Coba lagi nanti.");
    }

    console.error("❌ Error Facebook:", err.message);
    throw new Error("❌ Gagal: link mungkin salah, video private, atau API sedang tidak tersedia.");
  }
}

module.exports = { downloadFromFacebook };
