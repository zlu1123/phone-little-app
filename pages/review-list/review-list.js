const { buildApiUrl, API_ENDPOINTS, BUSINESS_CONSTANTS } = require('../../config');
const { formatDateTime } = require('../../utils/date');
const { request } = require('../../utils/request');

/** 格式化列表中每条记录的时间字段 */
const formatRowsTime = (rows) =>
  (rows || []).map((row) => ({
    ...row,
    createTime: formatDateTime(row.createTime, row.createTime || ''),
    updateTime: formatDateTime(row.updateTime, row.updateTime || '')
  }));

/** 品牌码 → 品牌名（与管理端 ruoyi-ui 的 phoneType 映射一致） */
const getBrandName = (phoneType) => {
  const brand = BUSINESS_CONSTANTS.DEFAULT_PHONE_BRANDS.find((b) => b.value === String(phoneType));
  return brand ? brand.name : phoneType || '';
};

/** 订单类型：与管理端 ruoyi-ui/src/views/info/list/index.vue 的 skipApiCall slot 一致 */
const getOrderType = (d) => {
  if (d.skipApiCall === 1 && d.oldPhoneStatus === 0) return '无旧手机新手机签约';
  if (d.oldPhoneStatus === 0) return '无旧手机';
  if (d.skipApiCall === 1 && d.oldPhoneStatus === 1) return '旧手机丢失/遗失新签约';
  if (d.oldPhoneStatus === 1) return '旧手机丢失/遗失去亚丁';
  return '旧手机识别';
};

/** 渠道：与管理端 getChannel 逻辑一致 */
const getChannel = (d) => {
  if (d.channel) return d.channel;
  if (d.skipApiCall === 0) {
    const coverage = (d.coverage || '').substring(0, 10);
    const sysTime = (d.sysTime || '').substring(0, 10);
    if (!coverage || !sysTime) return '自有';
    return coverage > sysTime ? '亚丁' : '自有';
  }
  if (d.oldPhoneStatus === 0) return '自有';
  return d.oldPhoneUsageMonths === 0 ? '亚丁' : '自有';
};

/** 旧手机使用月数：与管理端展示一致 */
const getUsageMonths = (v) => {
  if (v === 0) return '小于24个月';
  if (v === 24) return '大于24个月';
  return v ? `> ${v}` : '-';
};

/** 旧手机质保状态：与管理端一致 */
const getWarrantyStatus = (d) => {
  if (d.activated === undefined || d.activated === null) return '--';
  if (!d.activated) return '未激活';
  if (!d.coverage) return '已激活';
  if (!d.sysTime) return '已激活';
  const coverageTime = new Date(String(d.coverage).replace(/\//g, '-')).getTime();
  const sysTime = new Date(String(d.sysTime).replace(/\//g, '-')).getTime();
  if (Number.isNaN(coverageTime) || Number.isNaN(sysTime)) return '已激活';
  return coverageTime <= sysTime ? '已过保' : '保修中';
};

/** 日期字符串 → yyyy-MM-dd（与管理端 de() 一致） */
const formatDate = (v) => {
  if (v === null || v === undefined || v === '') return v;
  const s = String(v).replace(/\//g, '-').trim();
  return s.length >= 10 ? s.substring(0, 10) : s;
};

/** 把详情对象转成 [{label, value}] 展示行，标签与计算逻辑对齐管理端 */
const buildDetailRows = (d) => {
  const rows = [];
  const push = (label, value) => {
    if (value !== null && value !== undefined && value !== '') rows.push({ label, value: String(value) });
  };

  push('订单ID', d.id);
  push('订单类型', getOrderType(d));
  push('渠道', getChannel(d));
  push('留资人姓名', d.name);
  push('留资人电话', d.phoneNum);
  push('店员名称', d.nickName);
  push('所属门店', d.storeName);
  push('手机品牌', getBrandName(d.phoneType));
  push('手机型号', d.model);
  push('序列号', d.sn);
  push('IMEI1', d.imei1);
  push('IMEI2', d.imei2);
  push('旧手机使用月数', getUsageMonths(d.oldPhoneUsageMonths));
  push('激活日期', formatDate(d.activateDate));
  push('鸭宝查询保修到期时间', formatDate(d.coverage));
  push('系统时间', d.sysTime);
  rows.push({ label: '鸭宝激活状态', value: d.activated ? '已激活' : '--' });
  rows.push({ label: '旧手机质保状态', value: getWarrantyStatus(d) });
  push('签名型号', d.signatureModel);
  push('签名IMEI', d.signatureImei);
  push('签名日期', d.signatureDate);
  push('创建时间', formatDateTime(d.createTime, ''));

  return rows;
};

Page({
  data: {
    orderList: [],
    isLoading: false,
    isOperating: false,
    loadingMore: false,
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,

    // 底部安全区距离（px），防止系统横条遮挡底部内容
    bottomSafe: 0,

    // 金额输入弹窗
    showAmountDialog: false,
    amountInput: '',
    currentReviewIndex: -1,

    // 驳回原因弹窗
    showRejectDialog: false,
    rejectReasonInput: '',
    pendingAction: '',

    // 订单详情弹窗
    showDetailDialog: false,
    orderDetailRows: []
  },

  onLoad() {
    this.initSafeArea();
    this.fetchReviewList();
  },

  // 计算底部安全区距离（px），防止系统手势横条遮挡底部内容
  initSafeArea() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      let bottomSafe = 0;
      if (systemInfo.safeArea && typeof systemInfo.safeArea.bottom === 'number') {
        bottomSafe = Math.max(0, systemInfo.screenHeight - systemInfo.safeArea.bottom);
      }
      // 部分安卓机型 safeArea 返回全屏，但手势横条仍会遮挡底部，兜底预留
      if (bottomSafe === 0 && systemInfo.platform === 'android') {
        bottomSafe = 24;
      }
      this.setData({ bottomSafe });
    } catch (e) {
      console.error('获取安全区信息失败:', e);
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, orderList: [] });
    this.fetchReviewList();
    wx.stopPullDownRefresh();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMore();
    }
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  // 查看订单详情：点击卡片右上角「查看详情」→ 调管理端详情接口 → 弹窗展示
  handleViewDetail(e) {
    const orderId = e.currentTarget.dataset.orderId;
    if (!orderId) return;

    wx.showLoading({ title: '加载详情中...', mask: true });
    request({
      url: buildApiUrl(API_ENDPOINTS.getOrderDetail),
      method: 'GET',
      data: { id: orderId },
      success: (res) => {
        const body = res.data;
        if (body && body.code === 200) {
          this.setData({
            orderDetailRows: buildDetailRows(body),
            showDetailDialog: true
          });
        } else {
          wx.showToast({ title: (body && body.msg) || '查询详情失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('查询订单详情失败:', err);
        wx.showToast({ title: '网络异常', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  // 关闭订单详情弹窗
  onCloseDetailDialog() {
    this.setData({ showDetailDialog: false, orderDetailRows: [] });
  },

  fetchReviewList() {
    this.setData({ isLoading: true });

    request({
      url: buildApiUrl(API_ENDPOINTS.getCompensationOrderList),
      method: 'GET',
      data: { status: 0, page: this.data.page, pageSize: this.data.pageSize },
      success: (res) => {
        const body = res.data;
        if (body.code === 200 && Array.isArray(body.rows)) {
          const rows = formatRowsTime(body.rows);
          this.setData({
            orderList: rows,
            total: body.total || 0,
            hasMore: rows.length >= this.data.pageSize
          });
        } else {
          wx.showToast({ title: body.msg || '查询失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('查询待审核列表失败:', err);
        wx.showToast({ title: '网络异常', icon: 'none' });
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },

  loadMore() {
    this.setData({ loadingMore: true, page: this.data.page + 1 });

    request({
      url: buildApiUrl(API_ENDPOINTS.getCompensationOrderList),
      method: 'GET',
      data: { status: 0, page: this.data.page, pageSize: this.data.pageSize },
      success: (res) => {
        const body = res.data;
        if (body.code === 200 && Array.isArray(body.rows)) {
          const rows = formatRowsTime(body.rows);
          const newList = this.data.orderList.concat(rows);
          this.setData({
            orderList: newList,
            total: body.total || 0,
            hasMore: rows.length >= this.data.pageSize
          });
        }
      },
      complete: () => {
        this.setData({ loadingMore: false });
      }
    });
  },

  // 审核操作入口
  handleReview(e) {
    const { index, action } = e.currentTarget.dataset;
    const order = this.data.orderList[index];
    if (!order) return;

    if (action === 'approve') {
      this.setData({
        showAmountDialog: true,
        amountInput: '',
        currentReviewIndex: index,
        pendingAction: 'approve'
      });
    } else {
      this.setData({
        showRejectDialog: true,
        rejectReasonInput: '',
        currentReviewIndex: index,
        pendingAction: 'reject'
      });
    }
  },

  // 金额弹窗 before-close：金额可选，不强制校验
  beforeAmountClose(action) {
    return new Promise((resolve) => {
      resolve(true);
    });
  },

  // 金额弹窗关闭后 → 二次确认（金额可选）
  onAmountDialogClosed() {
    if (this.data.pendingAction !== 'approve') return;
    const inputVal = (this.data.amountInput || '').trim();
    const amount = inputVal ? parseFloat(inputVal) : 0;
    const hasAmount = inputVal && !isNaN(amount) && amount > 0;

    const index = this.data.currentReviewIndex;
    const confirmContent = hasAmount
      ? `赔付金额：¥${amount.toFixed(2)}\n确定通过该订单的审核吗？`
      : `未填写赔付金额\n确定通过该订单的审核吗？（后续可在管理端修改金额）`;

    wx.showModal({
      title: '确认通过',
      content: confirmContent,
      success: (res) => {
        if (!res.confirm) {
          this.setData({ pendingAction: '' });
          return;
        }
        this.submitReview(index, 1, hasAmount ? amount : 0, '完成');
      }
    });
  },

  // 金额输入
  handleAmountInput(e) {
    this.setData({ amountInput: e.detail });
  },

  // 关闭金额弹窗
  handleCloseAmountDialog() {
    this.setData({ showAmountDialog: false, currentReviewIndex: -1, pendingAction: '' });
  },

  // 驳回弹窗 before-close：校验原因非空
  beforeRejectClose(action) {
    return new Promise((resolve) => {
      if (action === 'confirm') {
        const reason = (this.data.rejectReasonInput || '').trim();
        if (!reason) {
          wx.showToast({ title: '请填写驳回原因', icon: 'none' });
          resolve(false);
          return;
        }
        resolve(true);
      } else {
        resolve(true);
      }
    });
  },

  // 驳回弹窗关闭后 → 二次确认
  onRejectDialogClosed() {
    if (this.data.pendingAction !== 'reject') return;
    const reason = (this.data.rejectReasonInput || '').trim();
    if (!reason) return;

    const index = this.data.currentReviewIndex;
    wx.showModal({
      title: '确认驳回',
      content: `驳回原因：${reason}\n确定驳回该订单吗？`,
      success: (res) => {
        if (!res.confirm) {
          this.setData({ pendingAction: '' });
          return;
        }
        this.submitReview(index, 2, 0, '', reason);
      }
    });
  },

  // 驳回原因输入
  handleRejectReasonInput(e) {
    this.setData({ rejectReasonInput: e.detail });
  },

  // 关闭驳回弹窗
  handleCloseRejectDialog() {
    this.setData({ showRejectDialog: false, currentReviewIndex: -1, pendingAction: '' });
  },

  // 提交审核
  submitReview(index, status, amount, remark, rejectionReason) {
    const order = this.data.orderList[index];
    if (!order) return;

    this.setData({ isOperating: true });

    request({
      url: buildApiUrl(API_ENDPOINTS.updateCompensationOrder),
      method: 'POST',
      data: {
        id: order.id,
        amount,
        status,
        rejectionReason: rejectionReason || '',
        remark: remark || ''
      },
      success: (result) => {
        const body = result.data;
        if (body.code === 200) {
          const label = status === 1 ? '已通过' : '已驳回';
          wx.showToast({ title: label, icon: 'success' });
          const updatedList = this.data.orderList.filter((_, i) => i !== index);
          this.setData({ orderList: updatedList, total: this.data.total - 1 });
        } else {
          wx.showToast({ title: body.msg || '操作失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('审核操作失败:', err);
        wx.showToast({ title: '网络异常', icon: 'none' });
      },
      complete: () => {
        this.setData({ isOperating: false, currentReviewIndex: -1 });
      }
    });
  }
});
