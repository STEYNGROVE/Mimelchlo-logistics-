# Deployment guide

Current release status and owner actions are in the [Infinity release and blocker register](INFINITY_COMPLETION.md).

See the [commercial integration completion report and owner checklist](COMMERCIAL_COMPLETION.md) for current release evidence and owner actions.
## Public website

The Git-connected Cloudflare Pages project `mimelchlo-logistics` deploys `main` with output directory `public/`. Production is [mimelchlo-logistics.pages.dev](https://mimelchlo-logistics.pages.dev/). The security headers shipped with commit `19a492180834b730ef5000e3cd1258bf9cef5764` on [the verified deployment](https://6ac57ffb.mimelchlo-logistics.pages.dev/) after [preview verification](https://ad5595ee.mimelchlo-logistics.pages.dev/).

## Private engine

Use Python 3.12 or later with the sibling checkout on the development branch containing the freight module. Run the private hunter for an incremental window, or pass an explicit date range for backfill.

```sh
python ~/nexus-private/hunter.py --incremental-from 2026-11-22 --max-pages 10
python ~/nexus-private/hunter.py --start 2026-11-20 --end 2026-11-22 --max-pages 5
```

An explicit incremental seed is used only when no incremental cursor exists. Completed windows advance one day at a time and omit the current UTC day. A failed page is retained for retry under the same dates. Inspect `freight_runs` and `freight_checkpoints` privately before escalating recurring publisher failures. Review through `python -m freight.review --db /path/to/private.db REFERENCE REJECTED` from the checkout. The CLI prompts for the review reason.

Make and test a new backup before changing the engine. From the checkout, run `python -m freight.backup SOURCE DESTINATION` with a new filename in a private directory. For rollback, stop the importer, validate the snapshot in an isolated path, and restore the database and hunter under the operator's control.

## Hatchable and hosted scheduling

For the current private release, use the commercial integration report above. Historical V5 context follows. Hatchable documents scheduler-only routes, but plan allowance and a durable private ingest flow were not verified. GitHub-hosted Actions includes plan-dependent private usage and cron can be delayed or dropped. Cloudflare Workers Free documents a 10 ms CPU limit per cron invocation, which needs measurement before selecting it for OCDS parsing. No hosted job was activated. [GitHub usage](https://docs.github.com/en/actions/concepts/billing-and-usage) · [GitHub scheduling constraints](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows) · [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
