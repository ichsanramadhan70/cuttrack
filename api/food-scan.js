const OpenAI = require("openai");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only"
    });
  }

  try {
    const { image } = req.body || {};

    if (!image || !image.startsWith("data:image/")) {
      return res.status(400).json({
        error: "Image tidak ditemukan atau format gambar tidak valid."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY belum terpasang."
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are the food analysis engine for CutTrack.

Analyze the food in this image.

IMPORTANT:
- Identify clearly visible food items separately.
- Estimate portion size in grams.
- Nutrition values are estimates, not exact measurements.
- Do not invent precision.
- If something cannot be identified reliably, use null.
- Consider visible sauces, oil, cheese, toppings, gravy, etc.
- Do not count plates, bowls, packaging or utensils as food.

Return ONLY valid JSON.

Required structure:

{
  "items": [
    {
      "name": "string",
      "portion_g": number,
      "calories_kcal": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "confidence": "low|medium|high",
      "reasoning": "string"
    }
  ],
  "total": {
    "calories_kcal": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number
  },
  "overall_confidence": "low|medium|high",
  "photo_quality": "poor|acceptable|good",
  "notes": "string",
  "needs_user_confirmation": true
}

Do not use markdown.
Do not use code fences.
Return JSON only.
`
            },
            {
              type: "input_image",
              image_url: image,
              detail: "high"
            }
          ]
        }
      ]
    });

    const text = response.output_text || "";

    if (!text) {
      return res.status(502).json({
        error: "OpenAI tidak mengembalikan hasil."
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch (parseError) {
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        return res.status(502).json({
          error: "OpenAI tidak mengembalikan JSON yang valid.",
          raw: text
        });
      }

      result = JSON.parse(match[0]);
    }

    return res.status(200).json({
      ...result,
      scanned_at: new Date().toISOString(),
      disclaimer:
        "Nilai nutrisi merupakan estimasi berdasarkan foto dan perkiraan ukuran porsi."
    });

  } catch (error) {

    console.error("========== FOOD SCAN ERROR ==========");
    console.error(error);
    console.error("====================================");

    return res.status(500).json({
      error: "OpenAI API error",
      message: error.message || "Unknown error",
      status: error.status || null,
      code: error.code || null,
      type: error.type || null
    });
  }
};
