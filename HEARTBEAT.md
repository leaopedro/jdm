# HEARTBEAT Workflow

This file defines the mandatory heartbeat workflow for agent Pilar, as per JDMA-208 override.

1.  Scan recent runs across CEO, CTO, Vega, Atlas. Check last ~5 runs. Flag any with `inputTokens=0 outputTokens=0 billingType=subscription_included` and `status` is either `succeeded` or `failed`.
2.  Per flagged agent, look up `in_progress` issues. Rescue candidate = highest-priority with active recent execution ending zero tokens.
3.  Confirm rate-limit, not idle. Three consecutive zero-token = strong signal. One = suggestive. Check run log. If unsure, wait one more cycle.
4.  If classification is uncertain after 2 matching runs, create exactly one probe comment to trigger one more heartbeat, then re-check next run before reroute.
5.  Drain-before-block. Stall detected -> ensure `## Handoff` comment exists: current branch, last commit SHA, files touched, verified vs unverified, resume command. If any field is missing, write `unknown` explicitly. Rescue is incomplete if a reassignment happened without the handoff comment.
6.  Reroute stalled issue to Atlas if idle + not stalled. If Atlas stalled, reassign to Vega with sonnet override (`assigneeAdapterOverrides = {"adapterConfig":{"model":"claude-sonnet-4-6"}}`).
7.  Wake new assignee. Comment naming rescue + resume action so next heartbeat starts immediately.
8.  Post-incident escalation. Same heartbeat as rescue, SBAR to CEO: Situation (which agent, model, duration), Background (what working on, last good run), Assessment (root cause: rate-limit / billing / config / bug), Recommendation (rerouted to X, monitor, change tier permanently, etc).
9.  Every rescue comment and self-update must end with `Next action:` on its own line.
