"""Refresh the embedded catalog from the public SDO API; no login or character data."""
import argparse
import gzip
import json
import re
import subprocess
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'ff14-official-mall-enhancements.user.js'
HEADERS = ['User-Agent: Mozilla/5.0', 'Referer: https://qu.sdo.com/',
           'Origin: https://qu.sdo.com', 'qu-merchant-id: 1', 'qu-hardware-platform: 3',
           'qu-software-platform: 1', 'qu-deploy-platform: 1', 'qu-web-host: qu.sdo.com']


class ProductText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, value):
        self.parts.append(value)

    def handle_starttag(self, tag, attrs):
        if tag in ('br', 'p', 'li', 'tr', 'div'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('p', 'li', 'tr', 'div'):
            self.parts.append('\n')


def clean_name(value):
    value = unicodedata.normalize('NFKC', value).strip()
    pairs = [('"', '"'), ("'", "'"), ('“', '”'), ('‘', '’'), ('「', '」'), ('『', '』')]
    while len(value) > 1 and any(value.startswith(a) and value.endswith(b) for a, b in pairs):
        value = value[1:-1].strip()
    return value


def product_items(content, name, known):
    parser = ProductText()
    parser.feed(content or '')
    text = ''.join(parser.parts)
    marker = re.search(r'购买后(?:将)?(?:可)?(?:在[^\n]{0,40})?获得[：:]?', text)
    found = []
    if marker:
        for line in text[marker.end():].splitlines():
            match = re.fullmatch(r'(.+?)\s*[/／×x*]\s*\d+\s*(?:个|件|份|张)?\s*', line.strip(), re.I)
            if match:
                found.append(clean_name(match[1]))
    # Preserve verified image-only set mappings; never invent components from similar names.
    return list(dict.fromkeys(found)) or known.get(name, [name])


def get_page(page):
    url = ('https://sqmallservice.u.sdo.com/api/ps/product/list?merchantId=1'
           f'&page={page}&pageSize=100&categoryType=0&order=0')
    command = ['curl.exe', '--fail', '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '30']
    for header in HEADERS:
        command += ['-H', header]
    data = subprocess.run(command + [url], check=True, capture_output=True).stdout
    if data[:2] == b'\x1f\x8b':
        data = gzip.decompress(data)
    response = json.loads(data)
    if response.get('resultCode') != 0:
        raise ValueError('Official mall rejected the request')
    return response['data']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path, help='Replay a complete public product/list response')
    options = parser.parse_args()
    text = SCRIPT.read_text(encoding='utf-8-sig')
    match = re.search(r'const BUNDLED = (\{[^\n]+\});', text)
    previous = json.loads(match[1])
    if options.snapshot:
        response = json.loads(options.snapshot.read_text(encoding='utf-8-sig'))
        if response.get('resultCode') != 0:
            raise ValueError('Invalid snapshot')
        rows, total = response['data']['productList'], response['data']['totalCount']
    else:
        rows, total = [], None
        for page in range(1, 51):
            data = get_page(page)
            if total is None:
                total = data['totalCount']
            if not isinstance(total, int) or not 0 < total <= 5000 or data['totalCount'] != total:
                raise ValueError('Catalog total changed; retry the complete download')
            rows.extend(data['productList'])
            if len(rows) >= total:
                break
            if not data['productList']:
                raise ValueError('Incomplete catalog')
    if len(rows) != total or len({str(p['sku']['id']) for p in rows}) != total:
        raise ValueError('Incomplete or duplicated catalog; script not changed')
    known = {p['name']: p['items'] for p in previous['products']}
    products = [{'skuId': str(p['sku']['id']), 'name': p['product']['productName'],
                 'items': product_items(p['product'].get('productContent'), p['product']['productName'], known)}
                for p in rows]
    if products == previous['products']:
        print(f'Catalog unchanged: {total} products.')
        return
    catalog = {'revision': previous.get('revision', 0) + 1,
               'updatedAt': datetime.now(timezone.utc).isoformat(), 'products': products}
    start, end = match.span(1)
    SCRIPT.write_text(text[:start] + json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + text[end:], encoding='utf-8')
    print(f'Updated {total} products. Increment @version and run tests before publishing.')


if __name__ == '__main__':
    main()
