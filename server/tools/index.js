/**
 * Tool Registry
 *
 * Central registry combining all available tools (web search + tax tools).
 * Provides unified tool definitions and dispatch.
 */
const { taxToolDefinitions, handleToolCall: handleTaxTool } = require('./tax-tools');
const log = require('../logger').child('TOOLS');

// Web search tool definition
const webSearchTool = {
  name: 'web_search',
  description: 'Search the web for current information, news, facts, weather, prices, or any time-sensitive data. Use this when you need up-to-date information.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up on the web',
      },
    },
    required: ['query'],
  },
};

/**
 * Get all tool definitions for Claude API
 */
function getAllToolDefinitions() {
  return [
    webSearchTool,
    ...taxToolDefinitions,
  ];
}

/**
 * Dispatch a tool call to the appropriate handler
 * @param {string} toolName - Name of the tool to call
 * @param {object} input - Tool input parameters
 * @param {object} context - Additional context (searchWeb function, etc.)
 * @returns {object} Tool result
 */
async function dispatchToolCall(toolName, input, context = {}) {
  log.info('Dispatching tool', { toolName });

  if (toolName === 'web_search') {
    if (!context.searchWeb) {
      return { error: 'Web search function not available' };
    }
    return await context.searchWeb(input.query);
  }

  // All other tools are tax tools
  return await handleTaxTool(toolName, input);
}

module.exports = {
  getAllToolDefinitions,
  dispatchToolCall,
};
