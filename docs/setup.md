# Setup

## Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0+)
- OpenAI API key (for embeddings and Q&A)
- X/Twitter account with valid session cookies (for scraping)

## Installation

```bash
git clone https://github.com/joinvai/xgpt.git
cd xgpt
bun install
```

### Global Installation (optional)

```bash
bun link
```

After linking, use `xgpt` from anywhere:

```bash
xgpt --help
xgpt interactive
```

## Environment Variables

Copy the example and add your credentials:

```bash
cp .env.example .env
```

```env
# OpenAI API Key
OPENAI_KEY=your_openai_api_key_here

# X/Twitter Session Cookies
AUTH_TOKEN=your_auth_token_here
CT0=your_ct0_csrf_token_here
```

## Cookie Setup

To scrape tweets, extract session cookies from your X/Twitter account:

1. Login to X/Twitter in your browser
2. Open Developer Tools (F12 or right-click > Inspect)
3. Go to Application/Storage tab > Cookies > https://x.com
4. Find these cookies:
   - `auth_token` - Your authentication token
   - `ct0` - CSRF token for API requests
5. Copy the values to your `.env` file

**Warning**: Keep your cookies secure and never share them publicly. Any account used with this library is subject to being banned by Twitter.

## Initialize Database

```bash
bun run src/cli.ts db --init
```
