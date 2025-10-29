# Firefly III 消费分析仪表盘

一个用于分析 Firefly III 当月消费结构的前后端分离示例。前端页面提供消费概览、分类图表与明细，后端使用 Python/Flask 代理转发请求，避免浏览器直接访问 Firefly III API 时遇到的 CORS 限制。

## 功能特性

- 输入个人访问令牌和月份，即可汇总当月消费数据（自动忽略转账与收入）。
- 提供分类饼图、金额柱状图以及笔数、金额、占比等详细统计。
- 支持自定义 Firefly III API 地址，方便连接不同实例。
- Flask 后端安全代理请求，屏蔽浏览器的跨域限制并隐藏访问令牌。
- 自动遍历 Firefly III 返回的分页结果，确保仪表盘展示完整数据。
- 自动校验日期格式与 API 地址，第一时间提示输入错误。
- 按货币拆分消费视图，可一键切换查看多币种统计。
- 数据集概览面板展示返回记录数、分页页数与查询区间，帮助确认已获取完整数据。
- 记住最近使用的 API 地址与月份，下次打开即可直接分析。

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

## 将代码推送到 GitHub

如果需要把本项目的代码同步到自己的 GitHub 仓库，可以使用仓库自带的辅助脚本：

1. 在 GitHub 上创建一个新的空仓库，例如 `https://github.com/your-user/fireflyiii`。
2. 在本地仓库根目录执行：

   ```bash
   scripts/push_to_github.sh git@github.com:your-user/fireflyiii.git main
   ```

   如未指定分支名，脚本会默认推送当前所在的分支。脚本会自动设置（或更新）`origin` 远程地址，并执行 `git push -u origin <branch>`，帮助你快速同步代码。

> **提示**：首次推送需要确保本地环境已配置好 SSH key 或 HTTPS 凭证，以便连接 GitHub。

首次推送成功后，脚本会把远程地址与分支记录到仓库根目录的 `.push_config`（已自动加入 `.gitignore`）。之后如需“再推送一次”，可直接运行：

```bash
scripts/push_again.sh
```

该脚本会复用保存的配置，自动更新 `origin` 并执行 `git push`，免去重复输入仓库地址与分支的步骤。

## 打包下载

执行以下脚本即可在 `dist/` 目录生成最新源码压缩包，便于分享或下载：

```bash
bash scripts/package_project.sh
```

脚本会输出 `dist/fireflyiii.zip`，默认排除 `dist/` 目录自身，可多次运行以刷新压缩包内容。

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
