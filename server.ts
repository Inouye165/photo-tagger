import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))

const editRequestSchema = z.object({
  conversation: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1),
    })
  ),
  editedPhoto: z
    .object({
      name: z.string(),
      mimeType: z.string().default('image/jpeg'),
      size: z.number().optional(),
      metadata: z.record(z.any()).optional(),
    })
    .nullable(),
  originalPhoto: z
    .object({
      name: z.string(),
      mimeType: z.string().nullable(),
      metadata: z.record(z.any()).optional(),
    })
    .nullable(),
  editorState: z
    .object({
      rotation: z.number().optional(),
      flips: z
        .object({ horizontal: z.boolean().optional(), vertical: z.boolean().optional() })
        .optional(),
      filter: z.string().optional(),
      adjustments: z.record(z.any()).optional(),
    })
    .nullable(),
  imagePreview: z.string().nullable().optional(),
  exifSummary: z
    .object({
      DateTime: z.string().nullable().optional(),
      Make: z.string().nullable().optional(),
      Model: z.string().nullable().optional(),
      LensModel: z.string().nullable().optional(),
      GPS: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
      Orientation: z.any().optional(),
    })
    .nullable()
    .optional(),
  captionState: z
    .object({
      text: z.string(),
      x: z.number(),
      y: z.number(),
      sizePct: z.number(),
      color: z.string(),
      stroke: z.string().optional(),
      weight: z.number().optional(),
      anchor: z.enum(['tl','tc','tr','cl','cc','cr','bl','bc','br']).optional(),
    })
    .nullable()
    .optional(),
})

const assistantResponseSchema = z.object({
  assistantMessage: z.string(),
  actions: z
    .array(
      z.object({
        type: z.enum(['rotate', 'flip', 'filter', 'adjust', 'annotate', 'set_caption', 'move_caption', 'style_caption', 'suggest_position', 'none']),
        value: z.record(z.any()).optional(),
      })
    )
    .default([]),
})

// Request for dynamic welcome generation
const welcomeRequestSchema = z.object({
  imagePreview: z.string().nullable().optional(),
  exifSummary: z
    .object({
      DateTime: z.string().nullable().optional(),
      Make: z.string().nullable().optional(),
      Model: z.string().nullable().optional(),
      LensModel: z.string().nullable().optional(),
      GPS: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
      Orientation: z.any().optional(),
    })
    .nullable()
    .optional(),
})

const welcomeResponseSchema = z.object({
  welcomeMessage: z.string(),
  detailedDescription: z.string().optional(),
  analysis: z.record(z.any()).nullable().optional(),
  keywords: z.array(z.string()).default([]),
})

// ---- Helpers: date formatting and reverse geocoding ----
function formatExifDate(input?: unknown): string | null {
  if (!input || typeof input !== 'string') return null
  // Common EXIF formats: "YYYY:MM:DD HH:mm:ss" or ISO-like
  const trimmed = input.trim()
  let iso = trimmed
  if (/^\d{4}:\d{2}:\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    iso = trimmed.replace(/^([0-9]{4}):([0-9]{2}):([0-9]{2})\s+/, '$1-$2-$3T') + 'Z'
  }
  const dt = new Date(iso)
  if (isNaN(dt.getTime())) return null
  try {
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return null
  }
}

async function reverseGeocode(lat?: number | null, lng?: number | null): Promise<string | null> {
  if (lat == null || lng == null) return null
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'photo-tagger/0.0.1 (+local dev) ',
        'Accept': 'application/json',
        'Accept-Language': 'en',
      },
    } as any)
    if (!resp.ok) return null
    const data = await resp.json() as any
    // Prefer well-known names: national_park, leisure=park, state_district, county, city, etc.
    const addr = data?.address || {}
    const display = data?.name || data?.display_name || null
    const candidates: Array<string | undefined> = [
      addr.national_park,
      addr.nature_reserve,
      addr.state_park,
      addr.park,
      addr.suburb,
      addr.city,
      addr.town,
      addr.village,
      addr.county,
      addr.state,
      display ?? undefined,
    ]
    const place = candidates.find(Boolean)
    return place ?? null
  } catch {
    return null
  }
}

function inferTimeOfDay(input?: unknown): string | null {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim()
  let iso = trimmed
  if (/^\d{4}:\d{2}:\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    iso = trimmed.replace(/^([0-9]{4}):([0-9]{2}):([0-9]{2})\s+/, '$1-$2-$3T') + 'Z'
  }
  const dt = new Date(iso)
  if (isNaN(dt.getTime())) return null
  const h = dt.getUTCHours()
  if (h >= 5 && h < 8) return 'early morning'
  if (h >= 8 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 20) return 'evening'
  return 'night'
}

function generateKeywords(params: {
  analysis: any | null
  exif: any | null
  placeName: string | null
  timeOfDay: string | null
}): string[] {
  const out = new Set<string>()
  const { analysis, exif, placeName, timeOfDay } = params
  const add = (v?: unknown) => {
    if (typeof v === 'string' && v.trim()) out.add(v.trim())
  }
  const addAll = (arr?: unknown) => {
    if (Array.isArray(arr)) arr.forEach(x => typeof x === 'string' && x.trim() && out.add(x.trim()))
  }
  if (placeName) add(placeName)
  if (timeOfDay) add(timeOfDay)
  const make = exif?.Make
  const model = exif?.Model
  if (make) add(String(make))
  if (model) add(String(model))
  if (analysis) {
    add(analysis.subject)
    add(analysis.setting)
    if (analysis.selfie) add('selfie')
    if (analysis.peopleCount != null && Number(analysis.peopleCount) > 0) add(`${analysis.peopleCount} people`)
    if (analysis.water?.present) add(analysis.water.type || 'water')
    add(analysis.landmark)
    addAll(analysis.notableObjects)
    addAll(analysis.animals)
    addAll(analysis.trees)
  }
  return Array.from(out)
}

function synthesizeDescription(params: {
  analysis: any | null
  placeName: string | null
  formattedDate: string | null
  timeOfDay: string | null
  exif: any | null
}): string {
  const { analysis, placeName, formattedDate, timeOfDay, exif } = params
  const bits: string[] = []
  if (analysis) {
    const people = typeof analysis.peopleCount === 'number' ? analysis.peopleCount : null
    const selfie = analysis.selfie === true
    const who = selfie && people && people >= 2 ? 'a selfie of two people' : (selfie ? 'a selfie' : (people ? `${people} people` : null))
    if (who) bits.push(who)
    if (analysis.subject) bits.push(String(analysis.subject))
    if (analysis.water?.present) bits.push(analysis.water.type ? `${analysis.water.type}` : 'water')
    if (Array.isArray(analysis.trees) && analysis.trees.length) bits.push(analysis.trees[0] + ' trees')
    if (Array.isArray(analysis.animals) && analysis.animals.length) bits.push(analysis.animals.join(', '))
    if (analysis.landmark) bits.push(String(analysis.landmark))
  }
  if (placeName) bits.push(`near ${placeName}`)
  if (formattedDate) bits.push(`on ${formattedDate}${timeOfDay ? ` (${timeOfDay})` : ''}`)
  const device = exif?.Model ? String(exif.Model) : null
  if (device) bits.push(`captured with ${device}`)
  const core = bits.filter(Boolean).join(', ')
  return core ? `This photo shows ${core}.` : 'This photo captures a memorable moment.'
}

const hasApiKey = !!process.env.OPENAI_API_KEY
function buildModel(modelName: string): ChatOpenAI {
  return new ChatOpenAI({
    model: modelName,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0.2,
  })
}

// Allow separate, configurable models for vision (image analysis) and text (description)
const VISION_PRIMARY = process.env.OPENAI_MODEL_VISION ?? process.env.OPENAI_MODEL ?? 'gpt-4o'
const VISION_FALLBACK = 'gpt-4o'
const TEXT_PRIMARY = process.env.OPENAI_MODEL_TEXT ?? process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'
const TEXT_FALLBACK = 'gpt-4.1-mini'

const modelVisionPrimary: ChatOpenAI | null = hasApiKey ? buildModel(VISION_PRIMARY) : null
const modelTextPrimary: ChatOpenAI | null = hasApiKey ? buildModel(TEXT_PRIMARY) : null
console.log('[config] openaiKeyPresent:', hasApiKey, 'visionModel:', VISION_PRIMARY, 'textModel:', TEXT_PRIMARY)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, modelAvailable: hasApiKey, visionModel: VISION_PRIMARY, textModel: TEXT_PRIMARY })
})

app.post('/api/assistant', async (req, res) => {
  try {
    const { conversation, editedPhoto, originalPhoto, editorState, imagePreview, exifSummary, captionState } = editRequestSchema.parse(req.body)

    const systemPrompt = `You are PhotoFlow Assistant, a careful photo-editing guide.
You help the user edit the *edited* photo. Never overwrite or modify the original photo directly.
Always return a single JSON object only (no prose, no markdown), matching this TypeScript type:
{
  "assistantMessage": string,
  "actions": Array<{
    "type": "set_caption" | "move_caption" | "style_caption" | "suggest_position" | "rotate" | "flip" | "filter" | "adjust" | "annotate" | "none",
    "value"?: Record<string, any>
  }>
}

Guidance for captions:
- Coordinates x,y are normalized 0..1 relative to image (0,0 top-left).
- Prefer anchors: 'bc' for bottom center with natural margins; avoid covering faces/horizons.
- When user says “add caption \"TEXT\"”, use set_caption with fields: { text, x, y, anchor, sizePct, color, stroke }.
- For movement after a caption exists: use move_caption with RELATIVE deltas { dx, dy, anchor? } where dx,dy are normalized offsets added to current position (e.g., 0.05 to move right by 5% of width). If absolute placement is needed, also include { x, y }.
- For styling: style_caption { sizePct?, color?, stroke?, weight? }.
- When the user requests a change, avoid returning type "none"; always include at least one actionable step.
Keep "assistantMessage" short and do not include any extra fields.`

    const messages = [new SystemMessage(systemPrompt)]
    for (const turn of conversation) {
      messages.push(turn.role === 'assistant' ? new SystemMessage(turn.content) : new HumanMessage(turn.content))
    }

    const contextSnippet = JSON.stringify({ editedPhoto, originalPhoto, editorState, exifSummary, captionState, imagePreviewIncluded: !!imagePreview })
    messages.push(new HumanMessage(`Context: ${contextSnippet}`))
    if (imagePreview) {
      messages.push(new HumanMessage({
        content: [
          { type: 'text', text: 'Here is a small preview of the current edited photo for placement and styling decisions.' },
          { type: 'image_url', image_url: { url: imagePreview } as any },
        ] as any,
      } as any))
    }

    // Use vision model for assistant (supports image_url inputs)
    if (!modelVisionPrimary) {
      res.status(503).json({ error: 'OpenAI API key not configured', errorCode: 'LLM_API_KEY_MISSING' })
      return
    }
    let llmResponse
    try {
      llmResponse = await modelVisionPrimary.invoke(messages)
    } catch (err: any) {
      const status = (err?.status ?? err?.code) as number | string | undefined
      const message = String(err?.message ?? '')
      if (status === 401 || status === 403 || /unauthorized|api key|invalid key/i.test(message)) {
        res.status(503).json({ error: 'OpenAI authentication failed', errorCode: 'LLM_AUTH_FAILED' })
        return
      }
      // Retry once with fallback model if different
      try {
        if (VISION_FALLBACK && VISION_FALLBACK !== VISION_PRIMARY) {
          const modelFallback = buildModel(VISION_FALLBACK)
          llmResponse = await modelFallback.invoke(messages)
        } else {
          throw err
        }
      } catch {
        res.status(500).json({ error: 'LLM request failed', errorCode: 'LLM_REQUEST_FAILED' })
        return
      }
    }

    let parsed
    if (typeof llmResponse.content === 'string') {
      try {
        parsed = assistantResponseSchema.safeParse(JSON.parse(llmResponse.content))
      } catch (error) {
        console.warn('Assistant response was not valid JSON. Falling back to plain text.', error)
      }
    }

    if (!parsed || !parsed.success) {
      res.json({
        assistantMessage:
          typeof llmResponse.content === 'string'
            ? llmResponse.content
            : 'Let me know how to edit the photo.',
        actions: [],
      })
      return
    }

    res.json(parsed.data)
  } catch (error: any) {
    console.error('Assistant error:', error)
    res.status(400).json({ error: error?.message ?? 'Failed to process request' })
  }
})

// Two-stage pipeline: (1) visual analysis, then (2) welcome message using EXIF + analysis
app.post('/api/welcome', async (req, res) => {
  try {
    const { imagePreview, exifSummary } = welcomeRequestSchema.parse(req.body)
    console.log('[welcome] request received', {
      hasPreview: !!imagePreview,
      previewLen: imagePreview?.length ?? 0,
      hasExif: !!exifSummary,
    })

    // Stage 1: Visual analysis (if preview available)
    let analysis: any = null
    if (imagePreview) {
      const analysisSystem = `You are a precise photo analyst. Identify concrete elements you can clearly see.
Return ONLY a compact JSON object as:
{ "analysis": {
    "subject": string,                // e.g., mountain range, waterfall, forest trail
    "setting": string,                // e.g., outdoors, viewpoint, lakeside, forest, urban
    "peopleCount": number,            // integer 0..N
    "selfie": boolean,                // true if a close selfie featuring the photographer(s)
    "notableObjects": string[],       // rocks, bridge, boardwalk, etc.
    "water": { "present": boolean, "type"?: "river"|"lake"|"waterfall"|"ocean"|"stream" } | null,
    "animals": string[] | null,       // list species/animals if clearly visible
    "trees": string[] | null,         // e.g., pine, fir, aspen if identifiable; else []
    "landmark": string | null,        // named landmark if obvious (leave null if uncertain)
    "composition": string,            // e.g., wide selfie foreground, background vista
    "lighting": string,               // e.g., sunny, golden-hour, overcast, harsh midday
    "mood": string                    // e.g., joyful, serene
  } }`

      const analysisMessages = [
        new SystemMessage(analysisSystem),
        new HumanMessage({
          content: [
            { type: 'text', text: 'Analyze this photo and return JSON.' },
            { type: 'image_url', image_url: { url: imagePreview } as any },
          ] as any,
        } as any),
      ]

      if (!modelVisionPrimary) {
        // No model available; skip analysis and fall through to error reporting below
      } else {
        try {
          console.log('[welcome] running analysis with model:', VISION_PRIMARY)
          const visionForJson = modelVisionPrimary.bind({ response_format: { type: 'json_object' } as any })
          const analysisResp = await visionForJson.invoke(analysisMessages)
        if (typeof analysisResp.content === 'string') {
          let parsed: any
          try { parsed = JSON.parse(analysisResp.content) } catch (e) { console.warn('[welcome] analysis JSON parse failed', e) }
          if (parsed && typeof parsed === 'object' && parsed.analysis) {
            analysis = parsed.analysis
          }
          } else {
            console.warn('[welcome] analysis content not string', typeof (analysisResp as any)?.content)
        }
        } catch (e: any) {
          const status = (e?.status ?? e?.code) as number | string | undefined
          const message = String(e?.message ?? '')
          if (status === 401 || status === 403 || /unauthorized|api key|invalid key/i.test(message)) {
            res.status(503).json({ error: 'OpenAI authentication failed', errorCode: 'LLM_AUTH_FAILED' })
            return
          }
          // Retry once with fallback model if different
          try {
            if (VISION_FALLBACK && VISION_FALLBACK !== VISION_PRIMARY) {
              console.warn('[welcome] analysis primary failed, retrying with fallback:', VISION_FALLBACK)
              const modelFallback = buildModel(VISION_FALLBACK)
              const visionFallbackForJson = modelFallback.bind({ response_format: { type: 'json_object' } as any })
              const analysisResp = await visionFallbackForJson.invoke(analysisMessages)
              if (typeof analysisResp.content === 'string') {
                const parsed = JSON.parse(analysisResp.content)
                if (parsed && typeof parsed === 'object' && parsed.analysis) {
                  analysis = parsed.analysis
                }
              } else {
                console.warn('[welcome] analysis fallback content not string', typeof (analysisResp as any)?.content)
              }
            }
          } catch {
            analysis = null
          }
        }
      }
    }
    console.log('[welcome] analysis result present:', !!analysis, analysis ? Object.keys(analysis) : null)

    // Enrich context: format date and reverse geocode location if GPS present
    const formattedDate = formatExifDate((exifSummary as any)?.DateTime)
    const timeOfDay = inferTimeOfDay((exifSummary as any)?.DateTime)
    const gpsLat = (exifSummary as any)?.GPS?.lat ?? null
    const gpsLng = (exifSummary as any)?.GPS?.lng ?? null
    const placeName = await reverseGeocode(gpsLat, gpsLng)

    // Stage 2: Welcome message using EXIF + analysis
    const welcomeSystem = `You are a friendly photo assistant. Create a concise, dynamic welcome message for the user.
Style and Requirements:
- 1–2 sentences, warm and descriptive.
- Use visual analysis to mention what the photo shows (e.g., subject, setting, selfie/people, water features, animals, trees).
- If available, also weave in location (placeName), date (formattedDate), and time of day.
- Avoid speculative or generic lines; prefer concrete details from 'analysis' and/or EXIF.
- You MUST mention at least two concrete visual elements from analysis when present (e.g., "waterfall", "selfie with two people", "evergreen trees"). If analysis is null, mention that visual details are unavailable.
- End with an inviting question like: "What can I help you do with it today?"
Output:
Return ONLY JSON: { "welcomeMessage": string, "detailedDescription": string }`

    const context = {
      exifSummary: exifSummary ?? null,
      analysis: analysis ?? null,
      formattedDate,
      timeOfDay,
      placeName,
      // Provide a concrete example for tone (not to mimic content, just the structure)
      example: 'Welcome! This is a stunning photo from your trip to {placeName} on {formattedDate}. The {subjectOrView} looks absolutely breathtaking. What can I help you do with it today?',
    }
    const welcomeMessages = [
      new SystemMessage(welcomeSystem),
      new HumanMessage(`Context: ${JSON.stringify(context)}`),
    ]

    if (!modelTextPrimary) {
      res.status(503).json({ error: 'OpenAI API key not configured', errorCode: 'LLM_API_KEY_MISSING' })
      return
    }
    let welcomeResp
    try {
      console.log('[welcome] generating welcome with model:', TEXT_PRIMARY)
      const textForJson = modelTextPrimary.bind({ response_format: { type: 'json_object' } as any })
      welcomeResp = await textForJson.invoke(welcomeMessages)
    } catch (e: any) {
      const status = (e?.status ?? e?.code) as number | string | undefined
      const message = String(e?.message ?? '')
      if (status === 401 || status === 403 || /unauthorized|api key|invalid key/i.test(message)) {
        res.status(503).json({ error: 'OpenAI authentication failed', errorCode: 'LLM_AUTH_FAILED' })
        return
      }
      // Retry once with fallback text model
      try {
        if (TEXT_FALLBACK && TEXT_FALLBACK !== TEXT_PRIMARY) {
          console.warn('[welcome] text primary failed, retrying with fallback:', TEXT_FALLBACK)
          const modelFallback = buildModel(TEXT_FALLBACK)
          const textFallbackForJson = modelFallback.bind({ response_format: { type: 'json_object' } as any })
          welcomeResp = await textFallbackForJson.invoke(welcomeMessages)
        } else {
          throw e
        }
      } catch {
        res.status(500).json({ error: 'LLM request failed', errorCode: 'LLM_REQUEST_FAILED' })
        return
      }
    }

    let welcomeMessage = 'Hi! Ready to help you edit this photo—what would you like to change?'
    let detailedDescription: string | undefined
    let keywords: string[] = generateKeywords({ analysis, exif: exifSummary ?? null, placeName, timeOfDay })
    if (typeof welcomeResp.content === 'string') {
      try {
        const parsed = JSON.parse(welcomeResp.content)
        const safe = welcomeResponseSchema.safeParse({ ...parsed, analysis, keywords })
        if (safe.success) {
          welcomeMessage = safe.data.welcomeMessage
          keywords = safe.data.keywords ?? keywords
          detailedDescription = safe.data.detailedDescription
        }
      } catch (e) {
        console.warn('[welcome] welcome JSON parse failed', e)
      }
    }

    // Validate description; if missing or too generic, synthesize from analysis/EXIF
    const tokens: string[] = []
    if (analysis) {
      if (analysis.subject) tokens.push(String(analysis.subject))
      if (analysis.selfie) tokens.push('selfie')
      if (typeof analysis.peopleCount === 'number' && analysis.peopleCount > 0) tokens.push(`${analysis.peopleCount} people`)
      if (analysis.water?.present) tokens.push(analysis.water.type || 'water')
      if (Array.isArray(analysis.trees)) tokens.push(...analysis.trees)
      if (Array.isArray(analysis.animals)) tokens.push(...analysis.animals)
      if (analysis.landmark) tokens.push(String(analysis.landmark))
    }
    const hasVisuals = (text?: string) => {
      if (!text) return false
      const lower = text.toLowerCase()
      let count = 0
      for (const t of tokens) {
        if (t && lower.includes(String(t).toLowerCase())) count += 1
        if (count >= 2) return true
      }
      return false
    }
    let descriptionSource: 'model' | 'fallback' = 'model'
    if (!hasVisuals(detailedDescription)) {
      detailedDescription = synthesizeDescription({ analysis, placeName, formattedDate, timeOfDay, exif: exifSummary ?? null })
      descriptionSource = 'fallback'
    }

    console.log('[welcome] response summary', {
      hasDescription: !!detailedDescription,
      descriptionSource,
      keywordCount: keywords.length,
      hasAnalysis: !!analysis,
    })
    res.json({ welcomeMessage, analysis, keywords, detailedDescription, descriptionSource })
  } catch (error: any) {
    console.error('Welcome pipeline error:', error)
    res.status(400).json({ error: error?.message ?? 'Failed to generate welcome message' })
  }
})

const port = Number(process.env.PORT ?? 3001)
app.listen(port, '0.0.0.0', () => {
  console.log(`Photo agent server running on port ${port}`)
})

export default app

