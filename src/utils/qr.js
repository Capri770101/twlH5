// 链接转二维码（data URL）。
// 用途：PC 端 Native 支付权限未开通时的兜底 —— 二维码内容不是微信支付码，
//      而是「手机支付页」的链接；用户用手机微信扫码打开该页，在手机内用 JSAPI 付款。
// qrcode 用动态 import 懒加载：只有 PC 支付这条路才会下载它，不进首屏。
export async function linkQrDataUrl(text, size = 320) {
  try {
    const QR = await import('qrcode')
    return await QR.toDataURL(String(text), { margin: 1, width: size })
  } catch (e) {
    console.warn('[qr] 生成二维码失败：', e && e.message)
    return ''
  }
}

/** 手机支付页链接：先经 /login 保证拿到账号（手机微信内自动走网页授权），再回到支付页 */
export function mobilePayUrl(outTradeNo) {
  const origin = (typeof location !== 'undefined' && location.origin) || ''
  const redirect = '/pay/' + encodeURIComponent(String(outTradeNo))
  return origin + '/login?redirect=' + encodeURIComponent(redirect)
}
