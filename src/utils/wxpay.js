// 微信内 H5 调起支付（JSAPI）。复用后端返回的调起参数，经 WeixinJSBridge 拉起微信收银台。
// 说明：公众号网页标准做法可用 JS-SDK wx.chooseWXPay（需 jsapi_ticket 签名），
// 但 WeixinJSBridge 在微信 WebView 内同样可用且无需额外 jsapi_ticket，适合快速接入。

/** 是否微信内（手机或电脑都算） */
export function isWeChat() {
  return typeof navigator !== 'undefined' && /micromessenger/i.test(navigator.userAgent)
}

/**
 * 是否**手机**微信——只有这里能用 JSAPI 支付。
 * ⚠️ 微信电脑版（Windows/Mac）UA 里同样带 MicroMessenger，但**不支持 JSAPI 支付**
 *   （调 WeixinJSBridge 会报「调用支付JSAPI缺少参数:total_fee」这类兜底错误），
 *   正确做法是走 Native 扫码。所以判断通道不能只看 isWeChat()。
 */
export function isMobileWeChat() {
  if (!isWeChat()) return false
  const ua = navigator.userAgent
  return !/windows nt|macintosh|windows phone/i.test(ua)
}

/**
 * 把支付失败原因翻译成一句给用户看的话。
 * 背景：微信的报错对用户毫无意义（例如「调用支付JSAPI缺少参数:total_fee」），
 * 而且最常见的两种情况分别该给不同指引 —— 环境不支持 vs 商户权限未开通。
 */
export function payFailHint(err) {
  const m = String((err && err.message) || '')
  if (/cancel/i.test(m)) return '已取消支付'
  if (/NO_AUTH|未开通|未授权/.test(m)) {
    return '当前环境暂不支持支付，请在手机微信中打开本页完成支付'
  }
  if (/请在手机微信中打开|环境不支持/.test(m)) return m
  if (/total_fee|JSAPI|pay_failed|get_brand_wcpay_request:fail/i.test(m)) {
    return '当前环境无法调起微信支付，请在手机微信中打开本页完成支付'
  }
  return '订单已创建，可稍后在订单页完成支付'
}

// 调起微信支付。params 来自后端 payOrder 的 JSAPI 返回：
// { appId, timeStamp, nonceStr, package, signType, paySign }
export function invokeWxPay(params) {
  return new Promise((resolve, reject) => {
    // 提前挡住脏参数：package 必须是 `prepay_id=xxx`，否则微信会给含糊的
    // 「调用支付JSAPI缺少参数:total_fee」，极难定位
    const pkg = String((params && params.package) || '')
    if (!/^prepay_id=\S+/.test(pkg)) {
      reject(new Error('支付参数不完整（package 异常），请重新下单'))
      return
    }
    if (!params.appId || !params.paySign) {
      reject(new Error('支付参数不完整，请重新下单'))
      return
    }
    const call = () => {
      if (typeof WeixinJSBridge === 'undefined') {
        reject(new Error('当前环境不支持微信支付，请在手机微信中打开本页'))
        return
      }
      WeixinJSBridge.invoke(
        'getBrandWCPayRequest',
        {
          appId: params.appId,
          timeStamp: String(params.timeStamp),
          nonceStr: params.nonceStr,
          package: pkg,
          signType: params.signType,
          paySign: params.paySign
        },
        (res) => {
          if (res && res.err_msg === 'get_brand_wcpay_request:ok') resolve(res)
          else if (res && res.err_msg === 'get_brand_wcpay_request:cancel') reject(new Error('cancel'))
          else reject(new Error((res && res.err_msg) || 'pay_failed'))
        }
      )
    }
    if (typeof WeixinJSBridge !== 'undefined') {
      call()
    } else {
      document.addEventListener('WeixinJSBridgeReady', call, false)
      setTimeout(() => reject(new Error('微信支付桥超时未就绪，请在手机微信中打开本页')), 8000)
    }
  })
}
