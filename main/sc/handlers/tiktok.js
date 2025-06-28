const axios = require("axios");

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFromTikwm(url) {
  try {
    const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`);
    const data = res.data;

    console.log("RESPONS MENTAH:", data);

    if (!data || (!data.video && !data.images)) {
      throw new Error("❌ Data tidak ditemukan di respons TikTok.");
    }

    const type = data.images ? "slide" : "video";

    // Jika slide / photo
    if (type === "slide") {
      const images = data.images.map(img => ({
        type: "photo",
        media: img.url
      }));

      const caption = `👤 @${data.author?.unique_id || "-"}\n🎵 ${data.music?.title || "tanpa musik"}\n\n${data.title || ""}`;

      await delay(2000); // agar URL stabil

      return {
        type: "slide",
        images,
        caption,
        audioUrl: data.music?.play_url || null,
      };
    }

    // Jika video biasa
    const noWatermark = data.video.noWatermark;
    const audioUrl = data.music?.play_url;

    if (!noWatermark || !audioUrl) {
      throw new Error("❌ Video atau audio tidak ditemukan.");
    }

    await delay(2000); // agar URL lebih stabil

    return {
      type: "video",
      video: noWatermark,
      audioUrl,
    };

  } catch (err) {
    console.error("Error mengambil data TikTok:", err.message);
    throw new Error(`❌ Gagal mendapatkan data dari TikTok: ${err.message}`);
  }
}

module.exports = { downloadFromTikwm };
