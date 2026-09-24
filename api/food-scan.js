const OpenAI = require("openai");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { image } = req.body || {};

    if (!image || !image.startsWith("data:image/")) {
      return res.status(400).json({
        error: "Image is required"
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY belum dipasang di environment server."
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
You are the food analysis engine for a fitness application called CutTrack.

Analyze the food shown in the image carefully.

IMPORTANT:
- This is an IMAGE-BASED ESTIMATE.
- Do not pretend the measurements are exact.
- Identify every clearly visible edible food item separately.
- Do not combine different foods into one item if they can be visually separated.
- Estimate portion size in grams based only on visible information.
- If the portion cannot reasonably be estimated, use null.
- Do not invent nutritional values when the food cannot be identified with reasonable confidence.
- If uncertain about a food identity, clearly state the uncertainty.
- Consider common preparation methods visible in the image.
- If oil, sauce, dressing, gravy, cheese or toppings are visibly present, include them separately when practical.
- Do not count plates, bowls, cutlery, packaging or non-edible objects as food.

For each food item return:

1. name
2. estimated portion in grams
3. minimum estimated portion
4. maximum estimated portion
5. calories
6. protein
7. carbohydrates
8. fat
9. confidence
10. short reasoning

Confidence must be:
"high", "medium", or "low".

Use null instead of inventing precision.

The total nutrition must be calculated from the identified food items.

Return ONLY valid JSON.

Required JSON structure:

{
  "items": [
    {
      "name": "string",
      "portion_g": number | null,
      "portion_min_g": number | null,
      "portion_max_g": number | null,
      "calories_kcal": number | null,
      "protein_g": number | null,
      "carbs_g": number | null,
      "fat_g": number | null,
      "confidence": "low | medium | high",
      "reasoning": "string"
    }
  ],

  "total": {
    "calories_kcal": number | null,
    "protein_g": number | null,
    "carbs_g": number | null,
    "fat_g": number | null
  },

  "overall_confidence": "low | medium | high",

  "photo_quality": "poor | acceptable | good",

  "notes": "string",

  "needs_user_confirmation": true | false
}

Do not include markdown.
Do not include code fences.
Do not include explanations outside the JSON.
`
            },

            {
              type: "input_image",
              image_url: image
            }
          ]
        }
      ]
    });

    const text = response.output_text || "";

    if (!text) {
      return res.status(502).json({
        error: "AI tidak mengembalikan hasil analisis."
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch (parseError) {
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        return res.status(502).json({
          error: "AI tidak mengembalikan JSON yang valid.",
          raw: text
        });
      }

      try {
        result = JSON.parse(match[0]);
      } catch (secondError) {
        return res.status(502).json({
          error: "Format hasil AI tidak valid.",
          raw: text
        });
      }
    }

    if (!result.items || !Array.isArray(result.items)) {
      return res.status(502).json({
        error: "Struktur hasil AI tidak sesuai."
      });
    }

    // Membersihkan dan memastikan angka tidak aneh
    result.items = result.items.map((item) => ({
      name: item.name || "Unknown food",

      portion_g:
        typeof item.portion_g === "number"
          ? Math.max(0, item.portion_g)
          : null,

      portion_min_g:
        typeof item.portion_min_g === "number"
          ? Math.max(0, item.portion_min_g)
          : null,

      portion_max_g:
        typeof item.portion_max_g === "number"
          ? Math.max(0, item.portion_max_g)
          : null,

      calories_kcal:
        typeof item.calories_kcal === "number"
          ? Math.max(0, item.calories_kcal)
          : null,

      protein_g:
        typeof item.protein_g === "number"
          ? Math.max(0, item.protein_g)
          : null,

      carbs_g:
        typeof item.carbs_g === "number"
          ? Math.max(0, item.carbs_g)
          : null,

      fat_g:
        typeof item.fat_g === "number"
          ? Math.max(0, item.fat_g)
          : null,

      confidence:
        ["low", "medium", "high"].includes(item.confidence)
          ? item.confidence
          : "low",

      reasoning:
        typeof item.reasoning === "string"
          ? item.reasoning
          : ""
    }));

    return res.status(200).json({
      ...result,

      scanned_at: new Date().toISOString(),

      disclaimer:
        "Nutritional values are estimates based on the food image and estimated portion size. Actual values may vary."
    });

  } catch (error) {

    console.error("FOOD SCAN ERROR:", error);

    return res.status(500).json({
      error: "Terjadi kesalahan saat menganalisis makanan.",
      details: error.message
    });
  }
};
