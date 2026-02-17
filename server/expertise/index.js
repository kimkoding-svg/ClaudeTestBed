/**
 * Expertise module loader
 *
 * Combines base personality with domain-specific expertise modules
 * into a single system prompt for Claude.
 */
const basePersonality = require('./base-personality');
const log = require('../logger').child('EXPERTISE');

const expertiseModules = {
  'sa-tax': require('./sa-tax'),
};

/**
 * Build a personality overlay from trait values (0-100 scale)
 * @param {object} traits - { warmth, humor, formality, directness, energy }
 * @returns {string} Personality modifier instructions
 */
function buildPersonalityOverlay(traits) {
  if (!traits) return '';

  const lines = [];

  // Warmth: 0 = cold/distant, 100 = warm/affectionate
  if (traits.warmth <= 20) {
    lines.push('- Be emotionally detached and matter-of-fact. Skip pleasantries and small talk.');
  } else if (traits.warmth <= 40) {
    lines.push('- Be polite but not overly warm. Keep a professional distance.');
  } else if (traits.warmth >= 80) {
    lines.push('- Be very warm and caring. Show genuine interest in the person. Use terms of endearment occasionally.');
  } else if (traits.warmth >= 60) {
    lines.push('- Be friendly and approachable. Show you care about what they\'re saying.');
  }

  // Humor: 0 = serious, 100 = playful/witty
  if (traits.humor <= 20) {
    lines.push('- Stay completely serious. No jokes, no wordplay, no levity.');
  } else if (traits.humor <= 40) {
    lines.push('- Keep humor minimal. Only the occasional light comment.');
  } else if (traits.humor >= 80) {
    lines.push('- Be very witty and funny. Use wordplay, clever observations, and humorous asides frequently.');
  } else if (traits.humor >= 60) {
    lines.push('- Include humor naturally. Make witty observations and lighthearted comments.');
  }

  // Formality: 0 = casual, 100 = formal
  if (traits.formality <= 20) {
    lines.push('- Be extremely casual. Use slang, abbreviations, and very relaxed grammar.');
  } else if (traits.formality <= 40) {
    lines.push('- Keep it casual and relaxed. Talk like chatting with a friend.');
  } else if (traits.formality >= 80) {
    lines.push('- Be formal and professional. Use proper grammar, avoid slang and contractions.');
  } else if (traits.formality >= 60) {
    lines.push('- Be somewhat formal. Maintain a professional tone but don\'t be stiff.');
  }

  // Directness: 0 = gentle/diplomatic, 100 = blunt/direct
  if (traits.directness <= 20) {
    lines.push('- Be very gentle and diplomatic. Soften any criticism, use lots of qualifiers.');
  } else if (traits.directness <= 40) {
    lines.push('- Be tactful. Frame things positively when possible.');
  } else if (traits.directness >= 80) {
    lines.push('- Be very direct and blunt. Say exactly what you think without sugar-coating.');
  } else if (traits.directness >= 60) {
    lines.push('- Be straightforward. Give direct answers without unnecessary hedging.');
  }

  // Energy: 0 = calm/mellow, 100 = energetic/enthusiastic
  if (traits.energy <= 20) {
    lines.push('- Be very calm and understated. Speak in a measured, relaxed way.');
  } else if (traits.energy <= 40) {
    lines.push('- Be mellow and laid-back. Don\'t get too excited about things.');
  } else if (traits.energy >= 80) {
    lines.push('- Be very energetic and enthusiastic! Show excitement and passion in your responses.');
  } else if (traits.energy >= 60) {
    lines.push('- Be upbeat and engaged. Show genuine enthusiasm when appropriate.');
  }

  if (lines.length === 0) return '';

  return '\n\nPERSONALITY ADJUSTMENTS (override base personality where they conflict):\n' + lines.join('\n');
}

/**
 * Build a system prompt from base personality + selected expertise modules
 * @param {string[]} activeExpertise - Array of expertise module IDs to include
 * @param {object} [personalityConfig] - { preset, traits: { warmth, humor, formality, directness, energy } }
 * @returns {string} Combined system prompt
 */
function getSystemPrompt(activeExpertise = [], personalityConfig = null) {
  let prompt = basePersonality;

  // Apply personality overlay if provided
  if (personalityConfig && personalityConfig.traits) {
    prompt += buildPersonalityOverlay(personalityConfig.traits);
  }

  for (const id of activeExpertise) {
    if (expertiseModules[id]) {
      prompt += '\n\n' + expertiseModules[id];
    } else {
      log.warn('Unknown expertise module', { id });
    }
  }

  prompt += `\n\nTOOLS AVAILABLE:
- You can search the web when you need current information
- Use web search for: news, facts, prices, weather, events, or anything time-sensitive
- Be proactive - if something requires current info, search for it`;

  return prompt;
}

/**
 * List all available expertise modules
 */
function listExpertise() {
  return Object.keys(expertiseModules);
}

module.exports = { getSystemPrompt, listExpertise };
