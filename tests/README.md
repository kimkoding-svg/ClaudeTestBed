# AI Companion Test Suite

## Running Tests

### Prerequisites
1. Make sure the dev server is running: `npm run dev`
2. Ensure `.env` file is configured with API keys

### Run All Tests
```bash
npm test
```

### Watch Mode
```bash
npm run test:watch
```

## Test Coverage

The test suite validates:

1. **Server Health** - API server is running and responding
2. **TTS Synthesis** - Text-to-speech generation works
3. **STT Endpoint** - Speech-to-text endpoint exists
4. **Chat Conversation** - Basic chat functionality
5. **Streaming** - SSE streaming endpoint responds
6. **Environment** - Required API keys are configured

## Expected Output

```
🧪 AI Companion Test Suite

✓ Server is running
✓ TTS synthesis works
✓ STT endpoint exists
✓ Chat conversation works
✓ Streaming endpoint responds
✓ Environment variables configured

📊 Test Results:
  ✓ Passed: 6
  Total: 6
```

## Troubleshooting

### "Server not responding"
- Make sure `npm run dev` is running
- Check that port 3000 is not blocked

### "OPENAI_API_KEY not set"
- Copy `.env.example` to `.env`
- Add your OpenAI API key

### "TTS synthesis failed"
- Verify OpenAI API key is valid
- Check network connection

## Adding New Tests

Edit `tests/run-tests.js` and add new test cases:

```javascript
await test('My new test', async () => {
  // Test logic here
  if (somethingWrong) {
    throw new Error('Test failed');
  }
});
```
