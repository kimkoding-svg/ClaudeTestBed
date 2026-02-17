/**
 * Text normalizer for TTS
 *
 * Converts text into a form that sounds natural when spoken aloud.
 * Handles numbers, currency, special characters, markdown, etc.
 */

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/**
 * Convert an integer to English words
 */
function numberToWords(n) {
  if (n === 0) return 'zero';
  if (n < 0) return 'negative ' + numberToWords(-n);

  let result = '';

  if (n >= 1_000_000_000) {
    result += numberToWords(Math.floor(n / 1_000_000_000)) + ' billion ';
    n %= 1_000_000_000;
  }
  if (n >= 1_000_000) {
    result += numberToWords(Math.floor(n / 1_000_000)) + ' million ';
    n %= 1_000_000;
  }
  if (n >= 1_000) {
    result += numberToWords(Math.floor(n / 1_000)) + ' thousand ';
    n %= 1_000;
  }
  if (n >= 100) {
    result += ONES[Math.floor(n / 100)] + ' hundred ';
    n %= 100;
    if (n > 0) result += 'and ';
  }
  if (n >= 20) {
    result += TENS[Math.floor(n / 10)] + ' ';
    n %= 10;
  }
  if (n > 0) {
    result += ONES[n] + ' ';
  }

  return result.trim();
}

/**
 * Convert a decimal number to words
 */
function decimalToWords(numStr) {
  const parts = numStr.split('.');
  const whole = parseInt(parts[0], 10);
  let result = numberToWords(whole);

  if (parts.length > 1 && parts[1]) {
    const decimal = parts[1];
    // For money-like decimals (2 digits), say "and X cents" style
    if (decimal.length <= 2) {
      const cents = parseInt(decimal.padEnd(2, '0'), 10);
      if (cents > 0) {
        result += ' point ' + numberToWords(cents);
      }
    } else {
      // Read digits individually for longer decimals
      result += ' point ' + decimal.split('').map(d => ONES[parseInt(d)] || d).join(' ');
    }
  }

  return result;
}

/**
 * Normalize text for natural TTS output
 */
function normalizeForTTS(text) {
  if (!text) return text;

  let result = text;

  // Strip markdown formatting
  result = result.replace(/\*\*\*(.*?)\*\*\*/g, '$1');  // ***bold italic***
  result = result.replace(/\*\*(.*?)\*\*/g, '$1');       // **bold**
  result = result.replace(/\*(.*?)\*/g, '$1');            // *italic*
  result = result.replace(/__(.*?)__/g, '$1');            // __underline__
  result = result.replace(/~~(.*?)~~/g, '$1');            // ~~strikethrough~~
  result = result.replace(/`(.*?)`/g, '$1');              // `code`
  result = result.replace(/^#{1,6}\s+/gm, '');           // # headings
  result = result.replace(/^\s*[-*+]\s+/gm, '');         // - bullet points
  result = result.replace(/^\s*\d+\.\s+/gm, '');         // 1. numbered lists
  // Remaining standalone asterisks / bullets
  result = result.replace(/\s\*\s/g, ', ');

  // Remove URLs
  result = result.replace(/https?:\/\/\S+/g, '');

  // Remove all emojis and unicode symbols
  result = result.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');   // Emoticons, symbols, flags, etc.
  result = result.replace(/[\u{2600}-\u{27BF}]/gu, '');     // Misc symbols, dingbats
  result = result.replace(/[\u{2300}-\u{23FF}]/gu, '');     // Misc technical
  result = result.replace(/[\u{2B00}-\u{2BFF}]/gu, '');     // Arrows, shapes
  result = result.replace(/[\u{FE00}-\u{FE0F}]/gu, '');     // Variation selectors
  result = result.replace(/[\u{200D}]/gu, '');               // Zero-width joiner
  result = result.replace(/[\u{20E3}]/gu, '');               // Combining enclosing keycap
  result = result.replace(/[\u{E0020}-\u{E007F}]/gu, '');   // Tag characters

  // South African Rand: R500,000 or R 500,000 or R500 000 or R1,500.50
  result = result.replace(/R\s?(\d[\d,.\s]*\d|\d)/g, (match, num) => {
    const cleaned = num.replace(/[\s,]/g, '').trim();
    if (!cleaned || isNaN(cleaned)) return match;
    if (cleaned.includes('.') && cleaned.split('.')[1]?.length <= 2) {
      return decimalToWords(cleaned) + ' rand ';
    }
    return numberToWords(parseInt(cleaned, 10)) + ' rand ';
  });

  // Dollar amounts: $500,000
  result = result.replace(/\$\s?(\d[\d,.\s]*\d|\d)/g, (match, num) => {
    const cleaned = num.replace(/[\s,]/g, '').trim();
    if (!cleaned || isNaN(cleaned)) return match;
    return numberToWords(parseInt(cleaned, 10)) + ' dollars ';
  });

  // Percentages: 45% → forty five percent
  result = result.replace(/([\d,.]+)\s*%/g, (match, num) => {
    const cleaned = num.replace(/,/g, '');
    if (isNaN(cleaned)) return match;
    if (cleaned.includes('.')) {
      return decimalToWords(cleaned) + ' percent';
    }
    return numberToWords(parseInt(cleaned, 10)) + ' percent';
  });

  // Large standalone numbers with commas or spaces: 500,000 or 500 000
  result = result.replace(/\b(\d{1,3}(?:[,\s]\d{3})+)(?:\.\d+)?\b/g, (match) => {
    const cleaned = match.replace(/[\s,]/g, '');
    if (isNaN(cleaned)) return match;
    if (match.includes('.')) {
      return decimalToWords(cleaned);
    }
    return numberToWords(parseInt(cleaned, 10));
  });

  // Remaining standalone numbers (not already converted)
  // Only convert numbers that are standalone words (not part of dates, IDs, etc.)
  result = result.replace(/\b(\d+(?:\.\d+)?)\b/g, (match, num) => {
    if (isNaN(num)) return match;
    // Don't convert years (1900-2099)
    const n = parseFloat(num);
    if (n >= 1900 && n <= 2099 && !num.includes('.')) {
      // Say years naturally: 2024 → "twenty twenty four"
      const century = Math.floor(n / 100);
      const year = n % 100;
      if (year === 0) {
        return numberToWords(century) + ' hundred';
      }
      return numberToWords(century) + ' ' + numberToWords(year);
    }
    if (num.includes('.')) {
      return decimalToWords(num);
    }
    return numberToWords(parseInt(num, 10));
  });

  // Symbol replacements
  result = result.replace(/&/g, ' and ');
  result = result.replace(/@/g, ' at ');
  result = result.replace(/\+/g, ' plus ');
  result = result.replace(/=/g, ' equals ');
  result = result.replace(/</g, ' less than ');
  result = result.replace(/>/g, ' greater than ');
  result = result.replace(/\//g, ' ');
  result = result.replace(/\|/g, ' ');
  result = result.replace(/\\/g, ' ');
  result = result.replace(/[[\]{}()]/g, ' ');
  result = result.replace(/[_~^]/g, ' ');

  // Common abbreviations
  result = result.replace(/\be\.g\.\s?/gi, 'for example ');
  result = result.replace(/\bi\.e\.\s?/gi, 'that is ');
  result = result.replace(/\betc\.\s?/gi, 'etcetera ');
  result = result.replace(/\bvs\.?\s?/gi, 'versus ');
  result = result.replace(/\bw\/\s?/gi, 'with ');
  result = result.replace(/\bw\/o\s?/gi, 'without ');

  // Clean up extra whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

module.exports = { normalizeForTTS, numberToWords };
