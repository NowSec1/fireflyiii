import math
import os
from datetime import datetime
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

    parsed = urlparse(trimmed)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError('API 地址无效，请输入包含协议的完整 URL。')

    base = (f"{parsed.scheme}://{parsed.netloc}{parsed.path}").rstrip('/')
    if not base.lower().endswith('/api/v1'):
        base = f"{base}/api/v1"
    return base


def ensure_iso_date(value: str | None, field_name: str) -> str:
    if not value or not isinstance(value, str):
        raise ValueError(f'{field_name} 缺失或格式不正确。')

    try:
        datetime.strptime(value, '%Y-%m-%d')
    except ValueError as exc:
        raise ValueError(f'{field_name} 必须为 YYYY-MM-DD 格式。') from exc

    return value


@app.post('/api/transactions')
def proxy_transactions():
    payload = request.get_json(silent=True) or {}

    token = payload.get('token')
    start = payload.get('start')
    end = payload.get('end')
    base_url = payload.get('baseUrl')

    if not token or not isinstance(token, str) or not token.strip():
        return jsonify({'message': '缺少个人访问令牌。'}), 400

    try:
        start = ensure_iso_date(start, '开始日期')
        end = ensure_iso_date(end, '结束日期')
        if start > end:
            raise ValueError('开始日期不能晚于结束日期。')
        api_base = resolve_api_base(base_url)
    except ValueError as exc:
        return jsonify({'message': str(exc)}), 400

    params = {'start': start, 'end': end}
    url = urljoin(f'{api_base}/', 'transactions')

    try:
        headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.api+json',
        }

        aggregated_data: list[dict] = []
        meta: dict | None = None
        per_page: int | None = None
        pages_fetched = 0

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
                if per_page is None:
                    raw_per_page = pagination.get('per_page')
                    if isinstance(raw_per_page, int) and raw_per_page > 0:
                        per_page = raw_per_page

            links = payload.get('links') or {}
            raw_next = links.get('next') if isinstance(links, dict) else None

            next_url = None
            params_for_request = None
            pages_fetched += 1

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

        pagination_details: dict = {}
        if meta and isinstance(meta.get('pagination'), dict):
            pagination_details = dict(meta['pagination'])

        if per_page is None:
            per_page = pagination_details.get('per_page') if isinstance(pagination_details.get('per_page'), int) else None
        if not per_page:
            per_page = len(aggregated_data) if aggregated_data else None

        total_records = len(aggregated_data)
        total_pages = math.ceil(total_records / per_page) if per_page else (1 if total_records else 0)

        pagination_details.update(
            {
                'count': total_records,
                'total': total_records,
                'per_page': per_page,
                'total_pages': total_pages,
                'fetched_pages': pages_fetched,
            }
        )

        meta = dict(meta or {})
        meta['pagination'] = pagination_details

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
