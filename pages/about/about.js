Page({
  handleBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/imei-query/imei-query' });
      }
    });
  }
});
