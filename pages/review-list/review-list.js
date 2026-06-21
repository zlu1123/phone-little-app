const { buildApiUrl, API_ENDPOINTS } = require('../../config');
const { request } = require('../../utils/request');

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

    // 金额输入弹窗
    showAmountDialog: false,
    amountInput: '',
    currentReviewIndex: -1,

    // 驳回原因弹窗
    showRejectDialog: false,
    rejectReasonInput: ''
  },

  onLoad() {
    this.fetchReviewList();
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
          const rows = body.rows;
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
          const rows = body.rows;
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
      // 通过：先弹出金额输入框
      this.setData({
        showAmountDialog: true,
        amountInput: '',
        currentReviewIndex: index
      });
    } else {
      // 驳回：弹出原因输入框
      this.setData({
        showRejectDialog: true,
        rejectReasonInput: '',
        currentReviewIndex: index
      });
    }
  },

  // 金额输入
  handleAmountInput(e) {
    this.setData({ amountInput: e.detail.value });
  },

  // 金额输入确认 → 二次确认
  handleAmountConfirm() {
    const amount = parseFloat(this.data.amountInput);
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '请输入有效的赔付金额', icon: 'none' });
      return;
    }

    // 关闭金额弹窗
    this.setData({ showAmountDialog: false });

    const index = this.data.currentReviewIndex;

    // 二次确认
    wx.showModal({
      title: '确认通过',
      content: `赔付金额：¥${amount.toFixed(2)}\n确定通过该订单的审核吗？`,
      success: (res) => {
        if (!res.confirm) return;
        this.submitReview(index, 1, amount, '完成');
      }
    });
  },

  // 关闭金额弹窗
  handleCloseAmountDialog() {
    this.setData({ showAmountDialog: false, currentReviewIndex: -1 });
  },

  // 驳回原因输入
  handleRejectReasonInput(e) {
    this.setData({ rejectReasonInput: e.detail.value });
  },

  // 驳回原因确认
  handleRejectReasonConfirm() {
    const reason = this.data.rejectReasonInput.trim();
    if (!reason) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' });
      return;
    }

    this.setData({ showRejectDialog: false });
    const index = this.data.currentReviewIndex;

    wx.showModal({
      title: '确认驳回',
      content: `驳回原因：${reason}\n确定驳回该订单吗？`,
      success: (res) => {
        if (!res.confirm) return;
        this.submitReview(index, 2, 0, '', reason);
      }
    });
  },

  // 关闭驳回弹窗
  handleCloseRejectDialog() {
    this.setData({ showRejectDialog: false, currentReviewIndex: -1 });
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
