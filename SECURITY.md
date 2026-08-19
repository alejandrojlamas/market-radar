# Security policy

## Supported version

The current default branch is supported. Update older or modified copies before evaluating a report.

## Reporting a vulnerability

Use GitHub private vulnerability reporting when it is enabled for this repository. Otherwise, request a private channel from the maintainer instead of publishing exploit details, personal data, credentials, or local database content in a public issue.

When possible, include:

- the affected version or commit;
- impact and prerequisites;
- minimal reproduction steps using synthetic data;
- a suggested mitigation.

Do not include real API keys. Revoke and rotate any credential that may have been exposed.

## Operating model

Market Radar is a single-user, local-first research application. It only permits binding to `127.0.0.1` or `::1` and does not provide user accounts or its own authorization layer.

- Keep the API bound to loopback.
- For remote access, place a TLS-enabled, authenticated proxy in front of the application.
- Set `MARKET_RADAR_ALLOWED_ORIGINS` to complete, exact origins; wildcards are not accepted.
- Preserve the `x-market-radar-request: same-origin` header in clients that perform mutations.
- Prefer environment variables or the host's secret manager for provider credentials.
- Never publish `data/market-radar.sqlite`, its WAL/SHM files, logs, or portfolio exports.

The local database may contain unencrypted credentials, portfolio positions, and decision-journal entries. Protect the host with appropriate file permissions and full-disk encryption, and remove runtime state before sharing a project copy.

## Dependencies and validation

Before deploying changes, run:

```bash
npm ci
npm run lint
npm test
npm run build
```

Review dependency alerts as well, and do not run untrusted contribution builds with secrets present in the environment.
