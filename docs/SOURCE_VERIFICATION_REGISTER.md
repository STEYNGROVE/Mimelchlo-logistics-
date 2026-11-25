# Source verification register

Current release status and owner actions are in the [Infinity release and blocker register](INFINITY_COMPLETION.md).

See the [commercial integration completion report and owner checklist](COMMERCIAL_COMPLETION.md) for current release evidence and owner actions.
## National Treasury OCDS

- Publisher and documentation verified. Public release URL and parameter names confirmed from the OpenAPI document. The original request returned HTTP 400 with the message that dateFrom and dateTo are required. [Treasury OpenAPI](https://ocds-api.etenders.gov.za/swagger/v1/swagger.json)
- Live packages included `releases`, `publisher` and `links.next`. The importer requested two releases per page after larger page sizes returned HTTP 500. The documented single-record endpoint returned HTTP 500 for the tested OCID, so evidence retains the exact fetched page URL and the OCID. A page URL may show different records on later visits.
- Treasury permits programmatic reuse and describes coverage and data quality limitations. The public download page describes CC BY 4.0. The API package returned a different license URI. Attribution is retained and external redistribution should await clarification of applicable API terms. [Treasury publication policy](https://data.etenders.gov.za/Home/LearnMore) · [Treasury Transparency Portal](https://data.etenders.gov.za/Home)
- Five live historical pages processed in private SQLite. Page 6 repeatedly returned HTTP 500. Ten newer pages processed in isolated SQLite. Both samples yielded zero freight keyword matches.
- Matching uses title and description keywords. Region is populated only when one supported province is present in the supplied item delivery regions. Publication evidence retains the OCDS release timestamp, which may differ from the original advertisement date. Budget, offered rate, weight, customer contact and collection point remain unknown when unsupported. Source fraud screening, full coverage, and authority-level completeness remain unverified.

## Other source categories

Municipal and provincial entities may appear through Treasury. No standalone public or corporate procurement connector has been verified. Freight exchanges, agriculture, mining, industry, construction, manufacturing, retail, imports, exports, containers, cold chain, customer enquiries, social platforms and subcontractor networks have no independent integrated feed.
