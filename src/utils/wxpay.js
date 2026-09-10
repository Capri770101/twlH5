// 微信内 H5 调起支付（JSAPI）。复用后端返回的调起参数，经 WeixinJSBridge 拉起微信收银台。
// 说明：公众号网页标准做法可用 JS-SDK wx.chooseWXPay（需 jsapi_ticket 签名），
// 但 WeixinJSBridge 在微信 WebView 内同样可用且无需额外 jsapi_ticket，适合快速接入。

export function isWeChat() {
  return typeof navigator !== 'undefined' && /micromessenger/i.test(navigator.userAgent)
}

// 调起微信支付。params 来自后端 payOrder 的 JSAPI 返回：
// { appId, timeStamp, nonceStr, package, signType, paySign }
export function invokeWxPay(params) {
  return new Promise((resolve, reject) => {
    const call = () => {
      if (typeof WeixinJSBridge === 'undefined') {
        reject(new Error('WeixinJSBridge 未就绪（非微信环境）'))
        return
      }
      WeixinJSBridge.invoke(
        'getBrandWCPayRequest',
        {
          appId: params.appId,
          timeStamp: String(params.timeStamp),
          nonceStr: params.nonceStr,
          package: params.package,
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
      setTimeout(() => reject(new Error('微信支付桥超时未就绪')), 8000)
    }
  })
}
