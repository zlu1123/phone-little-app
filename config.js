// config.js
// 统一维护后端访问地址、接口路径等配置

/**
 * 获取当前小程序环境：develop / trial / release
 */
const getEnvVersion = () => {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
    return info?.miniProgram?.envVersion || 'develop';
  } catch (_err) {
    return 'develop';
  }
};

/**
 * 按环境配置后端 baseURL
 *
 * 说明：
 * - develop：开发版（开发者工具/真机开发版）
 * - trial：体验版
 * - release：正式版
 */
const API_BASE_BY_ENV = {
  develop: 'http://43.164.129.96:8080',
  trial: 'http://43.164.129.96:8080',
  release: 'http://43.164.129.96:8080'
};

const getApiBase = () => {
  const envVersion = getEnvVersion();
  return API_BASE_BY_ENV[envVersion] || API_BASE_BY_ENV.develop;
};

/**
 * 统一维护接口路径（只写 path，不要写域名/端口）
 */
const API_ENDPOINTS = {
  // 后端 OCR 接口（图片识别）
  ocrImageCheck: '/image/ocr/imchect'
};

const joinUrl = (baseUrl, path) => {
  const safeBase = String(baseUrl || '').replace(/\/+$/, '');
  const safePath = String(path || '').replace(/^\/+/, '');
  if (!safeBase) return `/${safePath}`;
  return `${safeBase}/${safePath}`;
};

/**
 * 构建完整接口 URL
 */
const buildApiUrl = path => joinUrl(getApiBase(), path);

/**
 * 功能开关：统一在这里维护
 */
const FEATURE_FLAGS = {
  // 是否启用微信服务市场 OCR（wx.serviceMarket.invokeService）
  enableWechatServiceMarketOcr: true,

  // 开发者工具里经常会出现 "http://CDN" 500（CDN 上传失败）导致一直报错；默认关闭
  enableWechatServiceMarketOcrInDevtools: false
};

const getPlatform = () => {
  try {
    return wx.getSystemInfoSync && wx.getSystemInfoSync().platform;
  } catch (_err) {
    return '';
  }
};

const isDevtools = () => getPlatform() === 'devtools';

const isWechatOcrEnabled = () => {
  if (!FEATURE_FLAGS.enableWechatServiceMarketOcr) return false;
  if (isDevtools() && !FEATURE_FLAGS.enableWechatServiceMarketOcrInDevtools) {
    return false;
  }
  return true;
};

module.exports = {
  API_BASE_BY_ENV,
  API_ENDPOINTS,
  FEATURE_FLAGS,
  buildApiUrl,
  getApiBase,
  getEnvVersion,
  getPlatform,
  isDevtools,
  isWechatOcrEnabled
};
