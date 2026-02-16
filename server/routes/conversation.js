const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

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

// Web search function using DuckDuckGo
async function searchWeb(query) {
  try {
    console.log(`🔍 Searching web for: "${query}"`);

    // Use DuckDuckGo Instant Answer API
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

    // Extract relevant results
    if (data.Abstract) {
      results.push({
        title: data.Heading || 'Result',
        snippet: data.Abstract,
        url: data.AbstractURL
      });
    }

    // Add related topics
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

    console.log(`✓ Found ${results.length} search results`);

    // If no results found, provide helpful message
    if (results.length === 0) {
      return {
        query,
        results: [],
        message: `No instant answers found for "${query}". The DuckDuckGo instant answer API has limited data. For weather, news, or current events, I should acknowledge I cannot provide real-time data and suggest the user check a specific website like weather.com or news.google.com.`
      };
    }

    return {
      query,
      results: results.slice(0, 5) // Limit to 5 results
    };
  } catch (error) {
    console.error('Web search error:', error.message);
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

    // Build conversation history for Claude
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

    console.log(`💬 Sending message to Claude: "${message}"`);

    // Call Claude API
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are Sakura, a friendly and helpful woman.

- Be warm, natural, and conversational
- Keep responses concise (1-3 sentences typically)
- Be genuinely helpful and straightforward
- No need for formality - just be a normal, kind person

USER CONTEXT:
- User is located in Cape Town, South Africa

TOOLS AVAILABLE:
- You can search the web when you need current information
- Use web search for: news, facts, prices, weather, events, or anything time-sensitive
- Be proactive - if something requires current info, search for it`,
      messages: messages,
    });

    const assistantMessage = response.content[0].text;
    console.log(`✅ Claude responded: "${assistantMessage.substring(0, 100)}..."`);

    res.json({
      success: true,
      response: assistantMessage,
    });

  } catch (error) {
    console.error('Conversation error:', error);
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
    const { message, history = [] } = req.body;

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

    // Build conversation history
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

    console.log(`💬 [STREAM] Starting Claude streaming for: "${message}"`);

    // Send initial timing event
    res.write(`data: ${JSON.stringify({
      type: 'timing',
      stage: 'stream_start',
      timestamp: Date.now(),
      elapsed: 0
    })}\n\n`);

    let fullResponse = '';
    let currentSentence = '';
    let sentenceCount = 0;
    let firstTokenTime = null;
    let lastTokenTime = startTime;

    // Call Claude API with streaming and tools
    const stream = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are Sakura, a friendly and helpful woman.

- Be warm, natural, and conversational
- Keep responses concise (1-3 sentences typically)
- Be genuinely helpful and straightforward
- No need for formality - just be a normal, kind person

USER CONTEXT:
- User is located in Cape Town, South Africa

TOOLS AVAILABLE:
- You can search the web when you need current information
- Use web search for: news, facts, prices, weather, events, or anything time-sensitive
- Be proactive - if something requires current info, search for it`,
      messages: messages,
      tools: [
        {
          name: "web_search",
          description: "Search the web for current information, news, facts, weather, prices, or any time-sensitive data. Use this when you need up-to-date information that you don't already know.",
          input_schema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query to look up on the web"
              }
            },
            required: ["query"]
          }
        }
      ],
      stream: true,
    });

    let toolUseId = null;
    let toolUseName = null;
    let toolUseInput = '';

    for await (const event of stream) {
      const now = Date.now();

      // Handle tool use
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        toolUseId = event.content_block.id;
        toolUseName = event.content_block.name;
        toolUseInput = '';
        console.log(`🔧 Tool use started: ${toolUseName}`);
      }

      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        toolUseInput += event.delta.partial_json;
      }

      if (event.type === 'content_block_stop' && toolUseName) {
        try {
          const input = JSON.parse(toolUseInput);
          console.log(`🔧 Executing ${toolUseName} with:`, input);

          let toolResult;
          if (toolUseName === 'web_search') {
            const searchResults = await searchWeb(input.query);
            toolResult = JSON.stringify(searchResults, null, 2);

            // Send search results to frontend
            const searchResultsEvent = {
              type: 'search_results',
              query: input.query,
              results: searchResults.results || [],
              message: searchResults.message,
              timestamp: Date.now()
            };
            console.log(`📤 Sending search results to frontend:`, JSON.stringify(searchResultsEvent));
            res.write(`data: ${JSON.stringify(searchResultsEvent)}\n\n`);
          }

          // Make a new API call with the tool result
          console.log(`🔧 Sending tool result back to Claude`);

          messages.push({
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: toolUseId,
              name: toolUseName,
              input: input
            }]
          });

          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: toolResult
            }]
          });

          // Continue streaming with the tool result
          const continueStream = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: `You are Sakura, a friendly and helpful woman.

- Be warm, natural, and conversational
- Keep responses concise (1-3 sentences typically)
- Be genuinely helpful and straightforward
- No need for formality - just be a normal, kind person

USER CONTEXT:
- User is located in Cape Town, South Africa

TOOLS AVAILABLE:
- You can search the web when you need current information
- Use web search for: news, facts, prices, weather, events, or anything time-sensitive
- Be proactive - if something requires current info, search for it`,
            messages: messages,
            tools: [
              {
                name: "web_search",
                description: "Search the web for current information, news, facts, weather, prices, or any time-sensitive data.",
                input_schema: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "The search query"
                    }
                  },
                  required: ["query"]
                }
              }
            ],
            stream: true,
          });

          // Continue streaming from the new response
          for await (const continueEvent of continueStream) {
            if (continueEvent.type === 'content_block_delta' && continueEvent.delta.type === 'text_delta') {
              const text = continueEvent.delta.text;
              fullResponse += text;
              currentSentence += text;
              lastTokenTime = Date.now();

              if (!firstTokenTime) {
                firstTokenTime = Date.now();
              }

              // Detect sentence boundaries
              if (text.match(/[.!?。！？]\s*$/)) {
                sentenceCount++;
                const sentence = currentSentence.trim();
                console.log(`📝 [STREAM] Sentence ${sentenceCount}: "${sentence}"`);

                res.write(`data: ${JSON.stringify({
                  type: 'sentence',
                  text: sentence,
                  index: sentenceCount,
                  timestamp: Date.now(),
                  elapsed: Date.now() - startTime
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

          toolUseName = null;
          toolUseId = null;
          toolUseInput = '';
        } catch (error) {
          console.error('Tool execution error:', error);
        }
      }

      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;

        // Record first token time
        if (!firstTokenTime) {
          firstTokenTime = now;
          const ttft = firstTokenTime - startTime;
          console.log(`⚡ [STREAM] First token received: ${ttft}ms`);

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
        lastTokenTime = now;

        // Check for sentence boundaries
        const sentenceEnders = /[.!?]+[\s\n]/;
        if (sentenceEnders.test(currentSentence)) {
          const sentence = currentSentence.trim();
          sentenceCount++;

          console.log(`📝 [STREAM] Sentence ${sentenceCount} complete: "${sentence.substring(0, 50)}..."`);

          // Send complete sentence for TTS
          res.write(`data: ${JSON.stringify({
            type: 'sentence',
            text: sentence,
            index: sentenceCount,
            timestamp: now,
            elapsed: now - startTime
          })}\n\n`);

          currentSentence = '';
        } else {
          // Send partial text update
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

      console.log(`📝 [STREAM] Final sentence ${sentenceCount}: "${sentence}"`);

      res.write(`data: ${JSON.stringify({
        type: 'sentence',
        text: sentence,
        index: sentenceCount,
        timestamp: Date.now(),
        elapsed: Date.now() - startTime
      })}\n\n`);
    }

    const totalTime = Date.now() - startTime;
    const streamingTime = lastTokenTime - firstTokenTime;

    console.log(`✅ [STREAM] Complete: ${totalTime}ms total, ${sentenceCount} sentences`);
    console.log(`   ├─ TTFT: ${firstTokenTime - startTime}ms`);
    console.log(`   ├─ Streaming: ${streamingTime}ms`);
    console.log(`   └─ Full response: "${fullResponse.substring(0, 100)}..."`);

    // Send completion event with full metrics
    res.write(`data: ${JSON.stringify({
      type: 'done',
      fullResponse: fullResponse,
      sentenceCount: sentenceCount,
      metrics: {
        totalTime: totalTime,
        ttft: firstTokenTime - startTime,
        streamingTime: streamingTime,
        tokensPerSecond: Math.round((fullResponse.length / streamingTime) * 1000)
      },
      timestamp: Date.now()
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('❌ [STREAM] Error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);
    res.end();
  }
});

module.exports = router;
