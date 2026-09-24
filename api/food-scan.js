module.exports = async (req, res) => {
  // =========================================================
  // ONLY POST
  // =========================================================
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only"
    });
  }

  try {
    // =======================================================
    // AMBIL IMAGE DARI FRONTEND
    // =======================================================
    const { image } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Image is required"
      });
    }

    if (!image.startsWith("data:image/")) {
      return res.status(400).json({
        error: "Invalid image format"
      });
    }

    // =======================================================
    // CEK GEMINI API KEY
    // =======================================================
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY belum dipasang di Vercel."
      });
    }

    // =======================================================
    // AMBIL MIME TYPE DAN BASE64 IMAGE
    // =======================================================
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

    if (!match) {
      return res.status(400).json({
        error: "Invalid base64 image"
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // =======================================================
    // GEMINI MODEL
    // =======================================================
    const model = "gemini-3.6-flash";

    // =======================================================
    // PROMPT
    // =======================================================
    const prompt = `
Analyze this food photo for a fitness and nutrition tracker.

Identify all visible food and drink items.

For every visible item, estimate:

- food name
- portion in grams
- calories in kcal
- protein in grams
- carbohydrates in grams
- fat in grams

Important rules:

1. These values are estimates based on the image.
2. Do NOT claim laboratory accuracy.
3. If the portion cannot reasonably be estimated, use null.
4. Do not invent food items that are not visible.
5. If multiple food items are visible, list them separately.
6. Calculate the total nutrition from the estimated items.
7. Return ONLY valid JSON.
8. Do not use Markdown.
9. Do not use code fences.

Use exactly this JSON structure:

{
  "items": [
    {
      "name": "string",
      "portion_g": 0,
      "calories_kcal": 0,
      "protein_g": 0,
      "carbs_g": 0,
      "fat_g": 0
    }
  ],
  "total": {
    "calories_kcal": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0
  },
  "confidence": "medium",
  "notes": "string"
}

The confidence value MUST be exactly one of:

"low"
"medium"
"high"

If a numeric value cannot reasonably be estimated, use null.
`;

    // =======================================================
    // CALL GEMINI API
    // =======================================================
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    );

    // =======================================================
    // BACA RESPONSE
    // =======================================================
    const data = await response.json();

    console.log("GEMINI STATUS:", response.status);
    console.log("GEMINI RESPONSE:", JSON.stringify(data));

    // =======================================================
    // HANDLE GEMINI ERROR
    // =======================================================
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Gemini API error",
        status: response.status,
        details: data
      });
    }

    // =======================================================
    // AMBIL TEXT DARI GEMINI
    // =======================================================
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim() || "";

    if (!text) {
      return res.status(502).json({
        error: "Gemini returned an empty response.",
        raw: data
      });
    }

    console.log("GEMINI TEXT:", text);

    // =======================================================
    // PARSE JSON
    // =======================================================
    let result;

    try {
      result = JSON.parse(text);
    } catch (parseError) {
      // Bersihkan kemungkinan ```json ... ```
      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        result = JSON.parse(cleaned);
      } catch (secondParseError) {
        // Coba cari object JSON
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");

        if (start !== -1 && end !== -1 && end > start) {
          const jsonText = cleaned.substring(start, end + 1);

          try {
            result = JSON.parse(jsonText);
          } catch (thirdParseError) {
            return res.status(502).json({
              error: "Gemini returned invalid JSON.",
              raw: text
            });
          }
        } else {
          return res.status(502).json({
            error: "Gemini returned invalid JSON.",
            raw: text
          });
        }
      }
    }

    // =======================================================
    // VALIDASI HASIL
    // =======================================================
    if (!result || typeof result !== "object") {
      return res.status(502).json({
        error: "Invalid Gemini result."
      });
    }

    if (!Array.isArray(result.items)) {
      result.items = [];
    }

    if (!result.total || typeof result.total !== "object") {
      result.total = {
        calories_kcal: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null
      };
    }

    if (!["low", "medium", "high"].includes(result.confidence)) {
      result.confidence = "medium";
    }

    if (typeof result.notes !== "string") {
      result.notes = "";
    }

    // =======================================================
    // SUCCESS
    // =======================================================
    return res.status(200).json(result);

  } catch (error) {
    // =======================================================
    // SERVER ERROR
    // =======================================================
    console.error("GEMINI SERVER ERROR:", error);

    return res.status(500).json({
      error: "Gemini API error",
      message: error.message || "Unknown error"
    });
  }
};
