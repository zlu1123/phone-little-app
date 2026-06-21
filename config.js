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
  // develop: 'http://124.222.38.87:8090',
  // develop: 'https://www.ybxz.top/prod-api/',
  develop: 'http://43.164.129.96:8090',
  trial: 'https://www.ybxz.top/prod-api/',
  release: 'https://www.ybxz.top/prod-api/'
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
  ocrImageCheck: '/image/ocr/imchect',
  // 登录接口
  login: '/login',
  // 查询保修信息
  queryActiveInfo: '/wechat/api/queryActiveInfo',
  // 查询个人订单信息
  queryOrderList: '/wechat/api/queryOrderList',
  // 查询手机型号列表
  queryPhoneTypeList: '/06/api/queryPhoneTypeList',
  // 查询生效协议
  getContract: '/wechat/api/getContract',
  // 协议签订（同时上传签名图片，multipart/form-data）
  signContract: '/wechat/api/signContract',
  // 留资 - 新增用户信息
  insertLeaveInformation: '/wechat/api/insertLeaveInformation',
  // 留资 - 查询用户信息列表（模糊查询）
  getLeaveInformationList: '/wechat/api/getLeaveInformationList',
  // 已签约待赔付 - 查询已签约订单列表
  querySignContractOrderList: '/wechat/api/querySignContractOrderList',
  // 已签约待赔付 - 新增赔付订单
  insertCompensationOrder: '/wechat/api/insertCompensationOrder',
  // 待审核 - 查询赔付订单列表（带status筛选）
  getCompensationOrderList: '/wechat/api/getCompensationOrderList',
  // 待审核 - 修改赔付订单（通过/驳回）
  updateCompensationOrder: '/wechat/api/updateCompensationOrder'
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
