const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { getSystemPrompt } = require('../expertise');
const { getAllToolDefinitions, dispatchToolCall } = require('../tools');
const log = require('../logger').child('CONVERSATION');

// Initialize Anthropic client
let anthropic = null;

function getAnthropicClient() {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

// Active expertise modules for this server instance
const ACTIVE_EXPERTISE = ['sa-tax'];

// Web search function using DuckDuckGo
async function searchWeb(query) {
  try {
    log.info('Web search', { query });

    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1
      },
      timeout: 5000
    });

    const data = response.data;
    let results = [];

    if (data.Abstract) {
      results.push({
        title: data.Heading || 'Result',
        snippet: data.Abstract,
        url: data.AbstractURL
      });
    }

    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      data.RelatedTopics.slice(0, 3).forEach(topic => {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0],
            snippet: topic.Text,
            url: topic.FirstURL
          });
        }
      });
    }

    log.info('Web search results', { query, count: results.length });

    if (results.length === 0) {
      return {
        query,
        results: [],
        message: `No instant answers found for "${query}". The DuckDuckGo instant answer API has limited data. For weather, news, or current events, I should acknowledge I cannot provide real-time data and suggest the user check a specific website like weather.com or news.google.com.`
      };
    }

    return {
      query,
      results: results.slice(0, 5)
    };
  } catch (error) {
    log.error('Web search failed', { query, error: error.message });
    return {
      query,
      results: [],
      error: 'Search temporarily unavailable. Unable to fetch web results at this time.'
    };
  }
}

/**
 * @swagger
 * /api/conversation/chat:
 *   post:
 *     summary: Send a message and get AI response
 *     tags: [Conversation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: User's message
 *               history:
 *                 type: array
 *                 description: Previous conversation messages
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: AI response generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 response:
 *                   type: string
 *                   description: AI's response message
 *       500:
 *         description: Server error
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const client = getAnthropicClient();
    if (!client) {
      return res.status(500).json({
        error: 'Claude API not configured. Please set ANTHROPIC_API_KEY in .env'
      });
    }

    const messages = [
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    log.info('Chat request', { messageLength: message.length, historyLength: history.length });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: getSystemPrompt(ACTIVE_EXPERTISE),
      messages: messages,
    });

    const assistantMessage = response.content[0].text;
    log.info('Chat response', { responseLength: assistantMessage.length });

    res.json({
      success: true,
      response: assistantMessage,
    });

  } catch (error) {
    log.error('Chat endpoint error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/conversation/chat-stream:
 *   post:
 *     summary: Send a message and get streaming AI response
 *     tags: [Conversation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               history:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Streaming response (Server-Sent Events)
 */
router.post('/chat-stream', async (req, res) => {
  const startTime = Date.now();

  try {
    const { message, history = [], personality } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const client = getAnthropicClient();
    if (!client) {
      return res.status(500).json({
        error: 'Claude API not configured'
      });
    }

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const messages = [
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    const systemPrompt = getSystemPrompt(ACTIVE_EXPERTISE, personality || null);
    const tools = getAllToolDefinitions();

    log.info('Stream request', { messageLength: message.length, historyLength: history.length });

    // Send initial timing event
    res.write(`data: ${JSON.stringify({
      type: 'timing',
      stage: 'stream_start',
      timestamp: Date.now(),
      elapsed: 0
    })}\n\n`);

    let fullResponse = '';
    let sentenceCount = 0;
    let firstTokenTime = null;
    let lastTokenTime = startTime;

    // Tool-use loop: Claude may call multiple tools sequentially
    let maxToolRounds = 5;
    let toolRound = 0;

    while (toolRound < maxToolRounds) {
      toolRound++;
      let currentSentence = '';
      let toolUseBlocks = []; // collect all tool_use blocks from this round
      let textContent = '';
      let currentToolId = null;
      let currentToolName = null;
      let currentToolInput = '';

      const stream = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages,
        tools: tools,
        stream: true,
      });

      let stopReason = null;

      for await (const event of stream) {
        const now = Date.now();

        // Track message-level stop reason
        if (event.type === 'message_delta' && event.delta.stop_reason) {
          stopReason = event.delta.stop_reason;
        }

        // Handle tool_use block start
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          currentToolId = event.content_block.id;
          currentToolName = event.content_block.name;
          currentToolInput = '';
          log.info('Tool use started', { tool: currentToolName });
        }

        // Accumulate tool input JSON
        if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json;
        }

        // Tool block complete - store it
        if (event.type === 'content_block_stop' && currentToolName) {
          try {
            const input = JSON.parse(currentToolInput);
            toolUseBlocks.push({
              type: 'tool_use',
              id: currentToolId,
              name: currentToolName,
              input: input,
            });
          } catch (e) {
            log.error('Tool input parse failed', { tool: currentToolName, error: e.message });
          }
          currentToolName = null;
          currentToolId = null;
          currentToolInput = '';
        }

        // Handle text streaming
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;

          if (!firstTokenTime) {
            firstTokenTime = now;
            const ttft = firstTokenTime - startTime;
            log.debug('TTFT', { ttft: ttft + 'ms' });

            res.write(`data: ${JSON.stringify({
              type: 'timing',
              stage: 'first_token',
              timestamp: now,
              elapsed: ttft,
              metric: 'Time to First Token (TTFT)'
            })}\n\n`);
          }

          fullResponse += text;
          currentSentence += text;
          textContent += text;
          lastTokenTime = now;

          // Check for sentence boundaries
          const sentenceEnders = /[.!?]+[\s\n]/;
          if (sentenceEnders.test(currentSentence)) {
            const sentence = currentSentence.trim();
            sentenceCount++;

            log.debug('Sentence complete', { index: sentenceCount });

            res.write(`data: ${JSON.stringify({
              type: 'sentence',
              text: sentence,
              index: sentenceCount,
              timestamp: now,
              elapsed: now - startTime
            })}\n\n`);

            currentSentence = '';
          } else {
            res.write(`data: ${JSON.stringify({
              type: 'token',
              text: text
            })}\n\n`);
          }
        }
      }

      // Send any remaining text as final sentence
      if (currentSentence.trim()) {
        sentenceCount++;
        const sentence = currentSentence.trim();

        log.debug('Final sentence', { index: sentenceCount });

        res.write(`data: ${JSON.stringify({
          type: 'sentence',
          text: sentence,
          index: sentenceCount,
          timestamp: Date.now(),
          elapsed: Date.now() - startTime
        })}\n\n`);
      }

      // If no tools were called, we're done
      if (toolUseBlocks.length === 0) {
        break;
      }

      // Process tool calls
      log.info('Processing tools', { count: toolUseBlocks.length, round: toolRound });

      // Build assistant message content (text + tool_use blocks)
      const assistantContent = [];
      if (textContent) {
        assistantContent.push({ type: 'text', text: textContent });
      }
      assistantContent.push(...toolUseBlocks);

      messages.push({
        role: 'assistant',
        content: assistantContent,
      });

      // Execute each tool and collect results
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const result = await dispatchToolCall(toolBlock.name, toolBlock.input, { searchWeb });

        // Send search results to frontend if it was a web search
        if (toolBlock.name === 'web_search') {
          res.write(`data: ${JSON.stringify({
            type: 'search_results',
            query: toolBlock.input.query,
            results: result.results || [],
            message: result.message,
            timestamp: Date.now()
          })}\n\n`);
        }

        // Send tool event to frontend for tax calculations
        if (toolBlock.name === 'calculate_tax' || toolBlock.name === 'calculate_vat') {
          res.write(`data: ${JSON.stringify({
            type: 'tool_result',
            tool: toolBlock.name,
            result: result,
            timestamp: Date.now()
          })}\n\n`);
        }

        // Send PDF generated event
        if (toolBlock.name === 'generate_tax_document' && result.success) {
          res.write(`data: ${JSON.stringify({
            type: 'pdf_generated',
            pdf_id: result.pdf_id,
            download_url: result.download_url,
            taxpayer_name: toolBlock.input.taxpayer_name,
            timestamp: Date.now()
          })}\n\n`);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result, null, 2),
        });
      }

      messages.push({
        role: 'user',
        content: toolResults,
      });

      // Reset for next round - Claude will respond to the tool results
      fullResponse += ''; // Continue accumulating
    }

    const totalTime = Date.now() - startTime;
    const streamingTime = lastTokenTime - (firstTokenTime || startTime);

    log.info('Stream complete', { totalTime: totalTime + 'ms', sentences: sentenceCount, toolRounds: toolRound, ttft: firstTokenTime ? (firstTokenTime - startTime) + 'ms' : null, streamingTime: streamingTime + 'ms' });

    // Send completion event
    res.write(`data: ${JSON.stringify({
      type: 'done',
      fullResponse: fullResponse,
      sentenceCount: sentenceCount,
      metrics: {
        totalTime: totalTime,
        ttft: firstTokenTime ? firstTokenTime - startTime : 0,
        streamingTime: streamingTime,
        tokensPerSecond: streamingTime > 0 ? Math.round((fullResponse.length / streamingTime) * 1000) : 0,
        toolRounds: toolRound,
      },
      timestamp: Date.now()
    })}\n\n`);

    res.end();

  } catch (error) {
    log.error('Stream error', { error: error.message });
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);
    res.end();
  }
});

module.exports = router;
