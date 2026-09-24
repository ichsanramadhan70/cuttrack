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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY belum dipasang di Vercel."
      });
    }

    /*
     * Image dari frontend berbentuk:
     * data:image/jpeg;base64,XXXXX
     *
     * Kita pisahkan MIME type dan data base64.
     */
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

    if (!match) {
      return res.status(400).json({
        error: "Format gambar tidak valid."
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const prompt = `
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
`;

    /*
     * Gemini API
     *
     * gemini-2.5-flash mendukung input gambar.
     */
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(process.env.GEMINI_API_KEY),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2
          }
        })
      }
    );

    const data = await response.json();

    console.log("GEMINI STATUS:", response.status);

    if (!response.ok) {
      console.error("GEMINI ERROR RESPONSE:", data);

      return res.status(response.status).json({
        error: "Gemini API error",
        status: response.status,
        message:
          data?.error?.message ||
          "Gemini API mengembalikan error."
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() || "";

    console.log("GEMINI RESPONSE:", text);

    if (!text) {
      return res.status(502).json({
        error: "Gemini mengembalikan response kosong."
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch (parseError) {
      console.error("JSON PARSE ERROR:", parseError);

      const matchJson = text.match(/\{[\s\S]*\}/);

      if (!matchJson) {
        return res.status(502).json({
          error: "Gemini mengembalikan JSON yang tidak valid.",
          raw: text
        });
      }

      try {
        result = JSON.parse(matchJson[0]);
      } catch (secondParseError) {
        return res.status(502).json({
          error: "Tidak dapat membaca JSON dari Gemini.",
          raw: text
        });
      }
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error("GEMINI SERVER ERROR:", error);

    return res.status(500).json({
      error: "Gemini API error",
      message: error.message || "Unknown error"
    });
  }
};
