/**
 * Vercel Serverless Function - Claude API Proxy v2.0.5
 * Handles CORS and proxies requests to Anthropic's Claude API
 * Deploy: CommonJS export test
 */

module.exports = async (req, res) => {
  // Prevent CDN caching - always hit the serverless function
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-API-Key'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, messages, system, maxTokens, stream } = req.body;

    // Validate API key is provided
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Validate messages array
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Build request body
    const requestBody = {
      model: 'claude-3-5-sonnet-20250107',
      max_tokens: maxTokens || 4096,
      messages: messages,
      stream: stream || false
    };

    // Only add system if it has content
    if (system && system.trim()) {
      requestBody.system = system;
    }

    console.log('Sending to Claude API:', JSON.stringify(requestBody, null, 2));

    // Make request to Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    // Handle error responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Claude API error:', response.status, errorData);

      // Extract error message properly
      let errorMessage = `API request failed: ${response.status}`;
      if (errorData.error) {
        if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        } else if (errorData.error.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.error.type) {
          errorMessage = `${errorData.error.type}: ${JSON.stringify(errorData.error)}`;
        }
      }

      return res.status(response.status).json({
        error: errorMessage,
        details: errorData
      });
    }

    // Handle streaming responses
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } finally {
        reader.releaseLock();
        res.end();
      }
    } else {
      // Handle regular JSON response
      const data = await response.json();
      res.status(200).json(data);
    }

  } catch (error) {
    console.error('Claude API proxy error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
};
