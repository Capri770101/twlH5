# 跳舞兰 H5 —— 部署说明

## 一、目标服务器

| 项 | 值 |
|---|---|
| 公网 IP | `129.204.85.139` |
| 内网 IP | `172.16.16.7` |
| 环境 | 腾讯云 · TencentOS，nginx 1.14.1 |
| 现状 | **已有一个「跳舞兰AI花店管理后台」在运行**（用户所说的小程序后端系统） |

## 二、⚠️ 部署前必须解决的三个问题（2026-09-15 实测）

对目标机做只读探测后，发现三个会直接影响部署的事实：

### 1. nginx 没有做域名分流，所有域名都指向管理后台
实测 `www / h5 / api / m / store.tiaowulan.com` 以及裸 IP，**全部返回同一个「跳舞兰AI花店管理后台」**。
→ 说明当前 nginx 是**单站点配置**。新增 H5 的 `server` 块时，务必只用 `server_name` 精确匹配，
**绝不能加 `default_server`**，否则会把管理后台的流量抢走。

> **补充验证（2026-09-15 15:21）**：用完全不相干的域名（`baidu.com`、`example.org`、随机假域名）访问本机，
> **同样返回该管理后台** → 证明它是 nginx 的**默认站点（default server）**，负责兜底所有「未被 server_name 认领」的请求。
> 因此 `h5.tiaowulan.com` **并非被后台占用**，而是「尚未配置、被默认站点兜底」。
> ⚠️ 推论：给 h5 配置独立 server 块即可接管该域名，**不会影响后台**（它继续兜底其它域名）；
> 但若后台的 `server_name` 里**恰好写了 h5.tiaowulan.com**，则会冲突 —— 需看配置确认。

### 1.5 管理后台的路由结构（2026-09-15 15:09 补充实测）
- 后台是**单页应用挂在根路径 `/`**：页面引用 `/css/admin.css`、`/js/app.js`、`/js/server-api.js`、`/images/admin-logo-*.png`；切页用 query（如 `/?join=1`）。
- 后台的**后端 API 在 `/v1/`**：实测 `/v1/` 返回 Express 的 `Cannot GET /v1/` → 说明**有个 Express 后端正在运行**；前端用 Bearer `admin_auth_token` 调用。
- `/admin` 是 nginx 目录（`301 → /admin/` 后 `403`）；`/api/health` 等未知路径返回后台的 index.html（**SPA fallback，不是真后端**）。
- **含义（重要）**：根路径 `/` 已被后台占用。若 H5 与后台共用同一域名，必须明确「**谁占根路径、谁占子路径**」——
  建议 H5 占根路径（面向 C 端用户，路径要干净），后台迁到 `/admin` 或改用其它域名。
  ⚠️ 一旦给 `h5.tiaowulan.com` 配独立 server 块，该域名下**所有路径（含 `/v1/`、`/api/`）都会归 H5**；后台若也在用这个域名就会被抢，需先与后台负责人确认。

### 2. 域名已确定：`h5.tiaowulan.com`（2026-09-15 15:07 更新）
- ✅ **DNS 已解析到本机**（`h5.tiaowulan.com → 129.204.85.139`），HTTPS 证书可正常握手。
- ❌ **但 `https://h5.tiaowulan.com` 目前返回的仍是「管理后台」** —— 因为 nginx 未做域名分流（见第 1 条）。
  本次部署的核心动作就是：**新增 h5 的 server 块**，把该域名接管给 H5 静态站点。
- ⚠️ 动手前需确认：**管理后台实际用的是哪个域名**（若它也在用 h5 域名，接管后会改变其行为，需先与负责人确认）。

### 3. HTTP 被腾讯云「未备案」拦截（仍未解决）
`http://h5.tiaowulan.com` → 302 到 `dnspod.qcloud.com/static/webblock.html`（备案拦截页）；HTTPS 正常。
→ 需确认 `h5.tiaowulan.com` 的**备案状态**、是否完成腾讯云「接入备案」并绑定本实例。
  影响：HTTP 访问被拦（浏览器直输 http、部分外链会失败）；**HTTPS 正常，微信内授权/扫码主链路不受影响**，但建议尽快查清。

### 4. 端口占用（公网可见）
`22 开放`（SSH 可达）、`80/443 开放`（nginx）、**`8088`、`4000` 空闲**（H5 正好用这两个，不冲突）；
`3306` 未对外开放（MySQL 若在本机，默认只监听 127.0.0.1，符合安全预期）。

> 以上 1-3 未确认前，不建议直接动 nginx，以免影响正在运行的管理后台。

## 三、部署架构

```
                     ┌──────────────── 服务器（129.204.85.139）─────────────────┐
 用户浏览器           │                                                          │
   │  https://<H5域名> │   nginx :443  ── /        ──► 127.0.0.1:8088 (node server.cjs│
   └──────────────────┼─►             │               静态站点 dist/ + /agent 反代)   │
                      │               └── /api/    ──► 127.0.0.1:4000 (node src/index.js│
                      │                                  Express 业务后端 + MySQL)     │
                      │   systemd: twlh5-static / twlh5-api                        │
                      └────────────────────────────────────────────────────────────┘
```

- **静态站点 + 智能体反代**：`deploy/server.cjs`，端口 `8088`，托管 `dist/`，并把 `/agent/*` 转发到智能体平台。
  智能体地址由环境变量 `AGENT_TARGET` 控制（**后续智能体单独部署到别的机器时，只改这个变量**，支持 http/https）。
- **业务后端**：`server/`，端口 `4000`，读写本机 MySQL 业务库 `h5_shop`。
- 两者都用 **systemd** 守护，不再依赖人工后台常驻。

## 四、首次初始化（在服务器上执行）

```bash
# 1) 建目录
sudo mkdir -p /opt/twlh5-h5 /opt/twlh5-api
sudo chown -R $USER:$USER /opt/twlh5-h5 /opt/twlh5-api

# 2) 安装 systemd 服务
sudo cp deploy/systemd/twlh5-static.service /etc/systemd/system/
sudo cp deploy/systemd/twlh5-api.service   /etc/systemd/system/
sudo systemctl daemon-reload

# 3) 配置业务后端环境变量（含密钥，权限 600）
cp deploy/env.example /opt/twlh5-api/.env
chmod 600 /opt/twlh5-api/.env
vi /opt/twlh5-api/.env          # 填 DB / 微信 / 短信 / 支付 等真实值

# 4) 建业务库（root 执行，见 server/sql/）
mysql -uroot -p < server/sql/h5_shop.sql
mysql -uroot -p < server/sql/2026-09-15_users_auth.sql   # users 表补账号密码字段

# 5) 放置微信支付商户私钥
mkdir -p /opt/twlh5-api/certs && cp apiclient_key.pem /opt/twlh5-api/certs/ && chmod 600 /opt/twlh5-api/certs/*

# 6) 配置 nginx（新增独立 server 块，⚠️ 不要动现有管理后台的配置、不要加 default_server）
sudo cp deploy/nginx/h5.tiaowulan.com.conf /etc/nginx/conf.d/
#    证书放到 /etc/nginx/ssl/<域名>/ 后 nginx -t && systemctl reload nginx

# 7) 启动
sudo systemctl enable --now twlh5-static twlh5-api
```

## 五、日常部署（在本地执行）

```bash
HOST=129.204.85.139 SSH_USER=admin ./deploy/deploy.sh
```

脚本会：构建前端 → 上传 `dist/` 与 `server.cjs` → 上传后端（保留远端 `.env`/证书）→ 重启服务 → 冒烟检查。

## 六、待确认清单（部署前）

- [ ] **SSH 登录方式**：用户名 + 私钥/密码
- [x] **H5 域名**：已确定 `h5.tiaowulan.com`，DNS 已解析到本机（HTTPS 可用，内容待接管）
- [ ] **域名备案**：确认备案状态 / 是否完成腾讯云接入备案（HTTP 目前被拦，HTTPS 正常）
- [ ] **HTTPS 证书**：新签还是复用
- [ ] **业务库位置**：本机 MySQL 还是独立库；是否需要申请白名单
- [ ] **管理后台的 nginx 配置**：需要先备份，确认新增 server 块不影响它
