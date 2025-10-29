import os
from urllib.parse import urljoin, urlparse

from flask import Flask, jsonify, request, send_from_directory
import requests

app = Flask(__name__, static_folder='public', static_url_path='')
app.config['JSON_AS_ASCII'] = False

DEFAULT_API_BASE = (os.getenv('FIREFLY_API_BASE') or 'http://csh.nowsec.top/api/v1').rstrip('/')
REQUEST_TIMEOUT = int(os.getenv('FIREFLY_TIMEOUT', '15'))


def resolve_api_base(candidate: str | None) -> str:
    if not candidate or not isinstance(candidate, str):
        return DEFAULT_API_BASE

    trimmed = candidate.strip()
    if not trimmed:
        return DEFAULT_API_BASE

    try:
        parsed = urlparse(trimmed)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError('Invalid URL')

        base = (f"{parsed.scheme}://{parsed.netloc}{parsed.path}").rstrip('/')
        if not base.lower().endswith('/api/v1'):
            base = f"{base}/api/v1"
        return base
    except Exception:
        return DEFAULT_API_BASE


@app.post('/api/transactions')
def proxy_transactions():
    payload = request.get_json(silent=True) or {}

    token = payload.get('token')
    start = payload.get('start')
    end = payload.get('end')
    base_url = payload.get('baseUrl')

    if not token or not isinstance(token, str):
        return jsonify({'message': 'Missing personal access token.'}), 400

    if not start or not end:
        return jsonify({'message': 'Missing date range.'}), 400

    api_base = resolve_api_base(base_url)
    params = {'start': start, 'end': end}
    url = urljoin(f'{api_base}/', 'transactions')

    try:
        headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.api+json',
        }

        aggregated_data: list[dict] = []
        meta: dict | None = None

        next_url: str | None = url
        params_for_request: dict | None = dict(params)
        visited: set[tuple[str, tuple]] = set()

        while next_url:
            key = (next_url, tuple(sorted((params_for_request or {}).items())))
            if key in visited:
                break
            visited.add(key)

            response = requests.get(
                next_url,
                headers=headers,
                params=params_for_request,
                timeout=REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()

            aggregated_data.extend(payload.get('data', []))
            if meta is None and isinstance(payload.get('meta'), dict):
                meta = payload.get('meta')

            pagination = {}
            if isinstance(payload.get('meta'), dict):
                pagination = payload['meta'].get('pagination') or {}

            links = payload.get('links') or {}
            raw_next = links.get('next') if isinstance(links, dict) else None

            next_url = None
            params_for_request = None

            if raw_next:
                if raw_next.startswith('http'):
                    next_url = raw_next
                else:
                    next_url = urljoin(f'{api_base}/', raw_next.lstrip('/'))
            else:
                current_page = pagination.get('current_page') if isinstance(pagination, dict) else None
                total_pages = pagination.get('total_pages') if isinstance(pagination, dict) else None
                if isinstance(current_page, int) and isinstance(total_pages, int) and current_page < total_pages:
                    next_url = url
                    params_for_request = dict(params)
                    params_for_request['page'] = current_page + 1

        if meta and isinstance(meta.get('pagination'), dict):
            pagination = dict(meta['pagination'])
            pagination['count'] = len(aggregated_data)
            meta = dict(meta)
            meta['pagination'] = pagination

        return jsonify({'data': aggregated_data, 'meta': meta})
    except requests.exceptions.HTTPError as exc:
        status_code = exc.response.status_code if exc.response else 502
        data = None
        try:
            data = exc.response.json() if exc.response else None
        except ValueError:
            data = exc.response.text if exc.response else None
        message = 'Firefly III API responded with an error.'
        if isinstance(data, dict) and data.get('message'):
            message = data['message']
        return jsonify({'message': message, 'details': data}), status_code
    except requests.exceptions.Timeout:
        return jsonify({'message': 'Request to Firefly III timed out.'}), 504
    except requests.exceptions.RequestException:
        return jsonify({'message': 'Unable to reach Firefly III API.'}), 502


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_client(path: str):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


if __name__ == '__main__':
    port = int(os.getenv('PORT', '3000'))
    app.run(host='0.0.0.0', port=port)
