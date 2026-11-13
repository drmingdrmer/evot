<p align="center"><strong>Evot</strong></p>
<p align="center"><strong>The lightest harness for agentic work.</strong></p>
<p align="center">An open-source terminal coding agent. A short prompt, four core tools, and the model does the thinking.</p>

<p align="center">
  <a href=".github/assets/demo.gif"><img src=".github/assets/demo.gif" alt="evot demo" width="960" /></a>
</p>

## News

- **2026-11-03** `/compute` — add your ssh machines; the agent runs commands and long jobs on them for you.
- **2026-10-18** `Tab` — context-aware suggestions, e.g. “Run the tests.” `Tab` cycles; `→` accepts without sending.
- **2026-10-14** `/loop` — babysit a PR, poll a deploy, check back on a build; the agent picks when to wake and when to stop.
- **2026-09-16** `/task` — scheduled runs with push delivery.
- **2026-09-13** `/share` — read-only session links on evot.ai.
- **2026-09-02** `ctrl+b` — background a running command and keep talking.

## Quick start

```bash
curl -fsSL https://evot.ai/install | sh
```

The installer configures your PATH. Open a new terminal, or run the command it prints to use evot in the current terminal. Then log in:

```bash
evot login
```

Login opens the TUI. Use hosted models or bring your own API keys.

<details>
<summary>Build from source</summary>

```bash
git clone https://github.com/evotai/evot.git
cd evot
make setup && make install
```

</details>

<details>
<summary>Bring your own models</summary>

Configure providers in `~/.evotai/evot.env`. Examples:

```env
# Anthropic
EVOT_LLM_ANTHROPIC_API_KEY=sk-ant-...
EVOT_LLM_ANTHROPIC_BASE_URL=your-anthropic-base-url
EVOT_LLM_ANTHROPIC_MODEL=claude-opus-4.8

# OpenAI Responses API
# EVOT_LLM_OPENAI_API_KEY=sk-...
# EVOT_LLM_OPENAI_MODEL=gpt-5.6-sol
# EVOT_LLM_OPENAI_PROTOCOL=openai_responses

# DeepSeek (Anthropic-compatible)
# EVOT_LLM_DEEPSEEK_API_KEY=sk-...
# EVOT_LLM_DEEPSEEK_BASE_URL=https://api.deepseek.com/anthropic
# EVOT_LLM_DEEPSEEK_PROTOCOL=anthropic
# EVOT_LLM_DEEPSEEK_MODEL=deepseek-v4-pro

# Kimi Coding (Anthropic-compatible)
# EVOT_LLM_KIMI_API_KEY=sk-...
# EVOT_LLM_KIMI_BASE_URL=https://api.kimi.com/coding
# EVOT_LLM_KIMI_PROTOCOL=anthropic
# EVOT_LLM_KIMI_MODEL=kimi-for-coding

# OpenRouter (Anthropic-compatible)
# EVOT_LLM_OPENROUTER_API_KEY=sk-or-...
# EVOT_LLM_OPENROUTER_BASE_URL=https://openrouter.ai/api/
# EVOT_LLM_OPENROUTER_PROTOCOL=anthropic
# EVOT_LLM_OPENROUTER_MODEL=stealth/ox-alpha
```

Use comma-separated model names to configure multiple models. For OpenAI-compatible Chat Completions, set `EVOT_LLM_OPENAI_PROTOCOL=openai` and `EVOT_LLM_OPENAI_BASE_URL` to your endpoint. The official Responses API supports server-side context compaction, with local fallback.

</details>

<details>
<summary>Use evot from editors and other tools (ACP)</summary>

`evot acp` serves the [Agent Client Protocol](https://agentclientprotocol.com) v1 on stdin/stdout, so any ACP client can drive evot:

```bash
evot acp                            # full coding tools
evot acp --tools readonly           # read and search only
evot acp --tools none --ephemeral   # answer-only, sessions kept in memory
```

Supported methods: `initialize`, `session/new`, `session/prompt`, `session/cancel`, `session/list`, `session/resume`, `session/close`, and `session/set_config_option` for the per-session `model` selector. Tools run inside evot; it does not send `session/request_permission`. `--tools none` offers the model no tools, skills, or project instructions. `--ephemeral` writes no sessions to disk.

</details>

## Queue the next steps

**Enter sends now; Tab queues while the agent is working.** For example, send
“Refactor the loader” with Enter, then queue “Update its tests” and “Review the
changes” with Tab. Follow-ups run one at a time, in order, after the preceding
response and its tool work finish. They share the conversation context but do
not enter model context early. Completion of a response is not a guarantee of
semantic task success.

- **Shift+Up** removes the newest pending prompt and restores it, unsent, into
  an empty composer, including pasted text and images. It does not interrupt
  the active task. Use Enter to send it now or busy Tab to queue it at the tail.
- **Ctrl+G** manages pending prompts, including paused prompts while idle.
  Cancellation or terminal failure pauses dependent work. Choose **Resume
  paused queue** explicitly; an unrelated Enter does not resume it.
- Local path, `@`, command and argument completion still owns Tab. Idle or
  empty-composer Tab keeps input assistance; **Ctrl+N** requests or cycles AI
  assistance while working, and Right accepts its candidate without sending.
- Manual compaction shares the same ordered queue. `/log` follow-ups stay on
  that exact read-only fork; `/done` asks for confirmation before discarding
  pending log prompts.
- Queue-manager Edit supports text-only prompts. Dequeue an image prompt to
  edit it. Editing while images are being prepared cancels that enqueue intent;
  press Tab again after making changes.

Pending prompts are **process-local, not persisted**. Session changes retain
main-session backlogs for the current process, but exiting or restarting evot
loses them. Esc interrupts the active task; it no longer recovers queued text.

## Less harness. More model.

- **Small by design.** ~1k prompt tokens and four core tools: `read`, `bash`, `edit`, `write`.
- **Less waiting.** Long-running commands continue in the background while the agent works on independent tasks.
- **Lean context.** Automatic context compaction keeps long sessions within the model's budget while preserving recent work.
- **Your choice of model.** Free and low-cost hosted models, or your own provider keys.

## Performance

<p align="center">
  <a href="https://trace.evot.ai/performance.html"><img src=".github/assets/benchmark-latest-models.png" alt="Evot model request comparison with pi and dsh" width="960" /></a>
</p>

[Live performance & comparisons →](https://trace.evot.ai/performance.html)

## License

Apache-2.0
