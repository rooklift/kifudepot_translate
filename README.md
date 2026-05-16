# KifuDepot Translate

Small Electron app for translating KifuDepot SGF root metadata with Claude.

## Run

Electron is expected to be available globally:

```powershell
npm start
```

or:

```powershell
electron .
```

## API Key

The app uses the first available key from:

1. The API key field in the app
2. `ANTHROPIC_API_KEY`
3. `keys/anthropic.txt`
4. `../claude_api_sandbox/keys/anthropic.txt`

The default model is `claude-opus-4-6`, matching the existing Python script's `Opus46` config. You can override it in the app field or by setting `ANTHROPIC_MODEL`.
