#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生产端补丁：让商家后端支持 H5 渠道（source）+ H5 单的退款审核与执行分离。

改两个文件：
  A) /opt/flower-shop/server.js   —— 三处（orders/create 存 source、refund-approve/reject 按 source 分支）
  B) /opt/admin/js/app.js         —— 一处（订单商品优先显示 item.image，即 H5 的 DIY 效果图）

设计要点（与测试端已验证的补丁完全一致）：
  * source 默认 'mini' → 存量订单与小程序单行为 100% 不变
  * H5 单的 refund-approve 只写审核结果，绝不调用微信退款（避免与 H5 重复出账）
  * H5 单的 refund-reject 只写结果并把门店侧状态恢复到申请前

安全性：字节级替换（避开文件里历史乱码注释）、幂等、锚点不唯一即中止、语法失败自动回滚。
"""
import os, re, shutil, subprocess, sys, time

NODE = "/opt/node-v22.23.2-linux-x64/bin/node"
TS = time.strftime("%Y%m%d-%H%M%S")
BK = "/root/backups-flower-shop/" + TS
os.makedirs(BK, exist_ok=True)
print("备份目录 ->", BK)

F = "/opt/flower-shop/server.js"
A = "/opt/admin/js/app.js"


def check(path):
    r = subprocess.Popen([NODE, "--check", path], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = r.communicate()[0].decode("utf-8", "replace")
    return r.returncode == 0, out


# ======================================================================
# A) server.js
# ======================================================================
MARK = "order.source === 'h5'"

if not os.path.exists(F):
    sys.exit("找不到 " + F)

shutil.copy2(F, os.path.join(BK, "server.js"))
print("备份 server.js ->", os.path.join(BK, "server.js"))

with open(F, "rb") as fh:
    src = fh.read()

if MARK.encode() in src:
    print("[A] 已打过补丁，跳过")
else:
    orig_len = len(src)

    # -------- A1) orders/create：接收并保存 source --------
    a1 = b"    profitSharingRatio: paymentConfig.profitSharingRatio\n  };"
    n1 = src.count(a1)
    assert n1 == 1, "锚点A1 命中 %d 次（应为 1），已中止，未改动文件" % n1
    b1 = (b"    profitSharingRatio: paymentConfig.profitSharingRatio,\n"
          b"    source: String(req.body.source || 'mini')\n"
          b"  };")
    src = src.replace(a1, b1, 1)
    print("[A1/3] orders/create 已支持 source 字段（默认 mini）")

    route_a = b"app.put('/v1/merchant/order/refund-approve', async (req, res) => {"
    route_r = b"app.put('/v1/merchant/order/refund-reject', (req, res) => {"
    probe = b"return res.json({ code: 400, message:"
    assert src.count(route_a) == 1, "approve 路由命中 %d 次" % src.count(route_a)
    assert src.count(route_r) == 1, "reject 路由命中 %d 次" % src.count(route_r)

    # -------- A2) refund-approve：H5 单只标记、不调微信 --------
    ia = src.index(route_a)
    ja = src.index(probe, ia)
    ea = src.index(b"\n", ja) + 1
    block_a = (
        b"\n"
        b"  // [H5] H5 channel: the money is collected and refunded by the H5 side.\n"
        b"  //      Record the review result ONLY - never call WeChat refund here,\n"
        b"  //      otherwise the same order would be refunded twice.\n"
        b"  if (order.source === 'h5') {\n"
        b"    order.refundAudit = {\n"
        b"      status: 'approved',\n"
        b"      by: String((req.body && req.body.by) || 'merchant'),\n"
        b"      at: new Date().toISOString()\n"
        b"    };\n"
        b"    writeData(data, { mode: 'order', order });\n"
        b"    console.log('[refund-audit] H5 order approved (no WeChat call):', id);\n"
        b"    return res.json({ code: 0, data: { refundAudit: order.refundAudit },\n"
        b"      message: 'APPROVED_H5_EXECUTE_BY_H5' });\n"
        b"  }\n"
    )
    src = src[:ea] + block_a + src[ea:]
    print("[A2/3] refund-approve 已支持 H5 分支（只标记不退款）")

    # -------- A3) refund-reject：H5 单只标记拒绝 --------
    ir = src.index(route_r)
    jr = src.index(probe, ir)
    er = src.index(b"\n", jr) + 1
    block_r = (
        b"\n"
        b"  // [H5] H5 channel: record the rejection only, let H5 restore its own state.\n"
        b"  if (order.source === 'h5') {\n"
        b"    order.refundAudit = {\n"
        b"      status: 'rejected',\n"
        b"      reason: String((req.body && req.body.reason) || 'merchant rejected').slice(0, 255),\n"
        b"      by: String((req.body && req.body.by) || 'merchant'),\n"
        b"      at: new Date().toISOString()\n"
        b"    };\n"
        b"    const restore = String((req.body && req.body.restoreStatus) || 'paid');\n"
        b"    if (['pending','paid','making','delivering','completed'].indexOf(restore) >= 0) {\n"
        b"      order.status = restore;\n"
        b"      order.statusText = STATUS_MAP[restore] || restore;\n"
        b"    }\n"
        b"    writeData(data, { mode: 'order', order });\n"
        b"    console.log('[refund-audit] H5 order rejected, restored to', order.status, ':', id);\n"
        b"    return res.json({ code: 0, data: { refundAudit: order.refundAudit, status: order.status },\n"
        b"      message: 'REJECTED_H5' });\n"
        b"  }\n"
    )
    src = src[:er] + block_r + src[er:]
    print("[A3/3] refund-reject 已支持 H5 分支（只标记拒绝）")

    with open(F, "wb") as fh:
        fh.write(src)
    os.chown(F, 0, os.stat(F).st_gid)
    os.chmod(F, 0o640)
    print("server.js 大小 %d -> %d 字节" % (orig_len, len(src)))

ok, out = check(F)
print("[A] node --check:", "OK" if ok else "FAILED")
if not ok:
    print(out)
    shutil.copy2(os.path.join(BK, "server.js"), F)
    print("已回滚 server.js")
    sys.exit(1)

txt = open(F, "r", encoding="utf-8", errors="replace").read()
for label, pat in [("source 字段", r"source: String\(req\.body\.source[^\n]*"),
                   ("approve H5 分支", r"if \(order\.source === 'h5'\) \{\n    order\.refundAudit = \{\n      status: 'approved'"),
                   ("reject H5 分支", r"if \(order\.source === 'h5'\) \{\n    order\.refundAudit = \{\n      status: 'rejected'")]:
    print("    含有 %s: %s" % (label, "是" if re.search(pat, txt) else "否"))

# ======================================================================
# B) admin/js/app.js
# ======================================================================
if not os.path.exists(A):
    sys.exit("找不到 " + A)

shutil.copy2(A, os.path.join(BK, "admin-app.js"))
print("\n备份 admin/js/app.js ->", os.path.join(BK, "admin-app.js"))

with open(A, "rb") as fh:
    asrc = fh.read()

if b"itemImage" in asrc:
    print("[B] 已打过补丁，跳过")
else:
    orig = len(asrc)

    a1 = b"  getProductPrimaryImage(product) {\n    if (!product) return '';\n"
    assert asrc.count(a1) == 1, "锚点B1 命中 %d 次" % asrc.count(a1)
    b1 = (b"  getProductPrimaryImage(product, orderItem) {\n"
          b"    // H5 orders may carry a DIY rendered image on the order item itself.\n"
          b"    const itemImage = orderItem && (orderItem.image\n"
          b"      || (Array.isArray(orderItem.images) ? orderItem.images.find(Boolean) : ''));\n"
          b"    if (itemImage) return itemImage;\n"
          b"    if (!product) return '';\n")
    asrc = asrc.replace(a1, b1, 1)
    print("[B1/3] getProductPrimaryImage 已支持订单项图片")

    a2 = b"const img = this.getProductPrimaryImage(flower);"
    assert asrc.count(a2) == 1, "锚点B2 命中 %d 次" % asrc.count(a2)
    asrc = asrc.replace(a2, b"const img = this.getProductPrimaryImage(flower, i);", 1)
    print("[B2/3] 订单卡片调用处已传入 item")

    a3 = b"const image = this.getProductPrimaryImage(product);"
    assert asrc.count(a3) == 1, "锚点B3 命中 %d 次" % asrc.count(a3)
    asrc = asrc.replace(a3, b"const image = this.getProductPrimaryImage(product, item);", 1)
    print("[B3/3] 订单详情调用处已传入 item")

    with open(A, "wb") as fh:
        fh.write(asrc)
    print("app.js 大小 %d -> %d 字节" % (orig, len(asrc)))

ok, out = check(A)
print("[B] node --check:", "OK" if ok else "FAILED")
if not ok:
    print(out)
    shutil.copy2(os.path.join(BK, "admin-app.js"), A)
    print("已回滚 app.js")
    sys.exit(1)

atxt = open(A, "r", encoding="utf-8", errors="replace").read()
for label, needle in [("itemImage 兜底", "const itemImage"),
                      ("卡片调用", "getProductPrimaryImage(flower, i)"),
                      ("详情调用", "getProductPrimaryImage(product, item)")]:
    print("    含有 %s: %s" % (label, "是" if needle in atxt else "否"))

print("\n完成。备份在", BK)
print("下一步：systemctl restart flower-shop")
