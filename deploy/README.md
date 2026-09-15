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

### 2. `h5.tiaowulan.com` 目前被管理后台占用
既然所有域名都落到管理后台，H5 若用 `h5.tiaowulan.com`，等于**改变现有行为**。
→ 需与管理后台负责人确认：该域名可否让给 H5，或 H5 改用新子域名（如 `h5shop.tiaowulan.com`）。

### 3. HTTP 被腾讯云「未备案」拦截
`http://h5.tiaowulan.com` → 302 到 `dnspod.qcloud.com/static/webblock.html`（备案拦截页），HTTPS 正常。
→ 需确认 `h5.tiaowulan.com` 的**备案是否已注销**，以及备案是否绑定到本台服务器实例。
  在大陆用 80/443 对外服务，**域名必须完成接入备案**，否则随时会被拦。

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
- [ ] **H5 用哪个域名**：`h5.tiaowulan.com`（需管理后台让出）还是新子域名
- [ ] **域名备案**：确认已备案且绑定本服务器实例（否则大陆 80/443 会被拦）
- [ ] **HTTPS 证书**：新签还是复用
- [ ] **业务库位置**：本机 MySQL 还是独立库；是否需要申请白名单
- [ ] **管理后台的 nginx 配置**：需要先备份，确认新增 server 块不影响它
