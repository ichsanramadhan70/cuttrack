module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only"
    });
  }

  try {
    // =====================================================
    // 1. AMBIL IMAGE
    // =====================================================
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

    // =====================================================
    // 2. GEMINI API KEY
    // =====================================================
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY belum dipasang di Vercel."
      });
    }

    // =====================================================
    // 3. PISAHKAN MIME TYPE DAN BASE64
    // =====================================================
    const match = image.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "Invalid base64 image"
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // =====================================================
    // 4. MODEL GEMINI
    // =====================================================
    const models = [
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash"
    ];

    // =====================================================
    // 5. PROMPT
    // =====================================================
    const prompt = `
Analyze this food photo for a fitness and nutrition tracker.

Identify all visible food and drink items.

For every visible food item, estimate:

- food name
- portion in grams
- calories in kcal
- protein in grams
- carbohydrates in grams
- fat in grams

Rules:

1. Values are estimates from the image.
2. Do not claim laboratory accuracy.
3. Do not invent food that is not visible.
4. If portion cannot reasonably be estimated, use null.
5. If several foods are visible, list them separately.
6. Calculate the total nutrition from all estimated items.
7. Return ONLY valid JSON.
8. Do not use Markdown.
9. Do not use code fences.

Return exactly this structure:

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

confidence MUST be exactly:

"low"
"medium"
"high"

If a number cannot reasonably be estimated, use null.
`;

    // =====================================================
    // 6. COBA MODEL GEMINI
    // =====================================================
    let response;
    let data;
    let lastError;

    for (const model of models) {
      try {
        console.log("TRYING GEMINI MODEL:", model);

        response = await fetch(
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

        data = await response.json();

        console.log(
          "GEMINI STATUS:",
          response.status,
          "MODEL:",
          model
        );

        console.log(
          "GEMINI RESPONSE:",
          JSON.stringify(data)
        );

        // Kalau berhasil, berhenti
        if (response.ok) {
          break;
        }

        lastError = data;

        // Kalau model tidak tersedia, coba model berikutnya
        if (
          response.status === 404 ||
          response.status === 503
        ) {
          continue;
        }

        // Error lain langsung dikembalikan
        return res.status(response.status).json({
          error: "Gemini API error",
          status: response.status,
          details: data
        });

      } catch (error) {
        lastError = {
          message: error.message
        };

        console.error(
          "GEMINI REQUEST ERROR:",
          error
        );
      }
    }

    // =====================================================
    // 7. SEMUA MODEL GAGAL
    // =====================================================
    if (!response || !response.ok) {
      return res.status(503).json({
        error: "Gemini API tidak tersedia.",
        details: lastError
      });
    }

    // =====================================================
    // 8. AMBIL TEXT RESPONSE
    // =====================================================
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

    // =====================================================
    // 9. PARSE JSON
    // =====================================================
    let result;

    try {
      result = JSON.parse(text);
    } catch (error) {

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        result = JSON.parse(cleaned);

      } catch (error2) {

        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");

        if (start !== -1 && end !== -1) {

          const jsonText =
            cleaned.substring(start, end + 1);

          try {
            result = JSON.parse(jsonText);

          } catch (error3) {
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

    // =====================================================
    // 10. VALIDASI HASIL
    // =====================================================
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

    if (
      !["low", "medium", "high"].includes(
        result.confidence
      )
    ) {
      result.confidence = "medium";
    }

    if (typeof result.notes !== "string") {
      result.notes = "";
    }

    // =====================================================
    // 11. BERHASIL
    // =====================================================
    return res.status(200).json(result);

  } catch (error) {

    console.error(
      "GEMINI SERVER ERROR:",
      error
    );

    return res.status(500).json({
      error: "Gemini API error",
      message:
        error.message || "Unknown error"
    });
  }
};
