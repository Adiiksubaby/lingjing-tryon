/** App 端设 VITE_UNI_NATIVE_WEBVIEW=1，试衣页改为 web-view，而不是直接挂 WebGL。 */
export const useNativeWebView = import.meta.env.VITE_UNI_NATIVE_WEBVIEW === '1';

export function tryOnWebViewUrl(topId: string, bottomId: string) {
  const url = new URL('/tryon', window.location.origin);
  url.searchParams.set('host', 'webview');
  url.searchParams.set('top', topId);
  url.searchParams.set('bottom', bottomId);
  return url.toString();
}
