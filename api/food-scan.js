const OpenAI = require("openai");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({error:"POST only"});
  try {
    const { image } = req.body || {};
    if (!image || !image.startsWith("data:image/")) return res.status(400).json({error:"Image is required"});
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY belum dipasang di environment server."});

    const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input:[{
        role:"user",
        content:[
          {type:"input_text",text:`Analyze this food photo for a fitness food tracker.
Return ONLY valid JSON with:
{
 "items":[{"name":string,"portion_g":number|null,"calories_kcal":number|null,"protein_g":number|null,"carbs_g":number|null,"fat_g":number|null}],
 "total":{"calories_kcal":number|null,"protein_g":number|null,"carbs_g":number|null,"fat_g":number|null},
 "confidence":"low|medium|high",
 "notes":string
}
These are estimates from an image, not exact measurements. If uncertain, use null rather than inventing precision.`},
          {type:"input_image",image_url:image}
        ]
      }]
    });
    const text=response.output_text||"";
    const match=text.match(/\{[\s\S]*\}/);
    if(!match) return res.status(502).json({error:"AI did not return structured JSON.",raw:text});
    return res.status(200).json(JSON.parse(match[0]));
  } catch(e) {
    return res.status(500).json({error:e.message});
  }
};