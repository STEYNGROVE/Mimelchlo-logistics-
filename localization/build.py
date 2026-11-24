"""Build localized static pages without introducing a production build dependency."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
public = root / "public"
template = (public / "index.html").read_text()
languages = {"af": "af-ZA"}

for path, locale in languages.items():
    phrases = dict(line.split("\t", 1) for line in (root / "localization" / f"{path}-static.tsv").read_text().splitlines())
    for kind in ("Spot quotation", "Repeat transport", "Backhaul enquiry", "Commercial contract"):
        template = template.replace(f"<option>{kind}</option>", f'<option value="{kind}">{kind}</option>')
    patterns = "|".join(map(re.escape, sorted(phrases, key=len, reverse=True)))

    def translate_html(part):
        if not part.startswith("<"):
            return re.sub(patterns, lambda match: phrases[match[0]], part)
        return re.sub(
            r'((?:aria-label|alt|placeholder|content)=")([^"]*)(")',
            lambda match: match[1] + re.sub(patterns, lambda phrase: phrases[phrase[0]], match[2]) + match[3],
            part,
        )

    page = "".join(translate_html(part) for part in re.split(r"(<[^>]+>)", template))
    page = page.replace('lang="en-ZA"', f'lang="{locale}"', 1)
    page = page.replace(f'<link rel="canonical" href="https://mimelchlo-logistics.pages.dev/">', f'<link rel="canonical" href="https://mimelchlo-logistics.pages.dev/{path}/">')
    page = page.replace('<meta property="og:url" content="https://mimelchlo-logistics.pages.dev/">', f'<meta property="og:url" content="https://mimelchlo-logistics.pages.dev/{path}/">')
    page = page.replace('<script src="/quote.js" defer></script>', f'<script src="/{path}/locale.js" defer></script>\n<script src="/quote.js" defer></script>')
    page = page.replace('<a href="/af/" lang="af-ZA">Afrikaans</a>', '<a href="/" lang="en-ZA">English</a>')
    page = page.replace('<a class="brand" href="/"', f'<a class="brand" href="/{path}/"')
    (public / path / "index.html").write_text(page)
    runtime = dict(line.split("\t", 1) for line in (root / "localization" / f"{path}-dynamic.tsv").read_text().splitlines())
    (public / path / "locale.js").write_text("window.translations = " + json.dumps(runtime, ensure_ascii=False, indent=2) + ";\n")
