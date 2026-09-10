# H5 官网 HTTPS 部署说明（h5.tiaowulan.com）

> 适用：把当前 `http://8.138.248.173:8088` 验收版升级为正式 `https://h5.tiaowulan.com`
> 证书文件：`27144781_h5.tiaowulan.com_nginx.zip`（已下载，含 `.pem` + `.key`）

## 一、前置确认（决定能否接微信）

1. **域名备案**：`tiaowulan.com` 是否已完成 ICP 备案？
   - 微信网页授权 / 微信支付一律要求域名已备案。证书能签发 ≠ 已备案。
   - 未备案 → 先去腾讯云/阿里云提交备案（1~2 周），期间只能继续用 IP 验收版。
2. **DNS 解析**：A 记录 `h5 → 8.138.248.173` 已添加，等生效（几分钟~1h），浏览器开 `http://h5.tiaowulan.com:8088` 能开即通。

## 二、证书放服务器

> 实际部署（2026-09-09）：服务器**已预装 nginx 并运行在 80/443**，主站 `www.tiaowulan.com` 配置在 `/etc/nginx/conf.d/tiaowulan.conf`（Let's Encrypt）。H5 作为**新增独立 server 块**挂入，未改动任何现有配置。

```bash
# 证书放到 nginx 的 ssl 目录（与现有约定一致）
mkdir -p /etc/nginx/ssl/h5.tiaowulan.com
# 把两个证书文件传到该目录（证书已解压在本地某处）
scp h5.tiaowulan.com.pem h5.tiaowulan.com.key root@8.138.248.173:/etc/nginx/ssl/h5.tiaowulan.com/
# 服务器上确保权限正确（私钥不要外泄）
chmod 644 /etc/nginx/ssl/h5.tiaowulan.com/h5.tiaowulan.com.pem
chmod 600 /etc/nginx/ssl/h5.tiaowulan.com/h5.tiaowulan.com.key
```

## 三、部署 Nginx 站点（已预装，无需重装）

> 2026-09-09 实际已执行：证书已上传、配置已写入 `/etc/nginx/conf.d/h5.tiaowulan.com.conf`、`nginx -t` 通过并已 `nginx -s reload`。以下步骤供复现/排障参考。

```bash
# 把 deploy/nginx/h5.tiaowulan.com.conf 传到服务器
scp deploy/nginx/h5.tiaowulan.com.conf root@8.138.248.173:/etc/nginx/conf.d/

# 校验配置
nginx -t
# 热重载（不中断现有站点）
nginx -s reload
# 或 systemctl reload nginx
```

> 配置里 `location /` 反代到现有 `server.cjs :8088`；`location /api/` 反代到未来的 Node 后端 `:4000`。
> 若暂时只跑前端，`:4000` 后端没起也不影响首页/顾问页（/api 暂时 502，但前端有 mock 兜底）。

## 五、验收

1. 浏览器开 `https://h5.tiaowulan.com` → 应自动跳 HTTPS 且显示小锁。
2. 顾问页 `/advisor` 流式对话正常（/agent 经 Nginx 反代到 api.tiaowulan.com）。
3. 微信网页授权域名、支付域名、JS 安全域名 均填 `h5.tiaowulan.com` 后，即可联调登录/支付。

## 六、注意事项

- **私钥 `.key` 是机密**：只存服务器 + 本地备份，绝不进 Git、绝不发群、绝不截图外发。
- **证书有效期**：在腾讯云 SSL 控制台查看，到期前 30 天会提醒，记得续签（免费 DV 通常 1 年）。
- **当前 8088 服务要常驻**：Nginx 只是 TLS 前端，后端 `server.cjs` 仍需 `setsid node server.cjs` 跑着（或改 systemd 管理）。
- **微信侧三件套域名一致**：公众号网页授权域名、微信支付 H5/JS 支付域名、JS 接口安全域名，全部写 `h5.tiaowulan.com`（不带 http/端口）。
