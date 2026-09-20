# deploy/patches —— 商家后端（flower-shop）补丁

## 为什么需要这个目录

生产环境 `/opt/flower-shop`（= `:3456`，小程序后端）**没有 git、没有部署脚本**，代码只以文件形式存在于服务器上。

这意味着：**任何人整文件发布都会静默覆盖掉别人打过的改动，而且没人会知道。**

所以凡是"直接改生产文件"的改动，都必须同时以补丁脚本的形式入库 —— 这是**防止改动丢失的唯一保险**。

## 目录内容

| 文件 | 作用 |
|---|---|
| `flower-shop-h5-channel.py` | 让商家后端支持 H5 渠道：① `orders/create` 存 `source` 字段；② `refund-approve` / `refund-reject` 对 `source==='h5'` 的订单只记录审核结果、**绝不调用微信退款**；③ 商家后台订单商品优先显示 `item.image`（H5 的 DIY 效果图） |
| `flower-shop-service-login.py` | **新增**服务间登录端点 `POST /v1/auth/service-login`（仅回环来源 + `X-Service-Token` 定时安全比较），让 H5 订单桥接不再依赖 `phone-login` 里 `code !== '888888'` 的**短信绕过漏洞**。同时生成/复用密钥 `/opt/flower-shop/service-token.txt`（64 位 hex，`root:flowerapp 0640`）。**未改动任何既有代码**（phone-login 一行未动） |

## 用法

```bash
# 在服务器上执行（幂等：已打过会跳过）
scp deploy/patches/flower-shop-h5-channel.py root@<host>:/root/_patch.py
ssh root@<host> 'python3 /root/_patch.py'

# service-login 补丁可传目标文件（默认生产实例；其它实例传自己的 server.js 路径）
ssh root@<host> 'python3 /root/flower-shop-service-login.py'
ssh root@<host> 'python3 /root/flower-shop-service-login.py /opt/<其它实例>/server.js'
#   密钥优先复用：本实例已有 → /opt/flower-shop/service-token.txt → 都没有才新生成
#   脚本结束会打印密钥，供填进 H5 侧 .env 的 MERCHANT_BRIDGE_SERVICE_TOKEN

# 生效
ssh root@<host> 'systemctl restart flower-shop'
#   ⚠️ 重启后会短暂影响 H5 商品链路 → 必须复查 /v1/flowers/list 与 H5 /api/flowers
```

脚本特性：

- **幂等** —— `h5-channel` 用 `order.source === 'h5'` 作标记；`service-login` 用 `app.post('/v1/auth/service-login'` 作标记
- **自动备份** —— 改前把原文件复制到 `/root/backups-flower-shop/<时间戳>-<实例名>/`
- **锚点校验** —— 锚点命中次数不为 1 时**中止且不写文件**（避免改错位置）
- **语法校验 + 自动回滚** —— `node --check` 失败立即还原备份并退出码 1
- **字节级替换** —— 生产文件里混有历史遗留的乱码注释（GBK 误存），按字节锚点可绕开
- 🔴 **插入的 JS 代码块必须是纯 ASCII** —— Python 的 bytes 字面量不允许非 ASCII 字符；
  中文用 `\uXXXX` 交给 JS 解释，正则用 `\\d`。写完务必用 `ast.literal_eval` 取出真实字节再跑一次 `node --check`

## 打补丁后必须验证

```bash
# 1. 语法
/opt/node-v22.23.2-linux-x64/bin/node --check /opt/flower-shop/server.js

# 2. 三处改动都在
grep -n "order.source === 'h5'" /opt/flower-shop/server.js      # 应有 2 处
grep -n "source: String(req.body.source" /opt/flower-shop/server.js  # 应有 1 处
grep -c itemImage /opt/admin/js/app.js                          # 应 >= 1

# 3. 服务与核心接口
systemctl restart flower-shop && sleep 6 && systemctl is-active flower-shop
for p in /v1/home/index /v1/flowers/list /v1/shops/list /admin/; do
  printf '  %-22s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3456$p)"
done

# 4. 订单数据未受影响（与改前快照比对）

# 5. service-login 补丁专用检查
grep -c "app.post('/v1/auth/service-login'" /opt/flower-shop/server.js   # 应为 1
ls -la /opt/flower-shop/service-token.txt                                # root:flowerapp 0640
T=$(cat /opt/flower-shop/service-token.txt | tr -d '\n')
# 正确令牌（回环）→ 应 code=0 且带 token
curl -s -X POST http://127.0.0.1:3456/v1/auth/service-login \
  -H "Content-Type: application/json" -H "X-Service-Token: $T" -d '{"phone":"13900000001"}'
# 错误令牌 / 不带令牌 → 都应 {"code":403,"message":"forbidden"}
curl -s -X POST http://127.0.0.1:3456/v1/auth/service-login \
  -H "Content-Type: application/json" -H "X-Service-Token: wrong" -d '{"phone":"13900000001"}'
# H5 侧是否已切到该通道
curl -s http://127.0.0.1:4000/api/health | python3 -c "import sys,json;print(json.load(sys.stdin)['merchantBridge'])"
#   ↓ 期望 loginMode 为 service-token（不是 phone-login）
```

## 回滚

```bash
ls /root/backups-flower-shop/            # 找最近的时间戳目录
cp /root/backups-flower-shop/<ts>/server.js  /opt/flower-shop/server.js
cp /root/backups-flower-shop/<ts>/admin-app.js /opt/admin/js/app.js
systemctl restart flower-shop
```

## 已在生产执行记录

| 日期 | 补丁 | 备份目录 | 结果 |
|---|---|---|---|
| 2026-09-18 | h5-channel（4 处） | `/root/backups-flower-shop/20260918-171543/` | ✅ 语法通过、服务正常、数据无损、与测试端逐字节比对一致（仅 2 行注释措辞差异） |
| 2026-09-18 | service-login（新增 1 个端点） | `/root/backups-flower-shop/20260918-180726-flower-shop/` | ✅ 语法通过；正确令牌 200 / 错误与缺失令牌 403；桥接 `loginMode=service-token`，判别测试确认走新通道；phone-login 与 888888 **未受影响**；重启后商品链路 200（1177 款） |

## ⚠️ 给同事的提醒

这些补丁是"绕过源码直接改生产文件"。**正确做法是把这些改动合并回你自己的源码仓库**，否则下次你发版整文件覆盖时，这些改动会凭空消失 —— 而且 H5 渠道的订单会突然开始重复出账 / 卡死。

判断是否被覆盖：

```bash
grep -c "order.source === 'h5'" /opt/flower-shop/server.js                    # 0 = 已被覆盖
grep -c "app.post('/v1/auth/service-login'" /opt/flower-shop/server.js        # 0 = 已被覆盖
```

两项任一为 0 都要重打对应补丁（幂等）：`python3 deploy/patches/<脚本>.py`

### 关于 `service-login` 这个端点

它是一条**服务间鉴权入口**，请一并纳入你们的代码审查：

- **不是无条件后门**：只接受**回环来源**（`127.0.0.1` / `::1`），且 `X-Service-Token` 必须与
  `/opt/flower-shop/service-token.txt` 内容**定时安全比较**一致；密钥文件缺失或为空时**一律 403**。
- **为什么需要它**：H5 订单桥接原本依赖 `phone-login` 里 `code !== '888888'` 的短信绕过漏洞。
  那个漏洞你们**该修**，修了之后如果桥接还挂在 `phone-login` 上就会**静默中断**；
  所以专门做了这条独立通道，**修 `888888` 时无需顾虑它**。
- **建议**：把它当成正式的「服务间调用」能力长期保留（生产方是同一台机上的 H5 后端），
  或按你们的内网鉴权规范改造后替换。密钥轮换：改 `service-token.txt` 后同步改 H5 侧
  `MERCHANT_BRIDGE_SERVICE_TOKEN`，再 `systemctl restart flower-shop twlh5-api`。
