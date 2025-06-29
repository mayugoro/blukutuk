const axios = require("axios");
const { incrementStat, saveLog, saveUrlCache } = require("../db");

async function downloadFromIgPost(url) {
  try {
    const apiEndpoint = process.env.igpost + encodeURIComponent(url);
    const res = await axios.get(apiEndpoint);
    const media = res.data?.data?.media;

    if (!media || !Array.isArray(media) || media.length === 0) {
      throw new Error("❌ Tidak ditemukan media dari IG post.");
    }

    // Simpan cache jika memungkinkan
    let cachedVideo = null;
    if (media.length === 1 && media[0].type === "video") {
      cachedVideo = media[0].url;
    }

    const caption = "Diunduh melalui: @iniuntukdonlotvidiotiktokbot";

    // Log & cache
    incrementStat("instagram");
    saveLog("instagram", url);
    saveUrlCache(url, "instagram", cachedVideo, null, caption);

    return media;
  } catch (err) {
    if (err.response?.status === 400) {
      console.error("❌ IG POST - API Error 400:", err.response.data?.description || "Bad Request");
      throw new Error("❌ Link tidak valid atau tidak berisi media.");
    }

    console.error("❌ Error IG Post:", err.message);
    throw new Error("❌ Gagal mengambil data dari IG post.");
  }
}

module.exports = { downloadFromIgPost };
