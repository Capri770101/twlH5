#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生产端补丁：给商家后端新增「服务间登录」通道，供 H5 订单桥接使用。

背景（为什么必须做）：
  H5 订单桥接目前靠 `/v1/auth/phone-login` 里 `code !== '888888'` 的**硬编码短信绕过**
  换取 token。那是审计里标记的安全漏洞 —— 同事一旦修掉，H5 订单投递会**静默中断**。

本补丁的做法（与 888888 解耦）：
  * 新增一个**独立**端点 `POST /v1/auth/service-login`，**完全不改动 phone-login**
    → 同事以后修 888888 漏洞时不会碰到它，桥接不再依赖那个后门。
  * 双重限制：① 来源必须是回环地址（127.0.0.1 / ::1）；② `X-Service-Token` 必须与
    密钥文件内容**定时安全比较**一致。
  * 密钥放在**独立文件** `/opt/flower-shop/service-token.txt`（root:flowerapp 0640），
    不污染对方的 config.json。
  * **失败关闭**：密钥文件不存在/为空 → 该端点一律 403。
  * 签发流程**照抄 phone-login**（userTokens + rememberUserSession + writeData snapshot），
    因此 `orders/create` 的 `getUserAuthRecord(token).openid` 行为完全一致。

安全性（对齐 flower-shop-h5-channel.py 的约定）：
  字节级替换、锚点不唯一即中止、幂等（重复执行跳过）、语法失败自动回滚、改动前完整备份。
  插入的代码块为**纯 ASCII**，避免与文件里的历史乱码注释发生编码交互。
"""
import os, shutil, subprocess, sys, time, secrets

NODE = "/opt/node-v22.23.2-linux-x64/bin/node"

# 目标文件可传参（默认生产实例）；测试实例传 /opt/flower-shop-test/server.js
F = sys.argv[1] if len(sys.argv) > 1 else "/opt/flower-shop/server.js"
# 密钥文件与目标同目录（__dirname 即 server.js 所在目录），保证 JS 侧 path.join(__dirname,...) 能读到
TOKEN_FILE = os.path.join(os.path.dirname(F), "service-token.txt")
# 首个实例生成的密钥作为共享源，后续实例复用 → H5 侧只需配一个 MERCHANT_BRIDGE_SERVICE_TOKEN
SHARED_TOKEN_FILE = "/opt/flower-shop/service-token.txt"

TS = time.strftime("%Y%m%d-%H%M%S")
# 备份目录带实例名，避免两个实例互相覆盖
BK = "/root/backups-flower-shop/" + TS + "-" + os.path.basename(os.path.dirname(F))

MARK = b"app.post('/v1/auth/service-login'"
ANCHOR = b"app.post('/v1/auth/phone-login', (req, res) => {"

# 纯 ASCII 的插入块（中文一律用 \uXXXX 交给 JS 解释，避免 Python 字节字面量出现非 ASCII）
NEW = b"""// ---- [H5 bridge] service-to-service login: loopback only + X-Service-Token ----
// Purpose: H5 order bridge. Does NOT depend on the 888888 shortcut in phone-login.
// Fails closed: if the token file is missing/empty, this endpoint always returns 403.
const SERVICE_TOKEN_FILE = path.join(__dirname, 'service-token.txt');

function expectedServiceToken() {
  try {
    return String(fs.readFileSync(SERVICE_TOKEN_FILE, 'utf8') || '').trim();
  } catch (e) {
    return '';
  }
}

function isLoopbackRequest(req) {
  const remote = String((req.socket && (req.socket.remoteAddress || '')) || '');
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

function serviceTokenOk(req) {
  const expect = expectedServiceToken();
  if (!expect) return false;
  if (!isLoopbackRequest(req)) return false;
  const got = String(req.headers['x-service-token'] || '').trim();
  if (!got || got.length !== expect.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got, 'utf8'), Buffer.from(expect, 'utf8'));
  } catch (e) {
    return false;
  }
}

app.post('/v1/auth/service-login', (req, res) => {
  if (!serviceTokenOk(req)) return res.json({ code: 403, message: 'forbidden' });
  const phone = String((req.body && req.body.phone) || '').trim();
  if (!/^1[3-9]\\d{9}$/.test(phone)) return res.json({ code: 1, message: 'invalid phone' });
  const data = readData();
  if (!Array.isArray(data.users)) data.users = [];
  const openid = 'dev_' + phone;
  let user = data.users.find(item => item.phone === phone || item.openid === openid);
  if (!user) {
    user = {
      id: 'u' + Date.now(),
      openid,
      phone,
      nickname: '\\u7528\\u6237' + phone.slice(-4),
      avatar: '',
      createdAt: new Date().toISOString()
    };
    data.users.push(user);
  }
  const uinfo = {
    openid: user.openid || openid,
    phone,
    nickname: user.nickname || ('\\u7528\\u6237' + phone.slice(-4)),
    avatar: exposeUploadUrl(req, user.avatar || ''),
    gender: user.gender || '',
    birthday: user.birthday || '',
    privacyConsentVersion: user.privacyConsentVersion || '',
    privacyConsentedAt: user.privacyConsentedAt || ''
  };
  const session = { ...uinfo, avatar: toStoredUploadPath(uinfo.avatar), expiry: Date.now() + USER_TOKEN_EXPIRY };
  const token = crypto.randomBytes(32).toString('hex');
  userTokens[token] = session;
  rememberUserSession(data, token, session);
  writeData(data, { mode: 'snapshot' });
  res.json({ code: 0, data: { token, userInfo: uinfo }, message: 'ok' });
});

"""
# 上面的 \\d / \\u7528 写法：Python 源码里是 "\\d" → 落盘为 \d（JS 正则）；"\\u7528" → 落盘为 \u7528（JS 转义）
assert b"app.post('/v1/auth/service-login'" in NEW
assert all(c < 128 for c in NEW), "插入块必须是纯 ASCII"


def check(path):
    r = subprocess.Popen([NODE, "--check", path], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = r.communicate()[0].decode("utf-8", "replace")
    return r.returncode == 0, out


if not os.path.exists(F):
    sys.exit("找不到 " + F)

# ---------- 0) 密钥文件：优先复用本实例已有 → 其次复用共享源 → 都没有才新生成 ----------
if os.path.exists(TOKEN_FILE):
    token = open(TOKEN_FILE, "r", encoding="utf-8").read().strip()
    print("[0] 复用本实例已有密钥（长度 %d）" % len(token))
elif os.path.exists(SHARED_TOKEN_FILE):
    token = open(SHARED_TOKEN_FILE, "r", encoding="utf-8").read().strip()
    with open(TOKEN_FILE, "w", encoding="utf-8") as fh:
        fh.write(token + "\n")
    print("[0] 复用共享密钥源 -> 复制到", TOKEN_FILE, "（长度 %d）" % len(token))
else:
    token = secrets.token_hex(32)
    with open(TOKEN_FILE, "w", encoding="utf-8") as fh:
        fh.write(token + "\n")
    print("[0] 已生成新密钥 ->", TOKEN_FILE, "（长度 %d）" % len(token))
os.chmod(TOKEN_FILE, 0o640)
shutil.chown(TOKEN_FILE, user="root", group="flowerapp")
print("    权限:", oct(os.stat(TOKEN_FILE).st_mode & 0o777), "属主: root:flowerapp")

# ---------- 1) 备份 ----------
os.makedirs(BK, exist_ok=True)
shutil.copy2(F, os.path.join(BK, "server.js"))
print("[1] 备份 ->", os.path.join(BK, "server.js"))

with open(F, "rb") as fh:
    src = fh.read()

# ---------- 2) 幂等 + 插入 ----------
if MARK in src:
    print("[2] 已打过补丁（存在 service-login），跳过代码改动")
else:
    n = src.count(ANCHOR)
    assert n == 1, "锚点 phone-login 命中 %d 次（应为 1），已中止，未改动文件" % n
    print("[2] 锚点唯一性 OK")
    src = src.replace(ANCHOR, NEW + ANCHOR, 1)
    with open(F, "wb") as fh:
        fh.write(src)
    print("[2] 已插入 /v1/auth/service-login（仅新增，未改动 phone-login 任何一行）")

# ---------- 3) 语法校验，失败回滚 ----------
ok, out = check(F)
if not ok:
    shutil.copy2(os.path.join(BK, "server.js"), F)
    print("[3] 语法校验失败，已回滚！")
    print(out)
    sys.exit(1)
print("[3] node --check 通过")

print()
print("=" * 64)
print("密钥（下一步填进 H5 侧 /opt/twlh5-api/.env 的 MERCHANT_BRIDGE_SERVICE_TOKEN）:")
print(token)
print("=" * 64)
