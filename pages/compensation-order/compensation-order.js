const { buildApiUrl, API_ENDPOINTS } = require('../../config');
const { request } = require('../../utils/request');

Page({
  data: {
    // 视图状态：'entry' 初始入口 | 'search' 搜索表单 | 'result' 查询结果
    viewState: 'entry',

    // 搜索表单
    searchName: '',
    searchPhoneNum: '',
    searchImei: '',

    // 查询结果
    orderList: [],
    lastSearchLabel: '',
    isSearching: false,
    isSubmitting: false
  },

  // 返回按钮
  handleBack() {
    if (this.data.viewState !== 'entry') {
      // 从搜索/结果页回到入口页
      this.setData({
        viewState: 'entry',
        searchName: '',
        searchPhoneNum: '',
        searchImei: '',
        orderList: [],
        lastSearchLabel: ''
      });
    } else {
      // 在入口页则返回上一页
      wx.navigateBack({ delta: 1 });
    }
  },

  // 点击「搜索已签约订单」
  handleGoSearch() {
    this.setData({
      viewState: 'search',
      searchName: '',
      searchPhoneNum: '',
      searchImei: ''
    });
  },

  // 搜索表单 - 输入绑定
  handleNameChange(e) {
    this.setData({ searchName: e.detail });
  },
  handlePhoneNumChange(e) {
    this.setData({ searchPhoneNum: e.detail });
  },
  handleImeiChange(e) {
    this.setData({ searchImei: e.detail });
  },

  // 执行搜索
  handleSearch() {
    const name = this.data.searchName.trim();
    const phoneNum = this.data.searchPhoneNum.trim();
    const imei = this.data.searchImei.trim();

    if (!name && !phoneNum && !imei) {
      wx.showToast({ title: '请至少输入一个查询条件', icon: 'none' });
      return;
    }

    const params = {};
    if (name) params.name = name;
    if (phoneNum) params.phoneNum = phoneNum;
    if (imei) params.signatureImei = imei;

    // 构建搜索条件展示文本
    const labelParts = [];
    if (name) labelParts.push('姓名: ' + name);
    if (phoneNum) labelParts.push('手机号: ' + phoneNum);
    if (imei) labelParts.push('签约IMEI: ' + imei);

    this.setData({
      isSearching: true,
      orderList: [],
      lastSearchLabel: labelParts.join('  ')
    });

    request({
      url: buildApiUrl(API_ENDPOINTS.querySignContractOrderList),
      method: 'GET',
      data: params,
      success: (res) => {
        const data = res.data;
        console.log('已签约订单列表返回:', data);
        if (data.code === 200 && Array.isArray(data.rows)) {
          this.setData({
            orderList: data.rows,
            viewState: 'result'
          });
          if (data.rows.length === 0) {
            wx.showToast({ title: '未找到匹配的签约订单', icon: 'none' });
          }
        } else {
          wx.showToast({ title: data.msg || '查询失败', icon: 'none' });
        }
      },
      fail: (error) => {
        console.error('查询已签约订单失败:', error);
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      },
      complete: () => {
        this.setData({ isSearching: false });
      }
    });
  },

  // 重新搜索
  handleReSearch() {
    this.setData({
      viewState: 'search',
      searchName: '',
      searchPhoneNum: '',
      searchImei: '',
      orderList: [],
      lastSearchLabel: ''
    });
  },

  // 发起赔付
  handleInsertCompensationOrder(e) {
    const { index } = e.currentTarget.dataset;
    const order = this.data.orderList[index];
    if (!order) return;

    const infoId = order.infoId;

    if (!infoId) {
      wx.showToast({ title: '缺少留资信息，无法发起赔付', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认赔付',
      content: '确定为该订单发起赔付吗？',
      success: (res) => {
        if (!res.confirm) return;

        this.setData({ isSubmitting: true });

        request({
          url: buildApiUrl(API_ENDPOINTS.insertCompensationOrder),
          method: 'POST',
          data: {
            orderId: order.id,
            infoId: Number(infoId)
          },
          success: (result) => {
            const body = result.data;
            if (body.code === 200) {
              wx.showToast({ title: '赔付申请成功', icon: 'success' });
              const updatedList = this.data.orderList.filter((_, i) => i !== index);
              this.setData({ orderList: updatedList });
            } else {
              wx.showToast({ title: body.msg || '赔付申请失败', icon: 'none' });
            }
          },
          fail: (error) => {
            console.error('赔付申请失败:', error);
            wx.showToast({ title: '网络异常，请重试', icon: 'none' });
          },
          complete: () => {
            this.setData({ isSubmitting: false });
          }
        });
      }
    });
  }
});
