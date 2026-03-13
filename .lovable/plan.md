

# Ask AI — RAG Chat Page

## Overview
Create a new "Ask AI" page with a chat interface where users can ask questions about their expenses. An edge function queries the user's expense data from the database and sends it as context to Lovable AI (RAG pattern). On page load, the AI generates 4 suggested prompts based on the user's actual expense data.

## Architecture

```text
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│  AskAI Page │────▶│ Edge Function    │────▶│ Lovable AI    │
│  (React)    │     │ ask-ai/index.ts  │     │ Gateway       │
│             │◀────│  - Fetches user  │◀────│ (Gemini Flash)│
│  SSE stream │     │    expenses      │     └───────────────┘
└─────────────┘     │  - Builds RAG    │
                    │    context       │
                    └──────────────────┘
```

## Implementation

### 1. Edge Function: `supabase/functions/ask-ai/index.ts`
- Accepts `{ messages, userId }` from client
- Uses service role key to query the user's expenses from the database (title, amount, status, merchant, date, category, cost_center)
- Builds a system prompt with the expense data as RAG context
- Streams response from Lovable AI Gateway (`google/gemini-3-flash-preview`)
- Handles 429/402 errors
- A separate mode `{ action: "suggestions", userId }` returns 4 suggested prompts based on the user's data (non-streaming)

### 2. New Page: `src/pages/AskAI.tsx`
- Chat UI with message list (user/assistant bubbles) and input at bottom
- On mount, calls edge function with `action: "suggestions"` to get 4 contextual prompt chips (e.g., "What's my total spending this month?", "Which category has the highest expenses?")
- Clicking a chip sends it as a user message
- Streams AI responses token-by-token using SSE parsing
- Renders AI responses with markdown support (`react-markdown` — already available or will use simple prose styling)
- Mobile responsive: full-height chat layout

### 3. Sidebar Update: `src/components/layout/AppSidebar.tsx`
- Add "Ask AI" item with `MessageSquare` icon to the employee nav items, linking to `/ask-ai`

### 4. Router Update: `src/App.tsx`
- Add route `/ask-ai` pointing to `AskAI` page wrapped in `ProtectedRoute` and `AppLayout`

### 5. Config: `supabase/config.toml`
- Add `[functions.ask-ai]` with `verify_jwt = false` (auth validated in code)

## Suggested Prompts Logic
The edge function will query the user's expenses, then ask Lovable AI to generate 4 short, relevant question suggestions based on the data (e.g., spending trends, pending approvals, top merchants). These appear as clickable chips above the input.

## Files to Create/Edit
- **Create**: `supabase/functions/ask-ai/index.ts`
- **Create**: `src/pages/AskAI.tsx`
- **Edit**: `src/App.tsx` (add route)
- **Edit**: `src/components/layout/AppSidebar.tsx` (add nav item)
- **Edit**: `supabase/config.toml` (add function config)

