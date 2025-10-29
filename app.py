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
        response = requests.get(
            url,
            headers={
                'Authorization': f'Bearer {token}',
                'Accept': 'application/vnd.api+json',
            },
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return jsonify(response.json())
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
