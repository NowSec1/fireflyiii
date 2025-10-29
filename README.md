# Firefly III 消费分析仪表盘

一个用于分析 Firefly III 当月消费结构的前后端分离示例。前端页面提供消费概览、分类图表与明细，后端使用 Python/Flask 代理转发请求，避免浏览器直接访问 Firefly III API 时遇到的 CORS 限制。

## 功能特性

- 输入个人访问令牌和月份，即可汇总当月消费数据（自动忽略转账与收入）。
- 提供分类饼图、金额柱状图以及笔数、金额、占比等详细统计。
- 支持自定义 Firefly III API 地址，方便连接不同实例。
- Flask 后端安全代理请求，屏蔽浏览器的跨域限制并隐藏访问令牌。
- 自动遍历 Firefly III 返回的分页结果，确保仪表盘展示完整数据。

## 快速开始

1. （可选）创建并激活虚拟环境。
2. 安装依赖：

   ```bash
   pip install -r requirements.txt
   ```

3. （可选）配置默认的 Firefly III API 地址（需包含 `/api/v1` 路径），默认值为 `http://csh.nowsec.top/api/v1`：

   ```bash
   export FIREFLY_API_BASE="https://your-firefly-host/api/v1"
   ```

4. 启动服务：

   ```bash
   python app.py
   ```

   应用默认监听 `http://localhost:3000`，访问页面即可输入令牌和月份开始分析。

## 配置项

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `FIREFLY_API_BASE` | 默认的 Firefly III API 根地址（需包含 `/api/v1`）。 | `http://csh.nowsec.top/api/v1` |
| `FIREFLY_TIMEOUT` | 请求 Firefly III API 的超时时间（秒）。 | `15` |
| `PORT` | Flask 服务监听的端口。 | `3000` |

## 目录结构

```
.
├── app.py            # Flask 后端入口
├── public/           # 前端静态资源（HTML、CSS、JS）
└── requirements.txt  # Python 依赖
```

## 许可证

MIT
