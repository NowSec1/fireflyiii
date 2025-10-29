const form = document.getElementById('query-form');
const resetBtn = document.getElementById('reset-btn');
const resultsSection = document.getElementById('results');
const summaryContainer = document.getElementById('summary');
const summaryFootnote = document.getElementById('summary-footnote');
const categoryTableBody = document.getElementById('category-table');
const currencyLabel = document.getElementById('currency');
const currencyControls = document.getElementById('currency-controls');
const currencySelect = document.getElementById('currency-selector');
const datasetCard = document.getElementById('dataset-card');
const datasetMeta = document.getElementById('dataset-meta');
const toast = document.getElementById('toast');
const baseUrlInput = document.getElementById('base-url');
const loadingOverlay = document.getElementById('loading-overlay');
const rangeHint = document.getElementById('range-hint');

const pieCanvas = document.getElementById('category-pie');
const barCanvas = document.getElementById('category-bar');

const STORAGE_KEY = 'firefly-dashboard-settings';

let pieChart;
let barChart;
let currencySummaries = [];
let activeMonth = '';

function formatCurrency(amount, currency = '') {
    const formatted = Number(amount || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return currency ? `${formatted} ${currency}` : formatted;
}

function formatNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toLocaleString();
    }
    return value ?? '—';
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function showToast(message, type = 'info', detail) {
    const suffix = detail ? ` · ${detail}` : '';
    toast.textContent = `${message}${suffix}`;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3200);
}

function formatErrorDetails(details) {
    if (!details) return '';
    if (typeof details === 'string') return details;
    if (Array.isArray(details)) {
        return details.filter((value) => typeof value === 'string').join('，');
    }
    if (typeof details === 'object') {
        const collected = [];
        Object.values(details).forEach((value) => {
            if (Array.isArray(value)) {
                value.forEach((item) => {
                    if (typeof item === 'string') {
                        collected.push(item);
                    }
                });
            } else if (typeof value === 'string') {
                collected.push(value);
            }
        });
        return collected.join('，');
    }
    return '';
}

function toggleLoading(active) {
    const primaryBtn = form.querySelector('.btn.primary');
    primaryBtn.disabled = active;
    primaryBtn.textContent = active ? '分析中...' : '分析消费';
    loadingOverlay.hidden = !active;
    if (active) {
        resultsSection.setAttribute('aria-busy', 'true');
    } else {
        resultsSection.removeAttribute('aria-busy');
    }
}

function loadPreferences() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return {};
        return JSON.parse(stored);
    } catch (error) {
        console.warn('Failed to load preferences', error);
        return {};
    }
}

function savePreferences(preferences) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
        console.warn('Failed to persist preferences', error);
    }
}

function toISODate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }
    const offsetMinutes = date.getTimezoneOffset();
    const adjusted = new Date(date.getTime() - offsetMinutes * 60000);
    return adjusted.toISOString().split('T')[0];
}

function getMonthRange(month) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return { start: '', end: '' };
    }
    const [year, monthPart] = month.split('-').map(Number);
    const startDate = new Date(year, monthPart - 1, 1);
    const endDate = new Date(year, monthPart, 0);
    return { start: toISODate(startDate), end: toISODate(endDate) };
}

async function fetchTransactions(token, month, baseUrl) {
    const { start, end } = getMonthRange(month);
    if (!start || !end) {
        const error = new Error('查询月份格式无效，请重新选择。');
        error.details = ['请选择有效的月份，例如 2024-05'];
        throw error;
    }
    const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token, start, end, baseUrl })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const message = error?.message || `请求失败：${response.status}`;
        const err = new Error(message);
        err.details = error?.details;
        throw err;
    }

    const payload = await response.json();
    return {
        data: payload.data ?? [],
        meta: payload.meta ?? {},
        range: { start, end }
    };
}

function flattenTransactions(data) {
    const transactions = [];

    data.forEach((item) => {
        const attributes = item.attributes || {};
        const entries = attributes.transactions || [];
        entries.forEach((tx) => {
            transactions.push({
                type: tx.type || attributes.transaction_type,
                amount: Number(tx.amount ?? attributes.amount ?? 0),
                currency: tx.currency_code || (attributes.currency_code ?? ''),
                category: tx.category_name || attributes.category_name || '未分类',
                description: tx.description || attributes.description || '',
                date: tx.date ?? attributes.date ?? null
            });
        });
    });

    return transactions;
}

function analyseByCurrency(transactions) {
    const expenseTx = transactions.filter((tx) => {
        const type = (tx.type || '').toLowerCase();
        return type === 'withdrawal' || type === 'expense';
    });

    const buckets = new Map();

    expenseTx.forEach((tx) => {
        const currency = tx.currency?.trim() || '未提供';
        const amount = Math.abs(Number(tx.amount) || 0);
        const category = tx.category?.trim() || '未分类';

        if (!buckets.has(currency)) {
            buckets.set(currency, {
                total: 0,
                count: 0,
                categories: new Map(),
                topTransaction: null,
            });
        }

        const bucket = buckets.get(currency);
        bucket.total += amount;
        bucket.count += 1;

        if (!bucket.categories.has(category)) {
            bucket.categories.set(category, { category, amount: 0, count: 0 });
        }

        const categoryEntry = bucket.categories.get(category);
        categoryEntry.amount += amount;
        categoryEntry.count += 1;

        const currentTop = bucket.topTransaction;
        if (!currentTop || amount > currentTop.amount) {
            bucket.topTransaction = {
                amount,
                category,
                description: tx.description || '',
                date: tx.date || '',
            };
        }
    });

    const currencies = Array.from(buckets.entries()).map(([currency, bucket]) => {
        const entries = Array.from(bucket.categories.values())
            .map((entry) => ({
                ...entry,
                percent: bucket.total > 0 ? entry.amount / bucket.total : 0,
            }))
            .sort((a, b) => b.amount - a.amount);

        return {
            currency,
            entries,
            total: bucket.total,
            count: bucket.count,
            average: bucket.count ? bucket.total / bucket.count : 0,
            topTransaction: bucket.topTransaction,
            topCategory: entries[0] || null,
        };
    });

    currencies.sort((a, b) => b.total - a.total);

    return {
        currencies,
        totalExpenseCount: expenseTx.length,
    };
}

function updateSummary(analysis, month) {
    summaryContainer.innerHTML = '';
    summaryFootnote.textContent = '';

    if (!analysis) {
        summaryContainer.innerHTML = '<p class="empty">本月暂无消费数据，或仅包含转账/收入。</p>';
        return;
    }

    const { total, average, count, currency, topTransaction, topCategory } = analysis;
    const [year, monthPart] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthPart, 0).getDate();
    const avgPerDay = daysInMonth ? total / daysInMonth : 0;

    const fragments = [
        {
            label: '总消费',
            value: formatCurrency(total, currency)
        },
        {
            label: '日均消费',
            value: formatCurrency(avgPerDay, currency)
        },
        {
            label: '平均单笔',
            value: `${formatCurrency(average, currency)} · ${formatNumber(count)} 笔`
        }
    ];

    if (topTransaction) {
        const details = [formatCurrency(topTransaction.amount, currency)];
        if (topTransaction.category) details.push(topTransaction.category);
        if (topTransaction.date) details.push(topTransaction.date);
        fragments.push({
            label: '最高单笔消费',
            value: details.join(' · ')
        });
    }

    fragments.forEach(({ label, value }) => {
        const item = document.createElement('div');
        item.className = 'summary-item';
        item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
        summaryContainer.appendChild(item);
    });

    if (topCategory) {
        summaryFootnote.textContent = `最高消费分类：${topCategory.category}（${formatCurrency(topCategory.amount, currency)} · ${formatPercent(topCategory.percent)}）`;
    }
}

function renderTable(entries, currency, count = 0) {
    categoryTableBody.innerHTML = '';
    if (!entries.length) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="4">没有符合条件的消费记录。</td>';
        categoryTableBody.appendChild(emptyRow);
        currencyLabel.textContent = '';
        return;
    }

    const parts = [`货币：${currency || '未提供'}`];
    if (count) {
        parts.push(`笔数：${formatNumber(count)}`);
    }
    currencyLabel.textContent = parts.join(' · ');

    entries.forEach((entry) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${entry.category}</td>
            <td>${entry.count}</td>
            <td>${formatCurrency(entry.amount, currency)}</td>
            <td>${formatPercent(entry.percent)}</td>
        `;
        categoryTableBody.appendChild(row);
    });
}

function renderCharts(entries, currency) {
    const labels = entries.map((entry) => entry.category);
    const amounts = entries.map((entry) => entry.amount);
    const percents = entries.map((entry) => Math.round(entry.percent * 1000) / 10);

    const palette = [
        '#4f46e5',
        '#22c55e',
        '#f97316',
        '#06b6d4',
        '#ec4899',
        '#8b5cf6',
        '#facc15',
        '#14b8a6',
        '#f43f5e',
        '#0ea5e9'
    ];

    const backgroundColors = labels.map((_, index) => palette[index % palette.length]);

    if (pieChart) pieChart.destroy();
    if (barChart) barChart.destroy();

    pieChart = new Chart(pieCanvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    data: amounts,
                    backgroundColor: backgroundColors,
                    borderWidth: 0,
                    hoverOffset: 8
                }
            ]
        },
        options: {
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const percent = percents[context.dataIndex];
                            return `${label}: ${formatCurrency(value, currency)} (${percent}%)`;
                        }
                    }
                }
            }
        }
    });

    barChart = new Chart(barCanvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    data: amounts,
                    backgroundColor: backgroundColors,
                    borderRadius: 8
                }
            ]
        },
        options: {
            indexAxis: labels.length > 6 ? 'y' : 'x',
            scales: {
                x: {
                    ticks: {
                        color: '#4b5563'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.2)'
                    }
                },
                y: {
                    ticks: {
                        color: '#4b5563'
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const value = typeof context.parsed.y === 'number' ? context.parsed.y : context.parsed.x;
                            return formatCurrency(value, currency);
                        }
                    }
                }
            }
        }
    });
}

function renderDatasetMeta(meta, range, expenseCount) {
    const pagination = meta?.pagination || {};

    const metrics = [
        { label: '返回记录数', value: formatNumber(pagination.count) },
        { label: '消费笔数', value: formatNumber(expenseCount) },
        { label: '获取页数', value: formatNumber(pagination.fetched_pages) },
        { label: '总页数', value: formatNumber(pagination.total_pages) },
        { label: '每页记录', value: formatNumber(pagination.per_page) },
        { label: '查询区间', value: range ? `${range.start} 至 ${range.end}` : '—' }
    ];

    datasetMeta.innerHTML = '';
    metrics.forEach(({ label, value }) => {
        const item = document.createElement('div');
        item.className = 'meta-item';
        item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
        datasetMeta.appendChild(item);
    });

    datasetCard.hidden = false;
}

function renderCurrencyOptions(currencies) {
    currencySelect.innerHTML = '';

    if (!currencies.length) {
        currencyControls.hidden = true;
        return;
    }

    currencies.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.currency;
        option.textContent = item.currency || '未提供';
        currencySelect.appendChild(option);
    });

    const firstCurrency = currencies[0];
    currencySelect.value = firstCurrency.currency;
    currencyControls.hidden = currencies.length <= 1;
}

function clearCharts() {
    if (pieChart) pieChart.destroy();
    if (barChart) barChart.destroy();
    pieChart = undefined;
    barChart = undefined;
}

function renderCurrencyView(currency) {
    if (!currencySummaries.length) {
        summaryContainer.innerHTML = '<p class="empty">本月暂无消费数据，或仅包含转账/收入。</p>';
        summaryFootnote.textContent = '';
        renderTable([], '');
        clearCharts();
        return;
    }

    const analysis = currencySummaries.find((item) => item.currency === currency) || currencySummaries[0];

    updateSummary(analysis, activeMonth);
    renderTable(analysis.entries, analysis.currency, analysis.count);

    if (analysis.entries.length) {
        renderCharts(analysis.entries, analysis.currency);
    } else {
        clearCharts();
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    const token = form.token.value.trim();
    const month = form.month.value;
    const baseUrl = baseUrlInput.value.trim() || undefined;

    if (!token || !month) {
        showToast('请填写完整的访问令牌和月份。', 'error');
        return;
    }

    toggleLoading(true);

    try {
        const { data, meta, range } = await fetchTransactions(token, month, baseUrl);
        activeMonth = month;
        updateRangeHint(month);

        const transactions = flattenTransactions(data);
        const analysis = analyseByCurrency(transactions);

        currencySummaries = analysis.currencies;
        renderDatasetMeta(meta, range, analysis.totalExpenseCount);
        renderCurrencyOptions(currencySummaries);

        resultsSection.hidden = false;

        if (!currencySummaries.length) {
            renderCurrencyView('');
            showToast('未找到消费数据，已忽略转账与收入。', 'warning');
        } else {
            const initialCurrency = currencySelect.value || currencySummaries[0].currency;
            renderCurrencyView(initialCurrency);
            showToast('消费数据分析完成！', 'success');
        }

        savePreferences({
            baseUrl: baseUrlInput.value.trim(),
            month
        });
    } catch (error) {
        console.error(error);
        const detail = formatErrorDetails(error.details);
        showToast(error.message || '请求数据时发生错误。', 'error', detail);
    } finally {
        toggleLoading(false);
    }
}

function handleReset() {
    form.reset();
    currencySummaries = [];
    activeMonth = '';

    resultsSection.hidden = true;
    summaryContainer.innerHTML = '';
    summaryFootnote.textContent = '';
    categoryTableBody.innerHTML = '';
    currencyLabel.textContent = '';
    datasetMeta.innerHTML = '';
    datasetCard.hidden = true;
    currencySelect.innerHTML = '';
    currencyControls.hidden = true;
    clearCharts();

    const preferences = loadPreferences();
    baseUrlInput.value = preferences.baseUrl || '';
    monthInput.value = preferences.month || getCurrentMonthValue();
    updateRangeHint(monthInput.value);

    showToast('已清空分析结果。');
}

form.addEventListener('submit', handleSubmit);
resetBtn.addEventListener('click', handleReset);

const monthInput = document.getElementById('month');

function getCurrentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function updateRangeHint(month) {
    if (!rangeHint) return;
    if (!month) {
        rangeHint.textContent = '请选择查询月份，系统将自动匹配完整日期范围。';
        return;
    }
    const { start, end } = getMonthRange(month);
    if (start && end) {
        rangeHint.textContent = `查询区间：${start} 至 ${end}`;
    } else {
        rangeHint.textContent = '无法识别该月份，请重新选择。';
    }
}

function applyInitialPreferences() {
    const preferences = loadPreferences();
    if (preferences.baseUrl) {
        baseUrlInput.value = preferences.baseUrl;
    }
    if (preferences.month) {
        monthInput.value = preferences.month;
    } else {
        monthInput.value = getCurrentMonthValue();
    }
    updateRangeHint(monthInput.value);
}

applyInitialPreferences();
currencySelect.addEventListener('change', (event) => {
    renderCurrencyView(event.target.value);
});
monthInput.addEventListener('change', (event) => {
    updateRangeHint(event.target.value);
});
monthInput.addEventListener('input', (event) => {
    updateRangeHint(event.target.value);
});
