const form = document.getElementById('query-form');
const resetBtn = document.getElementById('reset-btn');
const resultsSection = document.getElementById('results');
const summaryContainer = document.getElementById('summary');
const categoryTableBody = document.getElementById('category-table');
const currencyLabel = document.getElementById('currency');
const toast = document.getElementById('toast');

const pieCanvas = document.getElementById('category-pie');
const barCanvas = document.getElementById('category-bar');

let pieChart;
let barChart;

function formatCurrency(amount, currency = '') {
    const formatted = Number(amount || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return currency ? `${formatted} ${currency}` : formatted;
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3200);
}

function getMonthRange(month) {
    const [year, monthPart] = month.split('-').map(Number);
    const startDate = new Date(year, monthPart - 1, 1);
    const endDate = new Date(year, monthPart, 0);
    const toISO = (date) => date.toISOString().split('T')[0];
    return { start: toISO(startDate), end: toISO(endDate) };
}

const API_BASE_URL = 'http://csh.nowsec.top';

async function fetchTransactions(token, month) {
    const { start, end } = getMonthRange(month);
    const url = `${API_BASE_URL}/api/v1/transactions?start=${start}&end=${end}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.api+json'
        }
    });

    if (!response.ok) {
        throw new Error(`请求失败：${response.status}`);
    }

    const payload = await response.json();
    return payload.data ?? [];
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

function analyseExpenses(transactions) {
    const expenseTx = transactions.filter((tx) => {
        const type = (tx.type || '').toLowerCase();
        return type === 'withdrawal' || type === 'expense';
    });

    const currency = expenseTx[0]?.currency || '';
    const stats = new Map();

    expenseTx.forEach((tx) => {
        const category = tx.category?.trim() || '未分类';
        const amount = Math.abs(Number(tx.amount) || 0);
        if (!stats.has(category)) {
            stats.set(category, { category, amount: 0, count: 0 });
        }
        const entry = stats.get(category);
        entry.amount += amount;
        entry.count += 1;
    });

    const total = Array.from(stats.values()).reduce((sum, entry) => sum + entry.amount, 0);

    const entries = Array.from(stats.values())
        .map((entry) => ({
            ...entry,
            percent: total > 0 ? entry.amount / total : 0
        }))
        .sort((a, b) => b.amount - a.amount);

    return { entries, total, currency };
}

function updateSummary(total, entries, month, currency) {
    summaryContainer.innerHTML = '';
    if (!entries.length) {
        summaryContainer.innerHTML = '<p class="empty">本月暂无消费数据，或仅包含转账/收入。</p>';
        return;
    }

    const topCategory = entries[0];
    const [year, monthPart] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthPart, 0).getDate();
    const avgPerDay = daysInMonth ? total / daysInMonth : 0;

    const fragments = [
        {
            label: '总消费',
            value: formatCurrency(total, currency)
        },
        {
            label: `最高消费分类：${topCategory.category}`,
            value: `${formatCurrency(topCategory.amount, currency)} · ${formatPercent(topCategory.percent)}`
        },
        {
            label: '日均消费',
            value: formatCurrency(avgPerDay, currency)
        }
    ];

    fragments.forEach(({ label, value }) => {
        const item = document.createElement('div');
        item.className = 'summary-item';
        item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
        summaryContainer.appendChild(item);
    });
}

function renderTable(entries, currency) {
    categoryTableBody.innerHTML = '';
    if (!entries.length) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="4">没有符合条件的消费记录。</td>';
        categoryTableBody.appendChild(emptyRow);
        currencyLabel.textContent = '';
        return;
    }

    currencyLabel.textContent = `货币：${currency || '未提供'}`;

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

async function handleSubmit(event) {
    event.preventDefault();
    const token = form.token.value.trim();
    const month = form.month.value;

    if (!token || !month) {
        showToast('请填写完整的访问令牌和月份。', 'error');
        return;
    }

    form.querySelector('.btn.primary').disabled = true;
    form.querySelector('.btn.primary').textContent = '分析中...';

    try {
        const rawData = await fetchTransactions(token, month);
        const transactions = flattenTransactions(rawData);
        const { entries, total, currency } = analyseExpenses(transactions);

        if (!entries.length) {
            showToast('未找到消费数据，已忽略转账与收入。', 'warning');
        } else {
            showToast('消费数据分析完成！', 'success');
        }

        updateSummary(total, entries, month, currency);
        renderTable(entries, currency);
        if (entries.length) {
            renderCharts(entries, currency);
        } else {
            if (pieChart) pieChart.destroy();
            if (barChart) barChart.destroy();
        }

        resultsSection.hidden = false;
    } catch (error) {
        console.error(error);
        showToast(error.message || '请求数据时发生错误。', 'error');
    } finally {
        form.querySelector('.btn.primary').disabled = false;
        form.querySelector('.btn.primary').textContent = '分析消费';
    }
}

function handleReset() {
    form.reset();
    resultsSection.hidden = true;
    categoryTableBody.innerHTML = '';
    summaryContainer.innerHTML = '';
    currencyLabel.textContent = '';
    if (pieChart) pieChart.destroy();
    if (barChart) barChart.destroy();
    showToast('已清空分析结果。');
}

form.addEventListener('submit', handleSubmit);
resetBtn.addEventListener('click', handleReset);

const monthInput = document.getElementById('month');
const now = new Date();
monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
