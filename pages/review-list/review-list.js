const { buildApiUrl, API_ENDPOINTS } = require('../../config');
const { formatDateTime } = require('../../utils/date');
const { request } = require('../../utils/request');

/** 格式化列表中每条记录的时间字段 */
const formatRowsTime = (rows) =>
  (rows || []).map((row) => ({
    ...row,
    createTime: formatDateTime(row.createTime, row.createTime || ''),
    updateTime: formatDateTime(row.updateTime, row.updateTime || '')
  }));

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
    pendingAction: ''
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
