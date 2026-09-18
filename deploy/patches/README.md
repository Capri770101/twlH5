# deploy/patches —— 商家后端（flower-shop）补丁

## 为什么需要这个目录

生产环境 `/opt/flower-shop`（= `:3456`，小程序后端）**没有 git、没有部署脚本**，代码只以文件形式存在于服务器上。

这意味着：**任何人整文件发布都会静默覆盖掉别人打过的改动，而且没人会知道。**

所以凡是"直接改生产文件"的改动，都必须同时以补丁脚本的形式入库 —— 这是**防止改动丢失的唯一保险**。

## 目录内容

| 文件 | 作用 |
|---|---|
| `flower-shop-h5-channel.py` | 让商家后端支持 H5 渠道：① `orders/create` 存 `source` 字段；② `refund-approve` / `refund-reject` 对 `source==='h5'` 的订单只记录审核结果、**绝不调用微信退款**；③ 商家后台订单商品优先显示 `item.image`（H5 的 DIY 效果图） |

## 用法

```bash
# 在服务器上执行（幂等：已打过会跳过）
scp deploy/patches/flower-shop-h5-channel.py root@<host>:/root/_patch.py
ssh root@<host> 'python3 /root/_patch.py'

# 生效
ssh root@<host> 'systemctl restart flower-shop'
```

脚本特性：

- **幂等** —— 用 `order.source === 'h5'` 作为标记，已打过直接跳过
- **自动备份** —— 改前把原文件复制到 `/root/backups-flower-shop/<时间戳>/`
- **锚点校验** —— 锚点命中次数不为 1 时**中止且不写文件**（避免改错位置）
- **语法校验 + 自动回滚** —— `node --check` 失败立即还原备份并退出码 1
- **字节级替换** —— 生产文件里混有历史遗留的乱码注释（GBK 误存），按字节锚点可绕开

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

## ⚠️ 给同事的提醒

这个补丁是"绕过源码直接改生产文件"。**正确做法是把这些改动合并回你自己的源码仓库**，否则下次你发版整文件覆盖时，这些改动会凭空消失 —— 而且 H5 渠道的订单会突然开始重复出账 / 卡死。

判断是否被覆盖：

```bash
grep -c "order.source === 'h5'" /opt/flower-shop/server.js   # 0 = 已被覆盖，需要重打补丁
```
