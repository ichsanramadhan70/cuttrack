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
        error: "Image is required"
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY belum dipasang di Vercel."
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
Analyze this food photo for a fitness and nutrition tracker.

Identify all visible food items.

Estimate:
- food name
- portion in grams
- calories in kcal
- protein in grams
- carbohydrates in grams
- fat in grams

Important:
These are estimates from an image and are NOT exact measurements.
Do not pretend the values are laboratory-accurate.
If the portion cannot be reasonably estimated, use null.

Return ONLY valid JSON.
Do not use markdown.
Do not use code fences.

Required JSON structure:

{
  "items": [
    {
      "name": "string",
      "portion_g": number or null,
      "calories_kcal": number or null,
      "protein_g": number or null,
      "carbs_g": number or null,
      "fat_g": number or null
    }
  ],
  "total": {
    "calories_kcal": number or null,
    "protein_g": number or null,
    "carbs_g": number or null,
    "fat_g": number or null
  },
  "confidence": "low",
  "notes": "string"
}

The confidence must be exactly one of:
"low"
"medium"
"high"
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

    console.log("OPENAI RESPONSE:", text);

    if (!text) {
      return res.status(502).json({
        error: "OpenAI returned an empty response."
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch (parseError) {
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        return res.status(502).json({
          error: "OpenAI returned invalid JSON.",
          raw: text
        });
      }

      try {
        result = JSON.parse(match[0]);
      } catch (secondParseError) {
        return res.status(502).json({
          error: "Could not parse OpenAI JSON.",
          raw: text
        });
      }
    }

    return res.status(200).json(result);

  } catch (error) {

    console.error("OPENAI ERROR:", error);

    return res.status(error.status || 500).json({
      error: "OpenAI API error",
      status: error.status || 500,
      code: error.code || null,
      type: error.type || null,
      message: error.message || "Unknown OpenAI error"
    });
  }
};
