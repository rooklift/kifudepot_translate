# KifuDepot Translate

Small Electron app for translating KifuDepot SGF root metadata with Claude.

## Run

Electron is expected to be available globally:

```powershell
electron .
```

## API Key

The app uses the first available key from:

1. The API key field in the app
2. `ANTHROPIC_API_KEY`
3. `./keys/anthropic.txt`
4. `../claude_api_sandbox/keys/anthropic.txt` (for the author's convenience...)

The default model is `claude-opus-4-6`. You can override it in the app field or by setting `ANTHROPIC_MODEL`.
