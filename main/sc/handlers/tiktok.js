const axios = require("axios");

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFromTikwm(url) {
  try {
    const apiEndpoint = process.env.apitiktok + encodeURIComponent(url);
    const res = await axios.get(apiEndpoint);
    const data = res.data;

    console.log("RESPONS MENTAH:", data);

    if (!data || (!data.video && !data.images)) {
      throw new Error("❌ Data tidak ditemukan di respons TikTok.");
    }

    const isSlide = Array.isArray(data.images) && data.images.length > 0;
    const type = isSlide ? "slide" : "video";

    if (type === "slide") {
      const images = data.images
        .filter(img => img && img.url)
        .map(img => ({
          type: "photo",
          media: img.url
        }));

      if (images.length === 0) {
        throw new Error("❌ Gambar slide tidak valid.");
      }

      const caption = "Diunduh melalui: @iniuntukdonlotvidiotiktokbot";

      await delay(2000);

      return {
        type: "slide",
        images,
        caption,
        audioUrl: data.music?.play_url || null,
      };
    }

    const noWatermark = data.video?.noWatermark;
    const audioUrl = data.music?.play_url;

    if (!noWatermark) {
      throw new Error("❌ Video tidak ditemukan.");
    }

    await delay(2000);

    return {
      type: "video",
      video: noWatermark,
      audioUrl: audioUrl || null,
    };

  } catch (err) {
    console.error("Error TikTok:", err.message);
    throw new Error(`❌ Gagal mendapatkan data dari TikTok.`);
  }
}

module.exports = { downloadFromTikwm };
