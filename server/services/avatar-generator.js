/**
 * Avatar Generator — Creates anime-style portraits via OpenAI DALL-E.
 * Builds descriptive prompts from personality traits, gender, age, etc.
 */

const OpenAI = require('openai');
const log = require('../logger').child('AVATAR');

let openaiClient = null;

function getClient() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    const OpenAIClass = OpenAI.default || OpenAI;
    openaiClient = new OpenAIClass({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Build a DALL-E prompt from person traits.
 */
function buildAvatarPrompt(person) {
  const genderDesc = person.gender === 'male' ? 'young man' : 'young woman';
  const ageDesc = person.age < 26 ? 'early twenties'
    : person.age < 32 ? 'late twenties'
    : person.age < 40 ? 'thirties'
    : 'early forties';

  // Condition → visual cue
  const conditionVisuals = {
    'ADHD': 'bright curious wide eyes, energetic expression',
    'Anxiety': 'slightly tense expression, cautious gentle gaze',
    'NPD': 'confident sharp smirk, regal bearing',
    'BPD': 'intense expressive eyes, emotional depth',
    'Bipolar': 'dramatic lighting contrast on face',
    'Autism': 'focused contemplative gaze, thoughtful',
    'Psychopath': 'cold piercing eyes, charming subtle smile',
  };
  const conditionVisual = person.condition ? (conditionVisuals[person.condition.name] || '') : '';

  // Mood → expression
  const moodExpression = person.mood > 70 ? 'warm cheerful smile'
    : person.mood > 50 ? 'neutral calm expression'
    : person.mood > 30 ? 'slightly annoyed look'
    : 'irritated intense expression';

  // Dominant traits → visual hints
  const t = person.traits;
  const traitVisuals = [];
  if (t.confidence > 70) traitVisuals.push('confident posture, chin up');
  if (t.confidence < 30) traitVisuals.push('shy reserved, looking slightly away');
  if (t.sarcasm > 70) traitVisuals.push('knowing smirk, one eyebrow raised');
  if (t.friendliness > 70) traitVisuals.push('warm inviting genuine smile');
  if (t.friendliness < 30) traitVisuals.push('cold distant look');
  if (t.intelligence > 70) traitVisuals.push('sharp analytical eyes, glasses optional');
  if (t.pettiness > 70) traitVisuals.push('slightly judgmental side-eye');
  if (t.humor > 70) traitVisuals.push('playful mischievous grin');

  // Region → appearance hints
  const regionAppearance = {
    'Lagos, Nigeria': 'dark skin, West African features',
    'Nairobi, Kenya': 'dark skin, East African features',
    'Cape Town, South Africa': 'dark skin, South African features',
    'Johannesburg, South Africa': 'dark skin, South African features',
    'Kingston, Jamaica': 'dark skin, Caribbean features',
    'Mumbai, India': 'South Asian features, brown skin',
    'Seoul, South Korea': 'East Asian features, Korean style hair',
    'Osaka, Japan': 'East Asian features, Japanese style',
    'Manila, Philippines': 'Southeast Asian features',
    'São Paulo, Brazil': 'Latin American features, warm skin tone',
    'Mexico City': 'Latin American features',
    'Dublin, Ireland': 'pale skin, light features',
    'Glasgow, Scotland': 'fair skin, Celtic features',
  };
  const regionHint = Object.entries(regionAppearance)
    .find(([key]) => person.region.includes(key.split(',')[0]))?.[1] || '';

  // Occupation → clothing hint
  const occupationHint = `wearing clothes appropriate for a ${person.occupation.toLowerCase()}`;

  // Top interests for background/accessories
  const interestHint = person.interests.slice(0, 2).join(' and ');

  const parts = [
    `Japanese anime cel-shaded illustration of a ${genderDesc} in their ${ageDesc}`,
    regionHint,
    occupationHint,
    moodExpression,
    conditionVisual,
    ...traitVisuals,
    interestHint ? `subtle references to ${interestHint}` : '',
    'close-up bust shot portrait, in the style of modern Japanese anime like Makoto Shinkai or Violet Evergarden',
    'cel-shaded coloring with sharp clean linework, large expressive anime eyes, stylized anime hair',
    'flat solid pastel color background, 2D anime illustration, absolutely NOT photorealistic, NOT 3D render, NOT realistic',
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Generate an avatar image for a person using DALL-E.
 * Returns a base64 data URI string, or null on failure.
 */
async function generateAvatar(person) {
  const client = getClient();
  if (!client) {
    log.warn('No OpenAI client — skipping avatar generation');
    return null;
  }

  const prompt = buildAvatarPrompt(person);
  log.info('Generating avatar', { name: person.name, gender: person.gender, promptLength: prompt.length });

  try {
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'b64_json',
    });

    const b64 = response.data[0]?.b64_json;
    if (b64) {
      log.info('Avatar generated successfully', { name: person.name });
      return `data:image/png;base64,${b64}`;
    }
    return null;
  } catch (err) {
    log.error('Avatar generation failed', { name: person.name, error: err.message });
    return null;
  }
}

module.exports = { generateAvatar, buildAvatarPrompt };
