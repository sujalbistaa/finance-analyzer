// Optional Proxy Server for AI Personal Finance Analyzer
// This server protects your API key by handling requests server-side
// Usage: node server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Environment variables
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || 'your-together-api-key-here';
const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] // Replace with your domain
        : ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://']
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Chat completion proxy endpoint
app.post('/api/chat', async (req, res) => {
    try {
        // Validate request body
        const { messages, model, temperature, max_tokens, stream = false } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                error: 'Invalid request: messages array is required'
            });
        }

        // Validate model
        const allowedModels = [
            'openai/gpt-oss-20b',
            'meta-llama/Llama-2-7b-chat-hf',
            'mistralai/Mistral-7B-Instruct-v0.1'
        ];

        if (model && !allowedModels.includes(model)) {
            return res.status(400).json({
                error: 'Invalid model specified'
            });
        }

        // Prepare request to Together AI
        const togetherRequest = {
            model: model || 'openai/gpt-oss-20b',
            messages: messages,
            temperature: Math.min(Math.max(temperature || 0.25, 0), 2),
            max_tokens: Math.min(Math.max(max_tokens || 800, 50), 4000),
            stream: Boolean(stream)
        };

        console.log(`[${new Date().toISOString()}] Chat request: ${messages.length} messages, model: ${togetherRequest.model}`);

        // Make request to Together AI
        const response = await axios.post(TOGETHER_API_URL, togetherRequest, {
            headers: {
                'Authorization': `Bearer ${TOGETHER_API_KEY}`,
                'Content-Type': 'application/json',
                'User-Agent': 'FinanceAI-Proxy/1.0'
            },
            timeout: 30000, // 30 second timeout
            validateStatus: (status) => status < 500 // Don't reject 4xx errors
        });

        // Forward the response
        if (response.status === 200) {
            console.log(`[${new Date().toISOString()}] Successful response from Together AI`);
            res.json(response.data);
        } else {
            console.error(`[${new Date().toISOString()}] Together AI error:`, response.status, response.data);
            res.status(response.status).json({
                error: 'API request failed',
                details: response.data
            });
        }

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Proxy error:`, error.message);

        // Handle different types of errors
        if (error.code === 'ECONNABORTED') {
            res.status(408).json({
                error: 'Request timeout - the AI service took too long to respond'
            });
        } else if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            res.status(error.response.status).json({
                error: 'AI service error',
                details: error.response.data
            });
        } else if (error.request) {
            // The request was made but no response was received
            res.status(503).json({
                error: 'AI service unavailable'
            });
        } else {
            // Something happened in setting up the request that triggered an Error
            res.status(500).json({
                error: 'Internal server error'
            });
        }
    }
});

// Streaming endpoint (optional - for future use)
app.post('/api/chat/stream', async (req, res) => {
    try {
        const { messages, model, temperature, max_tokens } = req.body;

        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        const togetherRequest = {
            model: model || 'openai/gpt-oss-20b',
            messages: messages,
            temperature: temperature || 0.25,
            max_tokens: max_tokens || 800,
            stream: true
        };

        const response = await axios.post(TOGETHER_API_URL, togetherRequest, {
            headers: {
                'Authorization': `Bearer ${TOGETHER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            responseType: 'stream',
            timeout: 60000
        });

        // Pipe the stream response
        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    res.write(line + '\n\n');
                }
            }
        });

        response.data.on('end', () => {
            res.write('data: [DONE]\n\n');
            res.end();
        });

        response.data.on('error', (error) => {
            console.error('Stream error:', error);
            res.write(`data: {"error": "Stream error"}\n\n`);
            res.end();
        });

    } catch (error) {
        console.error('Streaming error:', error);
        res.write(`data: {"error": "Failed to start stream"}\n\n`);
        res.end();
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error(`[${new Date().toISOString()}] Unhandled error:`, error);
    res.status(500).json({
        error: 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 FinanceAI Proxy Server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 API endpoint: http://localhost:${PORT}/api/chat`);
    console.log(`🔑 Using Together AI with key: ${TOGETHER_API_KEY.substring(0, 10)}...`);
    
    if (!TOGETHER_API_KEY || TOGETHER_API_KEY === 'your-together-api-key-here') {
        console.warn('⚠️  Warning: Please set your TOGETHER_API_KEY environment variable');
        console.warn('   Create a .env file with: TOGETHER_API_KEY=your_actual_key');
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
});

/* 
SETUP INSTRUCTIONS:

1. Install dependencies:
   npm init -y
   npm install express cors axios express-rate-limit dotenv

2. Create a .env file in the same directory:
   TOGETHER_API_KEY=your_actual_together_api_key
   PORT=3001
   NODE_ENV=development

3. Run the server:
   node server.js

4. Update your client-side code:
   In script.js, change the apiConfig.baseUrl from:
   'https://api.together.xyz/v1/chat/completions'
   
   To:
   'http://localhost:3001/api/chat'
   
   And remove the Authorization header from client requests since
   the proxy will handle authentication.

5. For production deployment:
   - Set NODE_ENV=production
   - Update CORS origins to your actual domain
   - Use a process manager like PM2
   - Set up reverse proxy with nginx/Apache
   - Use HTTPS

SECURITY NOTES:
- Never commit your .env file to version control
- Use environment variables for sensitive data
- Implement additional authentication if needed
- Consider adding request validation and sanitization
- Monitor and log API usage
- Set up proper error monitoring

RATE LIMITING:
- Current limit: 100 requests per 15 minutes per IP
- Adjust in the rateLimit configuration above
- Consider user-based limiting for production

DEPLOYMENT OPTIONS:
- Heroku: Add Procfile with "web: node server.js"
- Vercel: Use serverless functions
- Railway/Render: Direct deployment
- Docker: Create Dockerfile for containerization

EXAMPLE DOCKER CONFIGURATION:

Dockerfile:
```
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.js ./
EXPOSE 3001
CMD ["node", "server.js"]
```

docker-compose.yml:
```
version: '3.8'
services:
  financeai-proxy:
    build: .
    ports:
      - "3001:3001"
    environment:
      - TOGETHER_API_KEY=${TOGETHER_API_KEY}
      - NODE_ENV=production
    restart: unless-stopped
```

MONITORING AND LOGGING:
For production, consider adding:
- Winston for structured logging
- Morgan for HTTP request logging  
- Helmet for security headers
- Compression middleware
- Request/response size limits
- API key usage tracking
- Error reporting (Sentry, etc.)

SCALING:
- Use Redis for rate limiting across multiple instances
- Implement connection pooling
- Add caching layer for repeated requests
- Consider API versioning
- Implement circuit breakers for external API calls
*/