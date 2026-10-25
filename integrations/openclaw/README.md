# phone-harness for OpenClaw

An [OpenClaw](https://openclaw.ai) plugin that lets the agent drive a real
phone with one tool, `phone_exec`. The model writes a short Python script with
the phone-harness helpers pre-imported, and the plugin runs it on the phone and
returns what it printed.

```text
phone_exec(code='''
ensure_device()
open_app("Weather")
wait_stable()
print([o["text"] for o in screen()][:12])
''')
```

The plugin bundles the phone-harness skill, so the agent reads the helpers from
it. The skill only loads when `phone-harness` is on `PATH`.

## Install

1. Install phone-harness itself (the plugin runs it, it does not bundle it):
   ```bash
   uv tool install phone-harness
   ```
   [install.md](../../install.md) covers each phone: iPhone needs Accessibility
   and Screen Recording for the app that runs the OpenClaw gateway, Android
   needs adb, a cloud phone needs `phone-harness cloud login`.
2. Build and install the plugin (Node 24.22.1+ or 26.12.1+):
   ```bash
   npm install
   npm run build
   npm pack --pack-destination /tmp
   openclaw plugins install npm-pack:/tmp/phone-harness-openclaw-0.1.0.tgz
   ```
3. `phone_exec` is optional, so opt in:
   ```json5
   { tools: { allow: ["phone_exec"] } }
   ```

## Settings

- `command` (string, default `phone-harness`): the phone-harness executable,
  a name on `PATH` or an absolute path.
- Telemetry is off for OpenClaw runs unless you opt in with
  `phone-harness config set telemetry true`.
- `PHONE_HARNESS_*` variables in the gateway's environment are passed through,
  for example `PHONE_HARNESS_PLATFORM=ios` to force the phone on this machine.
- The agent workspace is `~/.openclaw/phone-harness/agent-workspace`, or
  `PH_AGENT_WORKSPACE` when it is set.

## How it works

1. The model calls `phone_exec(code, timeout_s=300)`.
2. A `before_tool_call` hook asks you to approve the script, showing a short
   summary of it. See [Approvals](#approvals).
3. One script drives the phone at a time across agents in the gateway. After
   120 s of waiting the tool reports the phone as busy.
4. The script is piped on stdin to `phone-harness` with `PH_CLIENT=openclaw`
   and the workspace. `*_API_KEY`, `*_TOKEN` and `*_SECRET` variables are
   dropped from its environment, except `PHONE_HARNESS_*` ones. Its scripts do
   not get host modules such as `Path` or `importlib` in their globals.
5. The result is what the script printed, plus the exit code and the tail of
   stderr. The last screenshot saved during the call is attached as an image
   (up to 5 MB; otherwise its path is in `screenshots`). A script past its
   timeout is killed with everything it started.

## Approvals

Every `phone_exec` call asks first. **Allow always** trusts `phone_exec` for
the rest of that session, until the gateway restarts; calls with no session
always ask. If nobody can answer, or the prompt times out, the script does not
run. What to do on the phone itself (sending, posting, buying, deleting,
changing settings) is still the skill's consent rule: the agent asks you first.

## Development

```bash
npm test          # unit tests, no phone needed
npm run typecheck
```
